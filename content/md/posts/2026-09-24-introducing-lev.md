{:title "Introducing Lev" :layout :post, :tags ["programming" "clojure" "jolt" "lev" "jev"]}

A few weeks ago TypeSafe released [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), and their demo of Jev playing Doom in real-time got a lot of excitement. Their argument is that chat models are great at conversation while still being awkward at doing real world tasks which often involve deciding things. Jev is a hosted classifier model which takes unstructured state as input and produces typed probabilistic decisions in a single pass. And what the Doom demo illustrates is that the model is able to do this reliably under a few hundred milliseconds. Since the responses are structured data, there is nothing that can be hallucinated, although the model can still misunderstand the question and produce a wrong classification. They call the category System One models, borrowing Kahneman's name for the fast automatic kind of thinking.

Naturally, people quickly pointed out that the idea behind Jev has been around for a while, and [a whole slew of open source projects](https://benchmarkheaven.com/jev-models) have popped up implementing the idea. I got curious to see how much work it would take to implement my own Jevlike using [Jolt](https://github.com/jolt-lang/jolt) since I can use FFI to drive engines like llama.cpp easily enough.

I wanted to see how well an open weights model running on my own hardware would perform, and to experiment with having an escape hatch for the cases where a fast classifier fails to produce a high confidence answer. So, I proceeded to build [Lev](https://github.com/jlt-commons/lev) which is a decision engine exposing the same wire API as Jev.

This post explains how the classifier tier works, where these models fail, what the benchmarks say about actual Jev performance when people measure it independently, and how the escalation model in Lev addresses these shortcomings.

## What a System One model actually does

An LLM reads input left to right and has to commit to each token before seeing what comes next. When you ask a chat model the same question, it generates an answer token by token, you parse the string, and if you want a confidence interval you have to ask for one in the prompt. Generation is the right tool for open-ended work, but it turns into an expensive detour when there is a known set of answers. Encoder models like ModernBERT are a better fit here because they read your entire input bidirectionally in one go. So, for a choice question, each option gets a marker token placed in the sequence next to the option's text. After the forward pass, a small head turns each marker's final representation into a score, and a softmax across the scores hands you a probability for every option simultaneously.

And that's the main part of the reason why these models are so fast. A 395M parameter encoder doing one pass over a few hundred tokens is cheap, and the cost grows only a little with the number of options it sees. These checkpoints were also trained with reinforcement learning on calibrated decisions, which means the probabilities are supposed to track how often the model is right in practice, so a 0.9 is meant to represent being right nine times out of ten. The confidence interval is the key to deciding how likely the result is to be correct, and we'll come back to it later since it carries a lot of weight in the design.

## Where classifiers fall down

The failure modes for BERT style models appear to be consistent across every family I looked at. The first one is that classifiers interpolate but they aren't able to do deduction. They do great on traffic that looks like their training data, but if the question is a double negative or some other adversarial phrasing then they crumble. Lev's own adversarial set, 144 authored three-way decisions, was built to trip exactly this type of failure. The encoder tier models consistently score 61 to 67 percent on it. On the other hand, a local 2.5B LLM with thinking enabled scores 95 percent on the same set, because it runs a reasoning loop before answering. The downside is that running an LLM with reasoning on takes around 3 seconds using the GPU on my laptop, so it's not a drop in replacement for a classifier if you actually care about performance or efficiency.

Another failure is abstention, when you ask a classifier "is there enough information here to answer" it will almost always say yes, because the abstaining option rarely won during training. Lev's encoder picks the insufficient-evidence option 18 times where the data says it should pick it 36 times, and that's the exact same shape that shows up in Jev incidentally. An independent benchmark found it admits ignorance on 49.7 percent of forced-uncertainty items, where the LLMs tested admitted it 97 to 100 percent of the time.

There is also position bias to consider, where shuffling the order of the options and the answer sometimes changes. Around 13 percent of Jev's choices flip under permutation in one published measurement, and Lev's encoder also moves about 14 percent of its choices the same way. So, any system built on these models has to ensure that the option order the model sees as input is normalized.

Finally, there is the problem of overconfidence since the model can be sure of its output while being wrong. Softmax outputs are not honest odds, and their calibration being fitted on one distribution ends up drifting when the traffic looks different. The worst measured Jev calibration error in that same independent run was 0.246, and on the DAIR Emotion benchmark Jev scored 0.480 putting zero probability on the true label for 16 percent of examples.

None of this says the category is bad, it just means that the approach works best for a specific set of scenarios, and problems outside this set can be escalated to a different type of model. TypeSafe's own evals, for what it's worth, score Jev against the consensus of two frontier LLMs rather than against ground truth, so agreement with a big model is doing the work correctness would normally do. Independent measurements land Jev at 66 percent on a 150-passage test, tying Claude Haiku 4.5, and at 76.3 percent on a 77-way banking intent set against 81.3 for an open 120B model. So, the approach gives you respectable results at much lower cost while having honest-ish uncertainty. It's clearly a useful tool if you understand what types of problems to apply it to.

## Route first, escalate second

The main innovation with Lev is that it routes between two very different kinds of model under the hood. First, a small classifier encoder is used that answers in about a tenth of a second on a laptop CPU, and when a low confidence answer is produced, the query is escalated to a local thinking LLM. The whole project compiles to a single standalone binary that runs entirely offline.

The fast tier is a set of encoder checkpoints from the [convaiinnovations/laya](https://huggingface.co/convaiinnovations/laya/tree/main) release on the Hub, Apache-2.0 weights: an English ModernBERT-large, a typed-decisions variant with a longer context, and a multilingual one covering a hundred plus languages. A router looks at the request and picks an encoder by content and language unless you name the model explicitly. These run in one forward pass that covers every question in the call, roughly 95 milliseconds for a short question on my laptop's CPU.

The slow tier is any GGUF chat model loaded through a statically linked llama.cpp. It reads the state and scores its candidate answers by their token log probabilities, which is how you can pry honest numbers out of a generative model. Lev configures Qwen3.5-4B as its escalation model by default. Turns out that scoring allows skipping the thinking pass entirely, and still scores 95.1 percent on the adversarial 144-case set I mentioned earlier.

Now, if you'll recall, the LLM approach has a significant performance drawback running using stock llama.cpp, but it turns out that there is a brilliant [parallel decision fork of llama.cpp](https://github.com/thecodacus/llama.cpp/tree/parallel-decision) which addresses the problem. Instead of forcing the model to spit out a JSON string token by token, which involves running a full forward pass per token, it frames the schema as a single token multiple choice problem. And the genius is the KV cache management because it processes base instructions and schema once on load, caching that state in VRAM. When a batch of questions comes in, all of them point to the same shared cache and just append a few tokens at the end for their specific field names. Since the heavy lifting of reading the context has already been done, the model only needs one forward pass to check the probability scores of your predefined choices. It ignores the rest of the vocabulary, evaluating every field in parallel to produce answers in milliseconds. Running the LLM still requires using the GPU, but in terms of raw speed it's now comparable to using the classifier.

Another part worth noting here is the confidence gate that Lev uses. On the adversarial set the encoder alone gets 61.1 percent at 117 milliseconds a case and using Qwen3.5-4B alone gives 95.1. Gating the encoder at a 0.5 confidence threshold leads to 126 of the 144 cases escalating, giving 92.4 percent at about 270 milliseconds a case. The gate errs conservatively on traffic that was designed to trip a classifier, and pretty much the whole set gets handed to the LLM, addressing the problem of the encoder being overconfident. But on a 120-case set of AG News, BoolQ, and SST-5 it answers every question in one forward pass at 65.8 percent accuracy and about 0.13 seconds per case, keeping most of its best task on the fast tier and escalating its worst. Across a mixed stream the encoder takes the easy majority while the thinker is reserved for the rest.

However, the gate does have a blind spot which is that a yes-or-no question's confidence is max of p and 1 minus p, meaning that it can never drop below 0.5, leading the encoder to be overconfident on that particular question shape. Every single BoolQ case stayed on the encoder at 72.5 percent accuracy, and even raising the noul threshold to 0.7 kept 37 of 40 cases on the fast tier. Because choice and score confidences are well behaved, the fix is to use per-type thresholds rather than a single number for everything.

Since calibration carries all this weight, Lev ships a refit tool which can be handed labeled cases from your own traffic to fit a specific temperature per question type and option-count bucket, minimizing the negative log likelihood. On the published laya numbers that kind of refit moves mean calibration error from 0.466 to 0.081, and on Lev's own buckets the 20-way choice error drops from 0.57 to 0.10. Temperature scaling keeps every argmax, so the answers themselves don't change, only the confidence which the gate reads is affected. There is also a debias mode that asks every wide choice once per rotation of its options and averages the probabilities.

## Seeing it in action

All of this has been pretty abstract so far, so let's look at a concrete example of how a decision happens by seeing how the encoder plays snake in an example found [here](https://github.com/jlt-commons/lev/tree/main/examples/snake). A snake has to hunt for food without running into itself with every move being a decision made by the model.

Each tick the game computes the legal moves and which moves are actually safe using the Hamiltonian cycle that the board is built on. Then the policy renders the board as a two-fact state string, and that's everything the model sees here:

```text
Safe route: yes. Food reachable through empty cells: yes.
```

and it is asked three typed questions in one call:

```clojure
{"move" {:type "choice"
         :instructions "Choose the best safe move toward food."
         :criteria {"up"    "Safe. Best route to food."
                    "down"  "Blocked. Wall below."
                    "left"  "Unsafe. Traps the snake."
                    "right" "Safe. Eat food now. Best."}}
 "risk" {:type "noul" :instructions "Is a safe route available?"}
 "food" {:type "noul" :instructions "Is food reachable through empty cells?"}}
```

The answer comes back with a probability over all four directions plus the two noul probabilities looking something like this:

```clojure
{"move"  {"type" "choice" "choice" "right"
          "probabilities" {"up" 0.11 "down" 0.02 "left" 0.04 "right" 0.83}
          "confidence" 0.83}
 "risk"  {"type" "noul" "noul" 0.88 "confidence" 0.88}
 "food"  {"type" "noul" "noul" 0.91 "confidence" 0.91}}
```

The argmax of the choice becomes the proposal used by the safety shield to clamp it to the planner's safe directions, preventing the snake from trapping itself, and the HUD shows the milliseconds the decision took along with how often the shield intervened.

You can press `G` to turn the shield off and watch how the raw model plays without any guardrails. The first wall-or-tail answer ends the game, usually within seconds. That toggle illustrates the whole philosophy of the project since a fast classifier proposes while deterministic code disposes, and the boundary between the two is what ensures reliability of the system as a whole. The same pattern applies to real world production traffic such as a bundled email workflow where you'd strip quoted history and cap the body before the model sees it. Its questions can then be tied together with constraints decided jointly after the pass, so a phishing mail can't come back as needs-reply just because its body reads like an ordinary question.

## How Lev differs from Jev, and where it is weaker

The key benefit of Lev is that it's a binary running on your machine using open models, and you don't have to pay for a subscription or send your data to a third party. You can use calibration to refit on your own labeled traffic, use a constraints decoder to tie questions together, and a per-type escalation gate to tune against your own data. It even lets you set up highly specific escalation gates for each category to route uncertain edge cases based on your actual local data distribution.

The limitation of Lev is that you have to define the decision space up front. The questions, the types, the option texts, all must exist before you can ask Lev to do classification. Lev also can't generate anything, so summarization, drafting and extraction-as-prose are simply outside its scope. There is also a limited context budget of 512 tokens on the English checkpoint, and whatever doesn't fit gets dropped from the end of the state, with the answer reporting what was cut. As mentioned earlier, calibration drift becomes a problem when traffic patterns shift, so the refit becomes an ongoing maintenance task if you expect your data patterns to change.

Jev also handles auto classification, bypassing standard text generation entirely. It also has a large context allowing it to sort large datasets like thousands of support emails into specific categories in milliseconds. This gives you a built in triage filter where you can confidently automate all the high probability classifications and instantly escalate any uncertain edge cases to a heavier System Two model for deeper reasoning. It also runs at an absurdly low cost of around four cents per million input tokens which makes running massive classification workloads incredibly cheap and fast.

## Cracking open the native ecosystem

Python has become the staple for working with machine learning and data engineering largely because it provides an easy to use API on top of the native ecosystem. However, Python also has plenty of downsides to it such as poor performance, ad hoc dependency management, and lack of a decent packaging story. All of which have been addressed in Clojure from day one.

However, Clojure has been constrained to the JVM, making it a poor fit for use cases where you want to leverage the native ecosystem. While it's possible to do FFI from the JVM, it remains an awkward experience. Project Panama asks you to deal with a linker object, a symbol lookup, a function descriptor built from value layouts, a method handle, and an arena that owns native memory that the call touches. Strings can't cross the boundary on their own, so you have to allocate a UTF-8 segment, fill it, and then arrange for it to be freed. Structs need hand-written layout descriptions with their alignment and padding. There is a ton of ceremony between you and the function you wanted to call, and on top of all that, you still need the JVM itself, creating additional overhead.

On the other hand, `jolt.ffi` goes completely the other way, simply needing a per-platform name map to load a library, and each C function becomes a declaration that names the symbol and lists argument and return types as keywords. Strings pass the boundary seamlessly as ordinary Clojure strings. Raw memory is managed by a handful of obvious primitives such as `allocate`, `read`, `write`, and `free`. Variadic functions take a varargs marker in the same declaration, where the JVM forces a specialized handle per call shape. Jolt aims to make working with the native ecosystem completely seamless, making it as easy to work with the native ecosystem from Clojure as it is from Python.

Jolt also fully supports interactive Clojure workflow, so you can start Lev via nREPL, connect your editor to it, and talk directly to the running process. You can send code like the following to the process and see how it behaves immediately:

```clojure
user=> (require '[lev.agent :as ag])
user=> (def agent (ag/load-agent "data"))
user=> (ag/system-one agent
        "Charged twice this month, want my money back."
        {"intent" {:type "choice"
                   :instructions "What does the customer want?"
                   :criteria {"refund" "money back, disputes, chargebacks"
                              "help"   "how-to, configuration, questions"
                              "other"  "everything else"}}})
```

When an answer looks wrong you just redefine the question or the workflow's state shaping in the editor, evaluate it, and check again against the loaded weights. The snake game is basically this loop with a visualizer attached to it. All the calibration constants and gate thresholds cited in the bench numbers above were arrived at by poking a live system this way.

Another major benefit is dependency management using `deps.edn`. The snake example is a separate project that depends on the engine checkout, and the whole declaration is simply this:

```clojure
{:paths ["src"]

 :deps {lev/lev {:local/root "../.."}}

 :jolt/native [{:name "raylib"
                :darwin ["/opt/homebrew/lib/libraylib.dylib" "libraylib.dylib"]
                :linux  ["libraylib.so.6" "libraylib.so"]}]

 :aliases {:test {:extra-paths ["test"]
                  :main-opts ["-m" "snake.test-runner"]}
           :run  {:main-opts ["-m" "snake.core"]}}}

```

Local checkouts, git dependencies, Maven and Clojars artifacts, and build tasks all live in a single `deps.edn` file. Even the native libraries the project binds are declared here. The equivalent Python setup requires a venv or uv environment along with a requirements file, and a wrapper package for every C library.

And then there's the release packaging story. With Lev you can just run `jolt binary` to produce a standalone executable with the C kernels and llama.cpp linked in statically. Deploying Lev involves copying an executable next to your prepared model data. It doesn't need an interpreter or a separate runtime installed on the machine, and you don't have to muck around with site-packages or containers.

For my own use, Jolt has become a viable alternative to Python, letting me use the native ecosystem completely seamlessly. The FFI binds C shared libraries with minimal fuss, so ICU for tokenization, BLAS through Accelerate, raylib for the game window and llama.cpp for the thinker are all just libraries the project links, declared in `deps.edn` along with everything else. While giving up the Python ecosystem might seem like a loss, the reality is that a lot of Python libraries are just thin wrappers around native code anyways. So, it's easy enough to just use the native packages directly from Jolt. On the flip side, you get REPL driven development, real dependency resolution along with the Clojure library ecosystem, a fast runtime, and a self contained binary you can distribute.

## Try it yourself

The engine, the bench harnesses behind every number above, and the snake example are all in the repo. You just have to grab a BERT model and a GGUF, then reference them in the config to get up and running.

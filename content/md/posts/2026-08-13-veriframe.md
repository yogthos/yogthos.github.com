{:title "The Model Proposes, the Engines Dispose" :layout :post, :tags ["programming" "llm" "formal methods" "z3" "lean" "prolog" "octave"]}

LLMs are great at sounding right and bad at being checked. Ask one to solve a math puzzle and you get a confident wall of prose — some of it true, some of it plausible, none of it load-bearing. The usual fix is to prompt harder. [Veriframe](https://github.com/yogthos/veriframe) takes the opposite route: it treats the model like code and wraps it in a harness.

The one-line version: veriframe is an OpenAI-compatible HTTP server that takes a problem, runs the model through a verification loop, and refuses to return an answer until every claim in it has been confirmed by a formal engine — Prolog, Z3, Lean, or Octave — *and* the harness has checked that what the engine confirmed is actually what the answer claims. Nothing the model asserts ships unless an engine earned it. The server is written in Jolt, a Clojure dialect on Chez Scheme, and it's a deliberate port rather than a transliteration: the verification architecture was kept, and the control layer was rebuilt around a catalog of ways models fake progress.



## Four engines, four kinds of "yes"

The model has four ways to check a claim, and picking the right one is part of the work:

- **SWI-Prolog with `clpfd`** — for finite search spaces: puzzles, scheduling, enumeration over a bounded range. A goal that succeeds over an exhausted finite domain is a real result.
- **Z3** — for arithmetic and theory-rich claims: unbounded integers, quantifiers, bit-level reasoning. It's also how you prove impossibility: assert the negation, get `unsat`.
- **Lean 4 + Mathlib** — for statements about all naturals, real analysis, algebra. The system prompt makes the point bluntly: testing a thousand instances proves nothing about "all n", and both Prolog and Z3 will cheerfully confirm the instances you handed them rather than the statement you meant. Induction belongs to Lean.
- **GNU Octave** — for numerical work the others can't touch: linear algebra, condition numbers, optimization over reals. And here's the crucial epistemic caveat: the other three *decide* — they exhaust a domain, decide a theory, or check a proof. Octave *computes*, in floating point, so it can refute a universal claim with a counterexample but can never establish one. A result carries the tolerance it was established at and says whether the arithmetic was exact.

Two engines agreeing on a result is worth more than either alone — that's what the `review` tool is for. Two engines disagreeing is a finding, not a nuisance, and the model is told not to paper over it.

## The loop is a coding harness

The loop is a beam search. Five branches attack the problem in parallel, each with its own Prolog session, Lean environment, message history, and turn log. What they share is a failure log and a **settled-state ledger**, and that sharing is the point. The failure log is FTS5-ranked, so a branch sees the failures most similar to what it just tried rather than the whole history. The ledger is the opposite shape: not a sample but a complete standing list of what the run has established and what it has *ruled out*, rebuilt from the database every turn, with the encodings left out and fetchable by id.

That second half took embarrassingly long to notice. The database held 127 refuted artifacts and not one had ever been shown to anything, because the sharing predicate admitted only confirmed results. Branches were told what their siblings had proved and never what they had disproved — and a refutation is worth more per token, since a confirmation adds one fact while a refutation prunes a whole direction.

A branch that fails three consecutive verifications is culled — unless it produced a confirmed artifact recently, because a branch that's producing is allowed to stumble. `branch_theses` lets a branch fork into siblings, capped at fifteen. Worth knowing that the beam width is a *floor* rather than a ceiling: it's the number the harness refills toward, and a productive run grows past it, so asking for five can leave you running nine concurrent provider calls and nine engine processes.

The first branch to land a verified `done` ends the run for everyone.

Shipping is gated like a CI pipeline. The sequence is `thesis` → a `verify_*` that confirms → `review` (or `verify_template`, whose cross-check is baked in) → `audit` → `done`. `done` is refused unless the most recent audit passed against the exact answer being shipped, something was independently cross-checked, and every substantive claim in the answer appears in an artifact an engine confirmed. Those checks are mechanical — no model in the path.

One portability choice stands out: no provider-native tool calling. The model emits a fenced ` ```tool-call ` block containing JSON, and the harness parses it with a repair pass for unescaped control characters. It therefore never has to care whether a provider implements tool calling correctly, and the same server can point at DeepSeek, GLM, OpenAI, or a local `llama-server`.

The cost of that choice is that the model can always answer in prose instead, and it does — a turn that emits no fence at all was the single most common mechanical failure. The fix turned out to be free: end the request *mid-fence*. Send the opening ` ```tool-call ` as a partial assistant message and the model has to continue inside it, because there is no longer anywhere else to be. When a gate fires naming a specific tool, the prefill carries the name too, so the steer is a constraint rather than a suggestion.

There are two traps in that, both of which bite silently. The response now begins mid-fence, so the parser has to reattach the opener before matching or every prefilled turn reads as *no call at all* — a fix for the problem that generates the problem. And the stored transcript has to be reassembled the same way, or the history fills with assistant turns that begin inside a code fence, teaching the model the wrong format on every subsequent turn.

## The dirty tricks it defends against

The most interesting parts are the edges — all the ways a model can look like it's making progress without proving anything:

**SAT over free variables is not a witness.** Z3 can return SAT without pinning the values: you've proved a solution *exists*, but you don't have one. Such results land in an "existential" bucket that cannot substantiate a concrete answer — same for a Prolog goal that succeeds leaving its variables unbound.

**A confirmation is not progress.** An engine saying yes to "clpfd is available" is not progress on a puzzle. A guard that credits every confirmation cannot see a branch verifying its own tooling, so progress is defined mechanically: a new confirmed artifact, a discharged sub-claim, or a proof-goal count that went down.

**Self-verification doesn't count.** A `verify` whose Prolog goal succeeds only because of a rule the same branch added in the same turn, without independent grounding, does not confirm anything — the analogue of refusing to let an agent-authored check script latch green.

**You can't take back what you proved.** `retract_rule` refuses to remove a named rule that a confirmed artifact depends on. (dirge's version blocked discarding but never modifying; the same split applies here.)

**Verdicts fail closed.** `audit` and `review` both ask a sub-LLM for a verdict, and parsing free text is where the project that shaped this one got burned: its `parse_verdict` once read COMPLETE out of "NOT COMPLETE" because one string was a substring of the other — and got eleven of twenty-seven real judge phrasings wrong, every one in the same direction. veriframe parses against an answer set built so no answer is a substring of another, and ambiguity returns `:unparseable` rather than a guess. An unparseable verdict fails closed: `done` stays blocked.

## One steer per boundary

Gates fire at the end of every branch turn — `done` blocked by a failing audit, safe-state abort, emergency review, milestone, stuck hint after three unproductive verifications, a prologue bound for branches that produced nothing at all, tier escalation when only fast checks ran, turn-budget notices at 60% and 85%. Several can hold at once, but an arbiter emits exactly one message, in strict priority, and records what it outranked. A human directive sits above every machine gate: you can message a branch mid-run and it applies at that branch's next turn boundary.

Every gate declares a prediction when it fires — "this branch calls `review` within two turns" — and a later turn settles it from the journal with no model in the path. That's what makes "does this gate earn its place" answerable with data rather than vibes.

The data is not flattering, and it's the most useful thing the harness has told me about itself. Across every run to date, gate predictions settle **264 met against 472 unmet**. On individual campaign runs it's been far worse — one settled 4 met to 22 unmet, with *every* milestone and tier-escalation prediction going unmet.

Sit with that long enough and a pattern falls out. The gates that change behaviour are the ones that **withhold** something: the audit gate refused 14 of 32 artifacts in one run and those refusals visibly redirected the work. The gates that merely **suggest** something change nothing at all. A gate that fires, spends budget, and is ignored is worse than no gate, because the tally makes it look like supervision.

That observation is what the fence prefill came out of. "Run a slow-tier check" is a suggestion, and it went 0-for-4. Naming `verify_template` and `proof_start` in the *problem statement* instead produced a run where all eleven confirmed artifacts came from the slow tier, against zero in the run before it. So the lever isn't better wording — it's whether the mechanism can be declined.

## Things that only showed up in the wild

A catalog of defences is easy to write in advance. These are the ones I only found by watching runs and reading the journal afterwards, and most of them were the harness hurting itself.

**Don't cull a branch for punctuation.** A branch that fails to emit a well-formed fence has produced *nothing* — no claim, no encoding, no evidence. But those turns were being counted as verification failures, on the same counter that drives culling, so three bad fences in a row killed a branch. One run killed a branch that way at turn six, having called exactly two tools — what it would have gone on to do is unknowable, which is the cost. The stated reason was that the critic had scored the line a dead end; the critic had never seen a line. Malformed fences are now a mechanics fault with their own budget, looser and named honestly.

**Say something different the second time.** In one run, 29 of 57 failures — more than half — were the *same four* `(tool, error)` pairs repeated. A branch would call `proof_step`, be told to call `proof_start`, call `proof_start` without its required arguments, be told, and go round again — five times, receiving the byte-identical sentence each time. The missing-argument error now shows the shape of a valid call, which it could always have derived from what it already knew, and a repeat gets an escalation instead of an echo. It's an exact comparison over two columns, so there's no similarity threshold to tune and it can't misfire on an honest retry.

**Measure before you build the detector.** I was convinced the harness needed loop detection on the model's prose — the classic runaway where a model re-emits the same paragraph until the token cap. So I scored it: 3,464 consecutive turn pairs across 18 runs, median Jaccard similarity **0.008**, maximum **0.694**, and not one pair above 0.7. There is no threshold at which that detector fires. It would have been dead code. The repetition that actually exists is structured, in the tool calls, which is a cheaper thing to check anyway.

**Context is state, not narrative.** The ledger is regenerated every turn, and the obvious wiring appends it to each turn's message — which accumulates one copy per turn. On a long branch that's 211,000 tokens of stale ledgers, four times larger than the biggest context the project has ever produced. Only the newest copy goes over the wire now. There was already precedent for this: reasoning blocks are stripped from prior assistant turns before resend, and that alone is doing enormous work — **96.5% of stored assistant text is reasoning** that never goes back.

**A correct number is not a verified one.** Three artifacts in one run computed exactly the right value and were refused, because they hardcoded the constants they should have derived. The same program with different constants would have "proved" a false statement about a different problem. The number being right is not evidence the encoding says what the claim says.

**The measurement you skipped is the bug you'll file.** I once filed a performance issue claiming a JSON parser ran at 700 bytes/sec, from numbers taken while a beam of four plus a Lean pool saturated the machine. Off by roughly 700×, and pointed at the wrong library entirely. The real culprit was a quadratic string builder. Never characterize a performance bug on a loaded box, and prefer a scaling ratio to an absolute rate — the ratio survives contention.

## The proof that it works

A harness is a toy if it never produces anything. The best artifact in the repo is a worked attack on the **Erdős–Selfridge odd covering problem**, open since the 1950s. Selfridge offered $2000 for a construction of a covering system of the integers whose moduli are all odd and distinct; Erdős offered $25 for a proof that none exists. Every covering system ever found has a modulus divisible by 2 or 3.

veriframe runs against `deepseek-v4-flash` produced engine-verified results on it. The headline: the modulus set {3,5,7,9,11,13,15} is the minimal density-feasible candidate — its reciprocal sum is ≈1.0218 ≥ 1, so density alone can't rule it out — yet no choice of residues covers all integers. The maximum coverable is exactly 32805 of the 45045 residue classes, leaving 12240 uncovered in the best case, with an explicit maximizing witness. The proof factorizes the moduli into an entangled part {3,5,9,15} and a coprime part {7,11,13}, then combines an exhaustive search over the entangled part with a CRT independence argument for the coprime part. Every claim was confirmed in at least two engines with independently shaped encodings, and each one sits in the run journal with the exact engine code that verified it.

Later runs, each seeded from the last, pushed further: every odd covering system needs at least **four** distinct odd primes in its support, and the family {3,5,7,q} is closed for every prime q ≥ 13, leaving {3,5,7,11} — which a per-class linear-programming argument then closed as well. What's still open is narrow and named: {3,5,11,q}, {3,5,13,q}, and a finite list of supports with all primes below 257.

That's the property worth underlining: not that a model said something smart, but that a model produced something *checkable*, and the checking is re-runnable from the journal by anyone. Sixty-two runs, 9,740 turns, 1,044 artifacts — of which 644 confirmed, 130 refuted, and 173 refused as *unfaithful*, meaning the encoding didn't establish what the claim said. That last number is the one I'd point at: better than one artifact in six looked like a result and wasn't.

## Where it stops

The most interesting run so far is one that settled nothing.

A campaign on canonical phase unwrapping — the problem of recovering a true phase field from measurements known only modulo 2π — spent four generations on a rule that picks a unique answer when the obvious one is ambiguous. It established that the rule is well defined, that its ambiguity is exponential and generic rather than a toy artifact, and that no symmetry-invariant tie-break can exist, so the rule's dependence on edge ordering is *forced* rather than a wart to be engineered away.

Then it was asked the hard question — can the thing be computed in polynomial time — and came back with:

> **STATUS: NOT SETTLED.** I did not settle whether the three-stage unwrapping rule is computable in polynomial time on arbitrary instances, and I did not prove hardness.

followed by three machine-checked lemmas that are genuinely the core of any future algorithm *or* hardness proof, and an exact statement of the three gaps between those lemmas and a result. The `done` gate accepted it first try, no refusals, because it was already scoped correctly when offered.

I'll take that over a confident wrong answer, and it's the whole design in one output: the interesting question isn't whether a model can produce something that looks like mathematics. It's whether it can be made to say what it hasn't got.

One caveat I'd rather state than have someone find. In an earlier generation I wrote the proof strategy into the problem statement myself — "exhibit an instance whose symmetry group acts transitively on its optimal set" — and got that strategy back as the answer. That run is evidence the harness executes a suggested attack well and evidence of nothing else. The next generation deliberately withheld the attack, and a branch rediscovered it independently at turn 18. If you're going to run experiments on your own tooling, keep track of what you told it.

## The check no engine can run

That campaign didn't stay unsettled. Two generations later it shipped **Q-1 is settled in the affirmative**, correctly scoped, with the polynomial-time step resting on a named external theorem whose hypotheses it checked rather than waving at. I verified the Lean myself in fresh sessions — axiom-clean, `propext`, `Classical.choice`, `Quot.sound`, nothing else.

Then I looked it up. The mathematics is Costantini's 1998 minimum-cost-flow formulation of phase unwrapping plus a 1990 corollary of Hochbaum and Shanthikumar. So I asked the obvious follow-up — give a checkable certificate for when the optimum is *unique* — and got back a clean two-directional proof of the negative-cycle optimality criterion, which is Theorem 9.1 of Ahuja, Magnanti and Orlin's *Network Flows*, 1993. The certificate-checking algorithm after that is Könen and Ruzika, 2022.

Four targets, four hits, every one found *after* the compute was spent. The harness did its job perfectly each time: it verified things that were true. What no engine in it can tell you is that the true thing is already in a textbook. Novelty isn't a property of a claim that any of these four engines decides — it's a property of the literature, and checking it is external work that costs about twenty minutes and that I kept doing last.

The obvious fix is to source targets from somewhere openness is curated, so I tried that, and the second lesson was sharper than the first. A public database of open problems listed 280 circulant-graph chromatic numbers as unsolved. Of those, all 140 with two-element connection sets fall to a known closed form, and 117 of the remaining 140 satisfy `N ≥ 4bc`, which is exactly the hypothesis of Barajas and Serra, *Discrete Mathematics* 309 (2009). **257 of 280 were settled by published work.** The generator had enumerated parameters without checking them against the literature, so "open" there means *nobody has recorded an answer*, not *nobody knows*. Worth knowing before you point a beam at one.

The 23 that survive that filter are genuinely unrecorded, and settling them is anticlimactic in an instructive way: an SMT encoding, `unsat` at k−1, an explicit colouring at k verified edge by edge. Twenty-one have χ = 3; two — C(577; 1,12,24) and C(839; 1,12,24) — have χ = 4, and those two `unsat` verdicts I re-ran under a boolean one-hot encoding as well as the integer one, because a single encoding is a single point of failure.

That last paragraph is z3 driven from a Python script. Veriframe had nothing to do with it, and claiming otherwise would be precisely the move the unfaithful counter exists to catch.

What veriframe did do that week is refuse things. A campaign on C₄-free extremal numbers ran 72 turns and shipped nothing, correctly. Along the way a branch claimed *in any graph on 41 vertices with 133 edges the minimum degree is exactly 6* — which is true, and which I had already checked by hand — backed by an SMT model that constrained one integer and asserted nothing about any graph. The audit refused it as unfaithful, twice. The claim was true; the encoding didn't establish it; the harness doesn't grade on truth. That is the one-in-six number happening live, on a statement I already knew was correct.

Which is the honest summary of where this sits. The engines make the model's output checkable, and that is worth having. They do not make it *interesting*, and if you conflate the two you will spend a great deal of money proving 1993.

## Working interactive with a GUI

Since veriframe is built using Jolt, I naturally couldn't resist adding a GUI component using my [glimmer](https://github.com/jolt-lang/glimmer) library — these days glimmer is the toolkit-agnostic reactive core, with the GTK4 widgets living in [glimmer-gtk](https://github.com/jolt-lang/glimmer-gtk) behind a backend registry. The GUI allows you to see the evolution of the solution frontier, which tool was used at each step, and which nodes are currently active.

![](/img/veriframe/veriframe.jpg)

You can move around the graph and select individual nodes to see what happened at that step, and whether it was a success or a failure. For active nodes, you can send a steering message to nudge the model in a new direction.

## Runs you can watch, crash, and steer

Everything is appended to SQLite as it happens — every turn, tool result, artifact, and gate firing — so a crashed or aborted run stays fully inspectable, and the read API serves a live run and a finished one with the same query. You can tail a run's journal by cursor, post an intervention to a branch, or abort it. A supervisor owns every engine subprocess and can kill them all regardless of what any branch believes — the out-of-band stop that the DS1 remote-agent report made a hard requirement. And sending `"raw": true` bypasses the loop entirely and forwards straight to the provider, which is the control arm every harness should have: you can always compare harnessed against unharnessed.

Because the journal is the record, a crash is survivable rather than fatal. A run whose process dies is marked *interrupted* at the next startup instead of claiming to be running forever, and can be resumed from its journal — one campaign lost its server mid-run at turn 164 and finished 33 turns later without losing the work. What doesn't replay is documented per field rather than glossed: Lean sessions are process memory and don't survive, and a resumed branch starts its safe-state fallback empty.

The other thing that only exists because it's in the database: the harness now records what each turn *cost*. Token usage was being parsed by the provider adapter and thrown away for the project's whole life, so the one number a system whose operating rule is "a generation is hours of provider spend" most needs was the one it never kept. With it, the first question I could finally ask had an unwelcome answer: at nine active branches the prefix-cache hit rate was **42.6%**, because every branch carries its own diverging transcript and only the shared system prompt ever hits. Running wide costs more than the branch count suggests.

Which brings me to the honest limitation. Nearly everything above is a single-arm observation on one run — this gate tally, that slow-tier rate, this cache number. The harness can now measure itself, but it still can't run the same problem twice under two configurations and compare, and effects that show up as *"the bad runs stop happening"* are exactly the shape a naive comparison would score as noise. That's the next thing to build, and until it exists every number in this post should be read as suggestive rather than established.

The design motto, inherited from the dirge work that shaped the control layer, is that prose loses to mechanism. Anything that can be a gate, a tool precondition, or a mechanical check should be one — because mechanisms that make an artifact prove what it claims are worth more than mechanisms that make the model try harder. veriframe is that bet, in production shape: an OpenAI-compatible endpoint that will happily answer your prompt — after it proves the answer.
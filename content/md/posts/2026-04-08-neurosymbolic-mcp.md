{:title "Giving LLMs a Formal Reasoning Engine for Code Analysis" :layout :post, :tags ["programming" "llm" "neurosymbolic" "solver" "prolog"]}

LLM coding assistants continue to become more capable at writing code, but they have an inherent weakness when it comes to reasoning about code structure. What's worse is that they assemble the picture of the code by grepping through source files and reconstructing call chains in ad hoc fashion. This works for simple questions, but quickly starts to fall apart for transitive ones such as "Can user input reach this SQL query through any chain of calls?" or "What's all the dead code in this module?" Such questions require exhaustive structural analysis that simply can't be accomplished using pattern matching.

[Chiasmus](https://github.com/yogthos/chiasmus) is an MCP server aiming to address the problem by giving LLMs access to formal reasoning engines, bundling Z3 for constraint solving and Tau Prolog for logic programming. Source files are parsed using tree-sitter and then turned into formal grammars, providing the LLM with a structured representation of the code along with a logic engine that can answer questions about it with certainty while using a fraction of the tokens.

The project is grounded in the neurosymbolic AI paradigm described by [Sheth, Roy, and Gaur](https://doi.org/10.1109/MIS.2023.3268724). The core idea is that AI systems benefit from combining neural networks (perception, language understanding) with symbolic knowledge-based approaches (reasoning, verification). LLMs are excellent at understanding what you're asking and generating plausible code, but they lack the ability to prove properties about that code. Symbolic solvers have that ability but can't understand natural language or navigate a codebase. Chiasmus bridges the two: the LLM handles perception (parsing your question, understanding context, filling templates), while the solvers handle cognition (exhaustive graph traversal, constraint satisfaction, logical inference).

## The Problem with Grepping Through Source

When an LLM assistant needs to answer "what's the blast radius of changing `lintSpec`?", here's what typically happens:

```text
Step 1: grep lintSpec src/**/*.ts
  → found in engine.ts (lintLoop) and mcp-server.ts (handleLint)

Step 2: grep lintLoop src/**/*.ts
  → called from solve() at lines 75 and 87

Step 3: grep handleSolve src/**/*.ts
  → called from createChiasmusServer switch...
```

Three rounds of tool calls, each consuming tokens for both the query and the response. At each step, the LLM has to reason about what it found and decide what to grep next. And after all that, it's still only traced *part* of the chain while missing paths through `correctionLoop`, `runAnalysis`, and several other transitive callers.

This isn't a failure of the LLM. It's a fundamental limitation of the approach. Grep finds string matches. Structural questions about code such as reachability, dead code, cycles, impact analysis require graph traversal, which grep cannot do.

## How Chiasmus Works: Tree-sitter → Prolog → Formal Queries

Chiasmus takes a different approach. Instead of searching through text, it:

1. **Parses source files with tree-sitter** into typed ASTs
2. **Walks the ASTs** to extract structural facts: method definitions, call relationships, imports, exports
3. **Serializes these as Prolog facts** a declarative representation of the call graph
4. **Runs formal queries** via the Prolog solver to answer structural questions

### Step 1: Tree-sitter Parsing

Unlike regex-based tools, tree-sitter understands language grammar making it possible to produce concrete syntax trees. Since it knows that `foo()` in `const bar = () => { foo(); }` is a call from `bar` to `foo`, it can answer semantic questions regarding the symbol.

Chiasmus supports Python, Go, TypeScript, JavaScript, and Clojure out of the box, and provides adapters for other languages. When you pass source files to `chiasmus_graph`, the parser identifies method declarations `arrow_function`, `method_definition` in TS/JS; `defn`, `defn-` in Clojure. Next, it resolves call expressions `call_expression` → callee name, handling `obj.method()` → `method`, `this.bar()` → `bar`, `db/query` → `query`. It tracks scope of which routine is the caller for each call site and extracts imports and exports for cross-file resolution.

Tree-sitter is an incremental parsing library that produces concrete syntax trees. Unlike regex-based tools, it understands language grammar, and so, it knows that `foo()` in `const bar = () => { foo(); }` is a call from `bar` to `foo`, not just a string that contains "foo".

### Step 2: Prolog Fact Generation

The extracted relationships become Prolog facts:

```prolog
defines('src/formalize/validate.ts', lintSpec, routine, 16).
defines('src/formalize/engine.ts', lintLoop, routine, 208).
defines('src/formalize/engine.ts', solve, routine, 64).
defines('src/mcp-server.ts', handleLint, routine, 527).

calls(lintLoop, lintSpec).
calls(solve, lintLoop).
calls(handleLint, lintSpec).
calls(handleSolve, solve).
calls(correctionLoop, solve).

exports('src/formalize/validate.ts', lintSpec).
```

We now have a complete representation of the call graph with all subroutine definitions, call edges, and import relationships are encoded as ground facts that a Prolog engine can reason about.

### Step 3: Built-in Rules for Structural Analysis

Alongside the facts, Chiasmus appends rules that enable the kinds of queries LLMs actually need. The most important of these is cycle-safe transitive reachability:

```prolog
reaches(A, B) :- reaches(A, B, [A]).
reaches(A, B, _) :- calls(A, B).
reaches(A, B, Visited) :-
    calls(A, Mid),
    \+ member(Mid, Visited),
    reaches(Mid, B, [Mid|Visited]).
```

This rule says that A reaches B if A calls B directly, or if A calls some intermediate routine that has not yet been visited to reaches B. The visited list prevents infinite loops on cyclic call graphs which is a real concern in any codebase with mutual recursion or event loops. The solver can use this rule to answer transitive reachability over the entire call graph without the need for iterative grepping.

### Step 4: Query Execution

Now the same "blast radius" question becomes a single tool call:

```text
chiasmus_graph analysis="impact" target="lintSpec"
→ ["lintLoop", "handleLint", "solve", "correctionLoop",
   "handleVerify", "handleSolve", "handleGraph",
   "createChiasmusServer", "runAnalysis", "runAnalysisFromGraph"]
```

Above is the result of the Prolog solver having traversed every path in the call graph to collect all the methods that transitively call `lintSpec`. The LLM didn't need to know anything about the graph structure at all here.

## What This Makes Possible That Grep Cannot

The real value isn't just efficiency — it's *correctness*. There are questions that grep fundamentally cannot answer, regardless of how many rounds you run:

### Transitive Reachability

"Can user input reach the database query?" Being able to answer this question requires proving whether a path exists through potentially dozens of intermediate routines across multiple files. Grep can find direct callers, but tracing the full transitive closure requires the LLM to make decisions at each step about which paths to follow. It will miss branches, run out of context, and give you a best guess. Hence why the agent can end up giving different answers when asked the same question repeatedly.

With Chiasmus:

```text
chiasmus_graph analysis="reachability" from="handleRequest" to="dbQuery"
→ { reachable: true }

chiasmus_graph analysis="path" from="handleRequest" to="dbQuery"
→ { paths: ["[handleRequest,validate,processData,dbQuery]"] }
```

The solver explores every possible path. If it says "not reachable", that's a proof by exhaustion — there is no chain of calls from A to B in the entire graph.

### Dead Code Detection

"Which routines are never called?" This is another question where answering with grep would necessitate checking every method definition against every call site in the codebase. Even for a project with around 100 subroutines, that's 100 grep calls at a minimum, and you'd still miss methods that are only called by other dead methods.

With Chiasmus:

```text
chiasmus_graph analysis="dead-code"
→ ["unusedHelper", "legacyParser", "deprecatedValidator"]
```

One call. The Prolog rule is simple:

```prolog
dead(Name) :-
    defines(_, Name, routine, _),
    \+ calls(_, Name),
    \+ entry_point(Name).
```

A routine is dead if it's defined, nobody calls it, and it's not an entry point. The solver is able to trivially check this against every node in the graph exhaustively.

### Cycle Detection

"Are there circular call dependencies?" is another kind of task that isn't possible to answer because grep cannot detect cycles at all. it's a question requiring traversal.

```text
chiasmus_graph analysis="cycles"
→ ["eventHandler", "processQueue", "dispatchEvent"]
```

On the other hand, the solver finds all nodes that can reach themselves through any chain of calls.

### Impact Analysis

"What breaks if I change this method?" This is reverse transitive reachability scenario where we need to find everything that transitively depends on the target. Grep can give you direct callers, and then you'd have to iterate on each one exhaustively. Chiasmus gives you the full blast radius.

```text
chiasmus_graph analysis="impact" target="validate"
→ ["handleRequest", "batchProcessor", "main", "testHarness"]
```

## Token Economics

Each grep call consumes tokens for the query, the response (which includes matching lines plus context), and the LLM's reasoning about what to do next. For a transitive question requiring N hops through the call graph you end up with ~N tool calls × (query tokens + response tokens + reasoning tokens). For a 5-hop chain, this might be 5 calls × ~500 tokens = ~2,500 tokens, and assuming the LLM doesn't go down wrong paths. With Chiasmus, we have asingle tool call × ~200 tokens and small JSON response. The heavy lifting happens in the Prolog solver, which runs locally and doesn't consume API tokens at all.

The savings compound with codebase size. In a 500-routine project, dead code detection via grep would require hundreds of calls. Via Chiasmus, it's still just one call.

## Beyond Code: Mermaid Diagrams and Formal Verification

The same architecture handles more than source code. For example, Chiasmus can parse Mermaid diagrams directly into Prolog facts:

```text
chiasmus_verify solver="prolog" format="mermaid"
  input="stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : submit
    Processing --> Review : complete
    Review --> Approved : approve
    Review --> Processing : revise
    Approved --> [*]"
  query="can_reach(idle, approved)."
→ { status: "success", answers: [{}] }
```

If it's expressed as a Mermaid graph then you can formally verify properties of it, be it an architecture diagram, a state machine from a design doc, or a workflow from a ticket. Can every state reach the terminal state? Are there dead-end states? Is there a cycle between review and processing? These all become one-line queries against a solver.

Of course, not all constraint problems can be usefully expressed as graphs. Chiasmus provides Z3, an SMT solver that can prove properties over combinatorial spaces for cases such access control conflicts, configuration equivalence, or dependency resolution. "Can these RBAC rules ever produce contradictory allow/deny decisions?" isn't a question you can even begin to grep for. It requires exploring every possible combination of roles, actions, and resources. Z3 does this exhaustively and yields either a proof of consistency or a concrete counterexample.

## The Neurosymbolic Advantage

The Neurosymbolic AI paper classifies systems by how tightly they couple neural and symbolic components. Chiasmus largely operates in Category 2(a) where the LLM identifies what formal analysis is needed and delegates to symbolic solvers for execution. But it pushes toward Category 2(b) in several ways:

It provides enriched feedback loops when the solver produces UNSAT, feeding specific assertions conflict back to the LLM as structured guidance. It tracks derivation traces, so that when Prolog proves a query, the trace of which rules fired gives the LLM an explanation of why the answer holds. Finally, Chiasmus supports template learning extracting verification pattern prove useful into a reusable templates. The symbolic structure (skeleton with typed slots) is learned organically from successful neural-symbolic interactions, creating a feedback loop where the system improves with use.

The practical consequence here is that using Chiasmus provides logically derived answers rather than probabilistic guess based on pattern matching over training data. It's a logical proof by exhaustion derived from a formal representation of the call graph. The neural component understands the question, and the symbolic component provides the answer.

## The Architecture

Chiasmus runs as an MCP server, and setup for Claude Code is one command:

```bash
claude mcp add chiasmus -- npx -y chiasmus
```

The server exposes nine tools:

* **chiasmus_graph**: tree-sitter call graph analysis (callers, callees, reachability, dead-code, cycles, path, impact)
* **chiasmus_verify**: submit formal logic to Z3 or Prolog solvers directly
* **chiasmus_craft**: create reusable verification templates
* **chiasmus_formalize**: find the right template for a problem
* **chiasmus_skills**: search the template library
* **chiasmus_solve**: end-to-end autonomous verification
* **chiasmus_learn**: extract templates from verified solutions
* **chiasmus_lint**: structural validation of formal specs

## What Changes for the Developer

From the developer's perspective, the experience is subtle but significant. You ask your coding assistant a structural question, and instead of watching it grep through files for 30 seconds, it answers immediately with a complete, provably correct result. "What calls this method?" comes back with every transitive caller in the graph. "Is there dead code?" comes back with a definitive list, not "I checked a few files and didn't find any callers."

The LLM spends fewer tokens on exploration and more on the work you actually asked for. And when it tells you something about your code's structure, you can trust it because the answer comes from a solver, not a guess.

The project is open source at [github.com/yogthos/chiasmus](https://github.com/yogthos/chiasmus).
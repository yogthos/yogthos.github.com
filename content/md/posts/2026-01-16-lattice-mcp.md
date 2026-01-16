{:title "Stop Round-Tripping Your Codebase: How to Cut LLM Token Usage by 80% Using Recursive Document Analysis" :layout :post, :tags ["programming" "typescript" "llm" "lisp" "miniKanren"]}

When you employ AI agents such as Claude, there’s a significant volume problem for document study. Reading one file of 1000 lines consumes about 10,000 tokens. Token consumption incurs costs and time penalties. Codebases with dozens or hundreds of files, a common case for real world projects, can easily exceed 100,000 tokens in size when the whole thing must be considered. The agent must read and comprehend, and be able to determine the interrelationships among these files. And, particularly, when the task requires multiple passes over the same documents, perhaps one pass to divine the structure and one to mine the details, costs multiply rapidly.

**Matryoshka** is a tool for document analysis that achieves over 80% token savings while enabling interactive and exploratory analysis. The key insight of the tool is to save tokens by caching past analysis results, and reusing them, so you do not have to process the same document lines again. These ideas come from recent research, and retrieval-augmented generation, with a focus on efficiency. We'll see how Matryoshka unifies these ideas into one system that maintains a persistent analytical state. Finally, we'll take a look at some real-world results analyzing the [anki-connect](https://git.sr.ht/~foosoft/anki-connect) codebase.

---

## The Problem: Context Rot and Token Costs

A common task is to analyze a codebase to answers a question such as “What is the API surface of this project?” Such work includes identifying and cataloguing all the entry points exposed by the codebase.

**Traditional approach:**
1. 1. Read all source files into context (~95,000 tokens for a medium project)
2. 2. The LLM analyzes the entire codebase’s structure and component relationships
3. 3. For follow-up questions, the full context is round-tripped every turn

This creates two problems:

### Token Costs Compound

Every time, the entire context has to go to the API. In a 10-turn conversation about a codebase of 7,000 lines, almost a million tokens might be processed by the system. Most of those tokens are the same document contents being dutifully resent, over and over. The same core code is sent with every new question. This redundant transaction is a massive waste. It forces the model to process the same blocks of text repeatedly, rather than concentrating its capabilities on what’s actually novel.

### Context Rot Degrades Quality

As described in the [Recursive Language Models](https://arxiv.org/abs/2505.11409) paper, even the most capable models exhibit a phenomenon called context degradation, in which their performance declines with increasing input length. This deterioration is task-dependent. It’s connected to task complexity. In information-dense contexts, where the correct output requires the synthesis of facts presented in widely dispersed locations in the prompt, this degradation may take an especially precipitous form. Such a steep decline can occur even for relatively modest context lengths, and is understood to reflect a failure of the model to maintain the threads of connection between large numbers of informational fragments long before it reaches its maximum token capacity.

The authors argue that we should not be inserting prompts into the models, since this clutters their memory and compromises their performance. Instead, documents should be considered as **external environments** with which the LLM can interact by querying, navigating through structured sections, and retrieving specific information on an as-needed basis. This approach treats the document as a separate knowledge base, an arrangement that frees up the model from having to know everything.

---

## Prior Work: Two Key Insights

Matryoshka builds on two research directions:

### Recursive Language Models (RLM)

The RLM paper introduces a new methodology that treats documents as external state to which step-by-step queries can be issued, without the necessity of loading them entirely. Symbolic operations, search, filter, aggregate, are actively issued against this state, and only the specific, relevant results are returned, maintaining a small context window while permitting analysis of arbitrarily large documents.

Key point is that the documents stay outside the model, and only the search results enter the context. This separation of concerns ensures that the model never sees complete files, instead, a search is initiated to retrieve the information.

### Barliman: Synthesis from Examples

[Barliman](https://github.com/webyrd/Barliman), a tool developed by William Byrd and Greg Rosenblatt, shows that it is possible to use program synthesis without asking for precise code specifications. Instead, input/output examples are used, and a solver engine is used as a relational programming system in the spirit of [miniKanren](http://minikanren.org/). Barliman uses such a system to synthesize functions that satisfy the constraints specified. The system interprets the examples as if they were relational rules, and the synthesis engine tries to satisfy them. This approach makes it possible to describe what is desired for concrete test cases.

The approach is to simply show examples of the kind of behavior one wishes the system to exhibit, letting it derive the implmentation on its own. Thus, the emphasis shifts from writing long and detailed step-by-step recipes for behavior to simply portraying, in a declarative fashion, what the desired goal is.

---

## Matryoshka: Combining the Insights

Matryoshka incorporates these insights into a functioning system for LLM agents. A practical tool is provided that enables agents to decompose challenging tasks into a sequence of smaller and more manageable objectives.

### 1. Nucleus: A Declarative Query Language

Instead of issuing commands, the LLM describes **what** it wants, using [Nucleus](https://github.com/michaelwhitford/nucleus), a simple S-expression query language. This changes the focus from describing each step to specifying the desired outcome.

```clojure
(grep "class ")           ; Find all class definitions
(count RESULTS)           ; Count them
(map RESULTS (lambda x    ; Extract class names
  (match x "class (\\w+)" 1)))
```

We observe that the declarative interface retains its robustness even when the LLM employs different vocabulary or sentence structures. This robustness originates from the system’s commitment to elucidating the underlying intent of a request, independent of superficial linguistic variations.

### 2. Pointer-Based State

The key new insight is that we can separate the results from the context. Results are now stored in the REPL state, rather than in the context.

When Claude runs `(grep "def ")` and gets 150 matches:

- **Traditional tools**: All 150 lines are fed into context, and round-tripped every turn
- **Matryoshka**: Binds matches to `RESULTS` in the REPL, returning only "Found 150 results"

The variable `RESULTS` is bound to the actual value in the REPL. This binding acts as a pointer, revealing the location of the data within the server's memory. Subsequent operations, queries, for example, or updates, use this reference to access the data. But the data itself never actually enters the conversation:

```
Turn 1: (grep "def ")         → Server stores 150 matches as RESULTS
                              → Context gets: "Found 150 results"

Turn 2: (count RESULTS)       → Server counts its local RESULTS
                              → Context gets: "150"

Turn 3: (filter RESULTS ...)  → Server filters locally
                              → Context gets: "Filtered to 42 results"
```

The LLM never sees the 150 function definitions, just the aggregated answers from these functions.

### 3. Synthesis from Examples

When queries need custom parsing, Matryoshka synthesizes functions from examples:

```clojure
(synthesize_extractor
  "$1,250.00" 1250.00
  "€500" 500
  "$89.99" 89.99)
```

The synthesizer learns the pattern directly from examples, obtaining numerical values straight from the currency strings and entirely circumventing the need to construct manual regex.

---

## The Lifecycle

A typical Matryoshka session:

### 1. Load Document

```clojure
(load "./plugin/__init__.py")
→ "Loaded: 2,244 lines, 71.5 KB"
```

The document is parsed and stored server-side. Only metadata enters the context.

### 2. Query Incrementally

```clojure
(grep "@util.api")
→ "Found 122 results, bound to RESULTS"
   [402] @util.api()
   [407] @util.api()
   ... (showing first 20)
```

Each query returns a preview plus the count. Full data stays on server.

### 3. Chain Operations

```clojure
(count RESULTS)           → 122
(filter RESULTS ...)      → "Filtered to 45 results"
(map RESULTS ...)         → Transforms bound to RESULTS
```

Operations chain through the `RESULTS` binding. Each step refines without re-querying.

### 4. Close Session

```clojure
(close)
→ "Session closed, memory freed"
```

Sessions auto-expire after 10 minutes of inactivity.

---

## How Agents Discover and Use Matryoshka

Matryoshka integrates with LLM agents via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

### Tool Discovery

When Claude Code starts, it launches Matryoshka as an MCP server and receives a tool manifest:

```json
{
  "tools": [
    {
      "name": "lattice_load",
      "description": "Load a document for analysis..."
    },
    {
      "name": "lattice_query",
      "description": "Execute a Nucleus query..."
    },
    {
      "name": "lattice_help",
      "description": "Get Nucleus command reference..."
    }
  ]
}
```

Claude sees the available tools and their descriptions. When a user asks to analyze a file, Claude decides which tools to use based on the task.

### Guided Discovery

The `lattice_help` tool returns a command reference, teaching the LLM the query language on-demand:

```clojure
; Search commands
(grep "pattern")              ; Regex search
(fuzzy_search "query" 10)     ; Fuzzy match, top N
(lines 10 20)                 ; Get line range

; Aggregation
(count RESULTS)               ; Count items
(sum RESULTS)                 ; Sum numeric values

; Transformation
(map RESULTS fn)              ; Transform each item
(filter RESULTS pred)         ; Keep matching items
```

The agent learns capabilities incrementally rather than needing upfront training.

### Session Flow

```
User: "How many API endpoints does anki-connect have?"

Claude: [Calls lattice_load("plugin/__init__.py")]
        → "Loaded: 2,244 lines"

Claude: [Calls lattice_query('(grep "@util.api")')]
        → "Found 122 results"

Claude: [Calls lattice_query('(count RESULTS)')]
        → "122"

Claude: "The anki-connect plugin exposes 122 API endpoints,
         decorated with @util.api()."
```

Each tool invocation maintains its own state within the conversation. So, for example, when a document is loaded, that content is retained in memory. Similarly, the results of any query that is executed are saved and available for later use.

---

## Real-World Example: Analyzing anki-connect

Let's walk through a complete analysis of the [anki-connect](https://git.sr.ht/~foosoft/anki-connect) Anki plugin. Here we have a real-world codebase with 7,770 lines across 17 files.

### The Task

"Analyze the anki-connect codebase: find all classes, count API endpoints, extract configuration defaults, and document the architecture."

### The Workflow

The agent uses Matryoshka's [prompt hints](https://github.com/yogthos/Matryoshka/blob/4a2143851eed8245d7a314694a2ba9eb6ab80466/src/lattice-mcp-server.ts#L97) to accomplish the following workflow:

1. 1. **Discover files** with Glob
2. 2. **Read small files directly** (<300 lines)
3. 3. **Use Matryoshka for large files** (>500 lines)
4. 4. **Aggregate across all files**

---

### Step 1: File Discovery

```
Glob **/*.py → 15 Python files
Glob **/*.md → 2 markdown files

File sizes:
  plugin/__init__.py    2,244 lines  → Matryoshka
  plugin/edit.py          458 lines  → Read directly
  plugin/web.py           301 lines  → Read directly
  plugin/util.py          107 lines  → Read directly
  README.md             4,660 lines  → Matryoshka
  tests/*.py           11 files      → Skip (tests)
```

---

### Step 2: Read Small Files

Reading `util.py` (107 lines) reveals configuration defaults:

```python
DEFAULT_CONFIG = {
    'apiKey': None,
    'apiLogPath': None,
    'apiPollInterval': 25,
    'apiVersion': 6,
    'webBacklog': 5,
    'webBindAddress': '127.0.0.1',
    'webBindPort': 8765,
    'webCorsOrigin': None,
    'webCorsOriginList': ['http://localhost'],
    'ignoreOriginList': [],
    'webTimeout': 10000,
}
```

Reading `web.py` (301 lines) reveals the server architecture:
- - Classes: `WebRequest`, `WebClient`, `WebServer`
- - JSON-RPC style API with jsonschema validation
- - CORS support with configurable origins

---

### Step 3: Query Large Files with Matryoshka

```clojure
; Load the main plugin file
(load "plugin/__init__.py")
→ "Loaded: 2,244 lines, 71.5 KB"

; Find all classes
(grep "^class ")
→ "Found 1 result: [65] class AnkiConnect:"

; Count methods
(grep "def \\w+\\(self")
→ "Found 148 results"

; Count API endpoints
(grep "@util.api")
→ "Found 122 results"

; Load README for documentation
(load "README.md")
→ "Loaded: 4,660 lines, 107.2 KB"

; Find documented action categories
(grep "^### ")
→ "Found 13 sections"
   [176] ### Card Actions
   [784] ### Deck Actions
   [1231] ### Graphical Actions
   ...
```

### Complete Findings

<table>
<thead>
<tr>
<th>Metric</th>
<th>Value</th>
</tr>
</thead>
<tbody>
<tr>
<td>Total files</td>
<td>17 (15 .py + 2 .md)</td>
</tr>
<tr>
<td>Total lines</td>
<td>7,770</td>
</tr>
<tr>
<td>Classes</td>
<td>8 (1 main + 3 web + 4 edit)</td>
</tr>
<tr>
<td>Instance methods</td>
<td>148</td>
</tr>
<tr>
<td>API endpoints</td>
<td>122</td>
</tr>
<tr>
<td>Config settings</td>
<td>11</td>
</tr>
<tr>
<td>Imports</td>
<td>48</td>
</tr>
<tr>
<td>Documentation sections</td>
<td>8 categories, 120 endpoints</td>
</tr>
</tbody>
</table>

### Token Usage Comparison

<table>
<thead>
<tr>
<th>Approach</th>
<th>Lines Processed</th>
<th>Tokens Used</th>
<th>Coverage</th>
</tr>
</thead>
<tbody>
<tr>
<td>Read everything</td>
<td>7,770</td>
<td>~95,000</td>
<td>100%</td>
</tr>
<tr>
<td>Matryoshka only</td>
<td>6,904</td>
<td>~6,500</td>
<td>65%</td>
</tr>
<tr>
<td><strong>Hybrid</strong></td>
<td>7,770</td>
<td><strong>~17,000</strong></td>
<td><strong>100%</strong></td>
</tr>
</tbody>
</table>

The hybrid method achieves a **82% savings** in tokens while retaining 100% of the original coverage. This approach combines two different strategies, one for compressing redundant information and one for preserving unique insights.

The pure Matryoshka approach ends up missing details from small files (configuration defaults, web server classes), because Claude only uses the tool to query large ones. The hybrid workflow does direct, full-content reads on small files, while leveraging Matryoshka to analyze bigger files, in a kind of divide-and-conquer strategy. All that's needed is to provide the agent an explicit hint on the strategy to use.

### Why Hybrid Works

Small files (<300 lines) contain critical details:

- - `util.py`: All configuration defaults, the API decorator implementation
- - `web.py`: Server architecture, CORS handling, request schema

These fit comfortably in context, and there's no need to do anything different. Matryoshka adds value for:

- - `__init__.py` (2,244 lines): Query specific patterns without loading everything
- - `README.md` (4,660 lines): Search documentation sections on demand

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Adapters                            │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │   Pipe   │  │   HTTP   │  │   MCP Server          │  │
│  └────┬─────┘  └────┬─────┘  └───────────┬───────────┘  │
│       │             │                    │              │
│       └─────────────┴────────────────────┘               │
│                          │                              │
│                ┌─────────┴─────────┐                    │
│                │   LatticeTool     │                    │
│                │   (Stateful)      │                    │
│                │   • Document      │                    │
│                │   • Bindings      │                    │
│                │   • Session       │                    │
│                └─────────┬─────────┘                    │
│                          │                              │
│                ┌─────────┴─────────┐                    │
│                │  NucleusEngine    │                    │
│                │  • Parser         │                    │
│                │  • Type Checker   │                    │
│                │  • Evaluator      │                    │
│                └─────────┬─────────┘                    │
│                          │                              │
│                ┌─────────┴─────────┐                    │
│                │    Synthesis      │                    │
│                │  • Regex          │                    │
│                │  • Extractors     │                    │
│                │  • miniKanren     │                    │
│                └───────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

---

## Getting Started

Install from npm:

```bash
npm install matryoshka-rlm
```

### As MCP Server (Claude Code / Claude Desktop)

Add to your Claude configuration:

```json
{
  "mcpServers": {
    "lattice": {
      "command": "npx",
      "args": ["lattice-mcp"]
    }
  }
}
```

### Programmatic Use

```typescript
import { NucleusEngine } from "matryoshka-rlm";

const engine = new NucleusEngine();
await engine.loadFile("./document.txt");

const result = engine.execute('(grep "pattern")');
console.log(result.value); // Array of matches
```

### Interactive REPL

```bash
npx lattice-repl
lattice> :load ./data.txt
lattice> (grep "ERROR")
lattice> (count RESULTS)
```

---

## Conclusion


Matryoshka embodies the principle, emerging from RLM research, that documents are to be treated as external environments rather than as contexts to be parsed. This principle alters the fundamental character of the model’s engagement, no longer a passive reader but an active agent, navigating through and interrogating a document to extract specific information, somewhat as a programmer would browse through code. Combined with Barliman-style synthesis, in which a solution is built up in a series of small, well-defined steps, and pointer-based state management, it achieves:

- - **82% token savings** on real-world codebase analysis
- - **100% coverage** when combined with direct reads for small files
- - **Incremental exploration** where each query builds on previous results
- - **No context rot** because documents stay outside the model

We observe that variable bindings such as `RESULTS` refer to REPL state rather than holding data directly in model context. As we formulate and submit queries, what is sent to the server are mere pointers, placeholders indicating where the actual computation should occur. It is the server that executes the substantive computational tasks, returning only the distilled results.

The tool is open source: [https://github.com/yogthos/Matryoshka](https://github.com/yogthos/Matryoshka)

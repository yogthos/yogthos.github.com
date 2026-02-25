{:title "Managing Complexity with Mycelium" :layout :post, :tags ["programming" "llm" "lisp" "clojure"]}

Software architecture is at root a creature of human frailty. The sacred cow of clean code and the holy grail of design patterns are understood to be, at least in practical terms, little more than tricks to help people keep their sanity along the way. Human cognitive capacity is strictly limited, and we're still figuring out ways to reliably build machines significantly more complex than can be held in a single mind. Current attempts to offload coding tasks to language models are hitting the same wall. These models can be brilliant, but only up to a point. They’ll effortlessly compose a flawless function, but when challenged to manage a project with a thousand such moving parts, they quickly lose the plot. This problem is commonly known as context rot, but it might equally well be called a coding architecture failure.

If one hands an LLM a big pile of mutable state and loosely defined relationships, a solution that doesn’t actually work will be hallucinated inevitably, and when it does work, it will do so largely by accident. This comes about because there are just too many moving parts, and the ground truth cannot be kept track of. Humans are known to have exactly the same problem. Enormous amounts of time are spent chasing down bugs that exist because some distant part of the app decided to tweak a variable it didn’t own. Shared mutable state quickly leads to an overwhelming information flow, generating invisible threads between components that make it nearly impossible to know the scope of the change being made. Seemingly innocuous code changes end up mutating state in unintended ways that lead to unexpected consequences.

We solve difficult problems by dividing them into smaller, more manageable ones, and then composing them together. Successful architecture requires separable components, each with a function that is easy to grasp, and creating interfaces between them to abstract over their internal details and present to the outside world only their functional aspects. We must discover the boundaries between components, separate external effects from internal implementation details, and arrange for each component to control its own context. Then, and only then, can we be sure that we will always be working in a clear context that we can fit in our heads.

We naturally long for layers of organization. Hierarchies permit us to construct separate, self-contained units which can then be connected together to make larger structures. It's a powerful kind of architecture, one that facilitates writing large projects by abstracting over the complexity of the constituent parts. In working on a given component, we have to know all its details. But in using it, we only need to know what it does, which is entirely reflected in its API surface. The internal complexity is encapsulated within the API boundary. These are building blocks that give us a stable base upon which to build higher-level abstractions. Several such components can be assembled into a bigger block, where the connections between subcomponents become its internal complexity. The composite component becomes a new layer, providing its own API, which can be used by still higher-level abstractions. If what I'm describing sounds familiar, it is because that's exactly the way in which software libraries work. A library is simply a model of a class of problems, and when we encounter these types of problems, we can use it as an off-the-shelf building block.

A complex system has to be resilient and adaptable. But if every component is hooked directly into every other, there’s no way you can anticipate what a change in any one place will do. There are no boundaries to stop the chaos. Anything that works at scale relies on stable subassemblies. Herbert Simon described it long ago in a parable of two watchmakers. The first built his watches one piece at a time. He had to keep the entire complexity of the watch in his mind as he did his work, for any interruption would undo his progress and send the component pieces clattering to the floor. He worked on a flat plane of complexity, having to think through the workings of the entire watch just to insert a single gear. The other watchmaker did well because he first constructed small, stable modules which he was able to click together. So if he was interrupted, only a small amount of work was lost. He never had to think through more than a few components at a time. The system was resilient because it was built as a hierarchy of subunits, each able to stand on its own merit, and so the watchmaker had to consider a small context rather than the stupefying complexity of the whole.

Practically any large system can so be divided into smaller, nested subsystems, which communicate with one another as they go about their business. The intimate workings of other subsystems need hardly be known, which permits these modules to form. Individual components are not encumbered by what’s going on at other places where events are transpiring at different paces and according to a different set of circumstances. This is how hierarchies help in managing the complexity of a system. Each subsystem can evolve on its own. A malfunction in one region can be quarantined; it need not bring down the entire enterprise. A useful way to think of hierarchies is to treat them as connective tissue between the various subsystems of the program, as a principal means of control, providing the architecture and the infrastructure that coordinates the internal functioning of the individual parts of the system.

In contrast, in software development, practitioners are often confronted by the opposite scenario. Large software projects degenerate into a tangled web in which every function depends on a global state or a shared database connection. Humans have difficulty working with such systems because they can’t reason about their pieces independently. If a feature requires more information than can be kept in one’s head at once, guesses and assumptions begin to proliferate.

Just as humans need clear boundaries to maintain sanity, coding agents are even more vulnerable to cognitive saturation. There’s no intuition in a large language model that can tune out the noise. Everything is placed into its context window. If a piece of code is a labyrinth of obscure dependencies, the agent has to parse through it all to make a single modification. Eventually, the context becomes so cluttered that the purpose of the task gets lost in the entropy. The model starts hallucinating because of its inability to distinguish between the logic it’s supposed to refactor and the three hundred other things it’s presented with.

### Where We Are At

To understand how we might solve this for both humans and machines, let's first examine the tools we've already developed for managing complexity. The software industry has spent decades working out how to decompose code into manageable pieces. A very powerful set of tools for this purpose is already available. At the inter-process scale, there are microservices, which provide a physical boundary between programs. And at the intra-program level, there are techniques such as message passing, pure functions, and immutable data.

The functional style is particularly good at taming global state. Here, functions are the smallest building blocks, and pure functions can be considered on their own. The idea here is to build systems from separate, single-purpose parts, by using isolation, composition, and clear contracts inside the application's own logic. Code becomes a pipeline focused on the data flow. A program takes one piece of data as input, and produces another as output, pumping it through a sequence of pure functions. Since data is immutable, it is transparent and inert, having no hidden states or secret side effects. This is how stable contracts are formed. Once the transformations have been specified, the interface is a contract you can trust.

When you design applications in this way, the overall architecture looks like a network of railway lines, with the input data package needing to get from point A to point B. The package might pass through many different stations on the way to its destination, each one inspecting the package to decide where to route it next. An HTTP handler takes the payload, parses the request, determines the content type, and forwards it on toward an authentication handler. The authentication handler might inspect permissions in payload metadata to determine where to send it next, and so on. Eventually, the package arrives at its intended destination where the data gets serialized, stored, or presented to the user.

But even with all these great functional tools, we still tend to tangle two rather different kinds of code together. We mix code that cares what the data means and the code that cares how it travels from one component to another. Traditional software design structures embed the routing implicitly in the function call graph. For example, our authentication handler will have the logic to select the next function to invoke within its implementation. The control logic and its internal implementation details, thus, end up being intertwined in an ad hoc manner, resulting in a significant coupling problem. If you wish to alter the flow of your application, you must sift through voluminous amounts of incidental code describing the internal minutiae of component implementations.

An effective solution to this problem is to use inversion of control by removing routing logic from the functions and elevating it to first-class citizenship in the design. Why is a state machine the natural fit for this, rather than an event bus or dependency injection? Event buses scatter routing logic to the winds with components shouting into the void, making the overall flow impossible to trace. Implicit callbacks hide the flow inside the implementation. State machines, on the other hand, make routing declarative and visible in one place. They force the separation of *what to do* from *how to do it*.

### Introducing Mycelium

I’ve spent a great deal of time considering how to construct a system where distinct components are clearly separated by design, with clear boundaries between semantics of the code and the implementation details. This is the basic conceptual orientation of [Mycelium](https://github.com/yogthos/mycelium/), which treats the program as a recursive ecosystem of workflows, solving the very routing problem described above.

Clojure provides the tools for writing pure functions, but falls short of giving us guidance on how to orchestrate them when writing large applications. I initially developed [Maestro](https://github.com/yogthos/maestro) to provide a clear organizational framework, separating side-effectful concerns from pure calculation, and structuring workflows as graphs where the nodes represent computations of state, and the edges represent transitions between them. The nodes are distinct, context-free blocks, responsible for specific tasks, linked by a thin coordinating layer controlling the flow of data between them. The state itself is represented as a map that's passed from one node to another.

The business logic for each node lives inside a Mycelium component called a cell. Since cells are completely unaware of one another, they are inherently isolated. Each one can be viewed as a miniature self-contained application. It knows how to do its specific job and adheres to a strict lifecycle. It takes a state map, loads the data, runs the logic, and computes a new state as its output. All they can access are the IO resources, and a map containing the input state.

Maestro is responsible for arranging these transitions, so that the decisions are pure, and their effects are encapsulated. When a component needs to move itself from one state to another, it does not simply reach in and take what it needs. Instead, it updates the state map, and delegates to Maestro to orchestrate the transition. Again, this keeps the code responsible for deciding what will happen next separate and distinct from the private parts of the individual cells.

Each cell is additionally wrapped in a [Malli](https://github.com/metosin/malli) schema, which gives the cell a protocol to abide by. You can’t simply hope that the LLM will understand your intentions when they’re expressed in plain English. What you need is a formal contract to determine whether the implementation is correct. Malli enables us to specify precisely what a cell is entitled to receive and what it can produce as its output. It's a flexible way to encode deep, structural invariants representing the interface of the cell.

An agent tasked with constructing a handler for a particular node operates within the constraints of a contract, enforced by the schema, both during development and at runtime. Crucially, the agent doesn't need to scour the codebase to discover the relevant cell; the orchestration layer (acting as a Conductor) assigns the specific cell ID and its schema directly to the agent. It operates within a tightly bounded context provided to it. If the code produced by the agent does not adhere to the contract, if the output is even slightly off, the system will reject it providing meaningful feedback on what went wrong.

Think, for a minute, about what this does for the scope creep problem. The schema defines the boundary of the cell letting the agent know exactly what keys are in the map, what the data types are, and what the constraints are. Since the components do not interact directly, the agent has a well-defined, perfectly sized context that it needs to understand.

We now have a self-correcting loop. The primary agent, the Conductor, designs the workflow in EDN. A fleet of smaller, specialized agents do the individual tasks. If one of them makes an error, it is detected by the Malli contract before it can propagate forward to the next node in the graph. The specific validation failure is known at the point where it arose, and its scope is limited to the node that produced it.

### The State Machine Graph as a Contract

Treating an application's high-level behavior as a state machine graph provides us with a master blueprint. It allows us to determine what the intent of a particular workflow is by reading a declarative schema describing the states and the transitions between the cells. A human can review and approve a data flow diagram, which specifies the semantics of each cell, and the rules guiding the flow of data across them. The details of how each cell functions are abstracted behind its API, and managed by the agent responsible for implementing its functionality. Hence, the orchestrator only needs to concern itself with the routing aspect of the application and ensuring that the schemas of nodes sharing an edge are compatible.

The orchestration layer is in charge of directing the work, and executing the branching logic. Its sole concern is to examine the results from each node to decide on the next branch to take according to the EDN specification.

Because the intercellular connections form a directed graph, and since motion is governed by payload state, with the routing logic separated from the cell code, you can, in principle, determine the entire decision tree of the application just by examining the EDN spec. Instead of having to dig through conditional branches buried in thousands of lines of implementation code, you have a declarative map of possibilities.

### How This Works in Practice

You can glimpse the way in which Mycelium binds these ideas together by examining a snippet from the [user-onboarding](https://github.com/yogthos/mycelium/tree/main/examples/user_onboarding) demo. The workflow definition is the point of departure. We start by defining a cell and its strict contract:

```clojure
;; A cell contract for session validation
{:id       :auth/validate-session
   :doc      "Check credentials against the session store"
   :schema   {:input  [:map
                        [:user-id :string]
                        [:auth-token :string]]
              :output {:authorized   [:map
                                       [:session-valid :boolean]
                                       [:user-id :string]]
                       :unauthorized [:map
                                       [:session-valid :boolean]
                                       [:error-type :keyword]
                                       [:error-message :string]]}}
   :requires [:db]}

```

This map represents a stable building block. There is no ambiguity in a declarative specification. A cell is defined by the shape of its input and output, along with its resource requirements. The routing logic is extracted entirely into separate `:edges` and `:dispatches` keys in the workflow.

```clojure
 :edges
 {:validate-session {:authorized   :fetch-profile
                     :unauthorized :error}}

 :dispatches
 {:validate-session [[:authorized   (fn [data] (:session-valid data))]
                     [:unauthorized (fn [data] (not (:session-valid data)))]]}

```

The edges shown in the snippet represent the possible transitions. The dispatches constitute a list of node identifiers, each with an associated decision function that examines the state and determines whether it should be processed by the identifier in question. Dispatches are processed on a first come, first served basis; that is, the state will be routed to the first matching identifier found.

Next, we have the cell associated with the spec, which is responsible for performing the actual work. Following [Integrant](https://github.com/weavejester/integrant) philosophy, the cells are defined as a collection of multimethods.

```clojure
(defmethod cell/cell-spec :user/fetch-profile [_]
  {:id      :user/fetch-profile
   :doc     "Fetch user profile from database"
   :handler (fn [{:keys [db]} data]
              (if-let [user (db/get-user db (:user-id data))]                
                (assoc data :profile (select-keys user [:name :email]))
                (assoc data
                       :error-type    :not-found
                       :error-message (str "User not found: " (:user-id data)))))})

```

Note how the `:user/fetch-profile` handler doesn’t need to know where the data came from, nor does it decide where to send it. All it receives is the current state. The cell does its work and then returns an updated map. The orchestration layer evaluates the `dispatches` against this new data to select the next `edge`.

Long before a user ever makes a request, the workflow goes through a rigorous validation phase at compile time. During startup, the engine verifies that every cell exists in the registry, that every transition has a valid destination, and that all the input and output schemas chain together with no discontinuities. This is the moment where the blueprint becomes an active, executable process.

When a request (like `POST /api/onboarding`) actually arrives, the HTTP routing library recognizes the endpoint and shoves it onward to an onboarding handler. This handler summons the pre-compiled workflow engine, giving it the database connection and the raw request. As the state machine proceeds through its transitions, the Malli schemas are serving as sentinels.

### Reliability, Debugging, and Testing

The **State Map** acts as the single source of truth throughout this lifecycle. Every transformation is explicit in the return value, and there are no side channels modifying the state. Like a messenger, it travels through the system, carrying on its person all the data that has been gathered up to this point, as well as associated metadata.

Because the state map keeps a `:mycelium/trace` of every transition, you get unparalleled observability. If a workflow fails, you don’t just get a stack trace telling you where in the codebase the crash happened; you get the full history at the moment of failure. You can see the inputs, the previous steps, and the exact data that caused the routing logic to stumble. For the coding agent, it’s as if there’s a black box flight recorder on every single run.

Such level of observability fundamentally transforms how we test applications. Testing in often seen as a thoroughly distasteful chore, so much so that you will often find people spending more time with mocks and dependency injection than actually writing tests.

Mycelium treats each fragment of logic as a pure update of a data structure. Testing reduces to a straightforward exercise in data juggling. You don’t have to mock up a database to test how a particular system handles a User Not Found scenario; you simply feed the component a state map lacking the `:user` key and see what output it produces.

Because every workflow node is contractually bound by its Malli schema, you can take the `:validate-user-data` handler, feed it a map of bad data, and check that it sets an `:invalid` key on the state map. You’re not testing the whole onboarding flow; you’re testing one specific cell.

In Mycelium, logical integration tests can be performed trivially, simply by executing the workflow with a mock resource map. Resources like the database are passed in separately, so a real Postgres connection can be exchanged for a mock in the test suite. The difference is entirely irrelevant to the workflow.

```clojure
;; A logical integration test
(deftest onboarding-workflow-test
  (let [ds       (create-test-db!)
        compiled (wf/compile-workflow onboarding-manifest)
        result   (fsm/run compiled
                         {:db ds}
                         {:data {:http-request
                                 {:body {"email" "test@example.com"}}}})]
    (is (some? (:profile result)))
    (is (= "test@example.com" (get-in result [:profile :email])))))

```

Because of the trace history, your test assertions become incredibly descriptive. You aren't just checking if the final result is `200 OK`. You are able to check that the system moved from `:start` to `:validate-session` to `:fetch-profile` in the exact order you expected. You get the confidence of a full system test by simply passing mock resources to your workflow, and verifying that transitions happen in correct order.

### Layered Abstraction and Infinite Scale

The entire design is naturally recursive. A complete system implemented as a network of cells can itself be viewed as a single cell, which offers up an interface and can then be slotted into a yet-larger state machine network. You might have a simple network handling user login, which becomes a component in a medium-scale network managing the payment process, which itself becomes a component in a large-scale network implementing a complete online emporium. Scaling becomes a matter of arranging components on a graph rather than increased coupling within the codebase.

But of course, there must be clear boundaries set for such a system. The most promising way to define components and graphs draws on functional programming and formal methods. For example, Malli-driven schemas provide a means of establishing checkpoints that the LLM agent cannot bypass. The agent must fulfill the contract by adhering to all the constraints and requirements.

Once the high-level design is in place, these contracts can be issued to the agents in charge of the nodes in the graph. You no longer need an exceptionally capable agent that's able to comprehend a massive context and keep track of the interconnections across a sprawling application. The job description of the agent in charge of the flow of control is likewise dramatically circumscribed. The internal details of the cells can be ignored, with attention paid only to the graph itself. If the graph grows too complex, it, too, can be divided into separate, independent subgraphs. In this architecture, the context never needs to become unmanageably large.

### The Agent Synergy

Historically, this kind of design has been hard to sell. Workflow engines and state-graph systems are not without their proponents, but they haven’t exactly swept the world. The basic problem is that they require a lot of additional ceremony. While wiring functions together by hand permits the programmer to forge ahead in a straight line, forcing yourself to step back, design a state graph, worry about the transition logic among disparate files, and code the glue just feels too onerous. Most programmers would much rather just bang out an `if` statement and keep going.

But the picture changes completely when we introduce coding agents. A large language model lacks ego and has no difficulty writing boilerplate code. It does not find itself bored by ceremony, nor frustrated by the need for upfront structural planning. In fact, language models thrive on it. What is a tedious tax for a human developer serves as an explicit, unambiguous map for an agent. By embracing this structure, the agent secures the very boundaries it needs to stay coherent.

Divorcing data flow from data transformation resolves the problem of LLM context overload in an elegant and general way. A strategic agent, in the form of the Conductor, coordinates the flow in the orchestration layer, plotting the tracks. Meanwhile, individual handler agents are responsible for writing, refining, and documenting their particular domain which is just a station on the railway. They do so within a safe, bounded context, avoiding the thicket of intractable problems posed by runaway cognitive saturation.

Imagine a future in which coding agents assemble software systems by integrating and adapting existing workflows that have been approved by human oversight. We no longer have to suffer the frustration of constructing complex machines built out of opaque and unreliable components. We can rely on standardized and tested building blocks, following a clear and verifiable assembly plan, so that the resulting system is guaranteed by its very design to be correct, adaptable, and observable.
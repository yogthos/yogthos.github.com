{:title "Managing Complex Application State with Reactive Data Flows" :layout :post, :tags ["programming" "clojure" "jolt" "gui"]}

Reactive UIs look deceptively easy in a small app where you can keep things in sync without much effort. The trouble starts once the app starts to grow and accumulate real business logic. You often end up with cascading sets of rules that depend on derived values. On top of that, some of the data has to flow out to external services while more keeps coming in from them back into your application. Ensuring that all of it stays consistent while the user is busy clicking things and entering data in the UI is not trivial, as anybody who's built these kinds of apps knows.

## Four building blocks

The good news is that we can use four building blocks to break the problem down. [Datastar](https://data-star.dev) and [glimmer](https://github.com/jolt-lang/glimmer) give us an easy way to create a reactive UI that responds to changes in the data. [Domino](https://github.com/domino-clj/domino) provides a transactional data flow engine which encodes all the business logic. [Ebb](https://github.com/jlt-commons/ebb) gives us a clean way to coordinate data flows in and out of the system.

All these pieces happen to fit together in a neat way. Ebb sits at the edges and coordinates external events coming into the system. Those events get transacted in Domino, where any derived values are calculated, and then a glimmer reactive atom drives the UI updates based on the resulting state. User input flows the other way going from the UI into Domino, getting transacted and triggering effects that flow back out of the system through Ebb.

## Ebb at the edges

Ebb ends up acting as a service bus with access to external resources such as a database, external APIs, or functionality like sending emails and generating PDFs that the app needs to hook into. These are all data flows at the edges of the application that you want kept away from the business logic.

It's a port of the [Missionary](https://github.com/leonoel/missionary) JVM library which leans heavily on the Java ecosystem to do the heavy lifting. While that made it impossible to use Missionary directly, Jolt fibers happen to line up nicely with the way Missionary works conceptually. Ebb implements Missionary's API in pure Clojure on top of Jolt's fibers, and passes Missionary's own test suite. Having real fibers even improves on the original in one respect. Missionary's `?` operator can only park when it appears syntactically inside the process body, because the coroutine transform it relies on is lexical. But each fiber carries a real stack, so in Ebb it's possible for functions to park at any call depth.

The core idea behind Missionary is to provide a library for supervised data flow programming where asynchronous effects can be treated as composable values. It tackles the problem of coordinating time and state in concurrent applications by linking the exact lifespan of any allocated resource to the period its data is actually needed by a consumer. This is accomplished using a directed acyclic graph supervision model where shared dependencies are allocated upon the first request and disposed during the final release.

The biggest advantage of this approach is that it does away with the memory leaks and state inconsistencies that plague reactive software development. Because the architecture forces strict boundaries around how and when asynchronous event streams are kept alive, you never have to worry about problems like an orphaned websocket or zombie threads eating up system resources. Every dependent resource is recursively cleaned up when a component unmounts, and that gives you a mathematically sound foundation for continuous time reactivity.

One interesting aspect of Missionary design is to use a bidirectional flow protocol which allows producer and consumer processes to negotiate backpressure in order to invalidate stale data before expensive recomputations can be triggered. The dashboard example at the end of the post reads a producer through two lanes contrasting the two ways of handling backpressure.

Lane A subscribes with `m/observe`, which pushes values at the consumer from a reader thread as they arrive. Since `m/observe` has no backpressure of its own, it needs to be paired with `m/relieve` to keep the newest value and drop the rest when the consumer starts to lag. Cancelling the flow runs the `cleanup` function, which destroys the child process ensuring that nothing is left holding a pipe or a pid.


```clojure
(defn- observed-lines
  "A flow of producer lines, pushed from a reader thread."
  [k produced]
  (m/observe
   (fn [!]
     (let [proc (spawn-producer! k)
           rdr  (io/reader (:out proc))]
       ;; a reader thread loops over (.readLine rdr), bumping produced
       ;; and pushing each line with (! line)
       (fn cleanup []
         (kill! proc))))))

(defn- lane-a-flow [produced delivered]
  (let [source (m/relieve (fn [_ x] x) (observed-lines :a produced))]
    (m/ap
     (let [line (m/?> source)]
       ;; parking here lets the upstream
       ;; relieve collapse values
       (when (pos? @consumer-delay-ms)
         (m/? (m/sleep @consumer-delay-ms)))
       (swap! delivered inc)
       (parse-line line)))))
```

Lane B pulls one line per unit of demand instead, so when the consumer slows down, the OS pipe fills up causing the producer to stall. In this scenario, the pressure stays at the source so that values aren't dropped.

```clojure
(defn- pulled-lines
  "A flow that reads one line per unit of demand. `m/via m/blk` moves the
  blocking read off the flow's thread; because nothing reads ahead, the
  pipe fills and the producer blocks in write(2)."
  [k]
  (let [proc (spawn-producer! k)
        rdr  (io/reader (:out proc))]
    (m/ap
     (loop []
       (if-let [line (m/? (m/via m/blk (.readLine rdr)))]
         (m/amb line (recur))
         (m/amb))))))
```

## Domino

The data flow model used by Missionary happens to be a perfect fit for Domino, which is used to manage the state of the application. A document describing the data model sits at the core of Domino, tracking all the fields associated with the application's data. Business logic is expressed on top of the data model by attaching context-free functions to paths within the document to act as rules. A rule is triggered whenever a value changes at a path declared as its input, and the rules cascade in a transaction that produces a new state of the document. Once the document transacts, effects can be triggered that hand data off to the flow layer managed by Ebb.

I tend to think of an application as a state machine, and that's really the core idea behind Domino's design. An event gets triggered, which can be a user input, a system event, a service call, whatever, and it gets fed as an input into the data flow engine. Rules fire in a cascading fashion, and at the end you get a new state. Then you can fire effects, update the UI, and so on.

Here we can see what that looks like in concrete terms on the demo dashboard. A sample lands in the document as a single transaction on the `[:sample]` path which triggers a cascade of rules. The events are declared as data with each explicitly stating the paths it reads and writes, which allows computing the relationship graph.

```clojure
(def events
  [{:id      :record-history
    :inputs  [:sample]
    :outputs [:history]
    ;; append the sample to the capped history series
    :handler ...}

   {:id      :compute-stats
    :inputs  [:history :window]
    :outputs [:stats]
    ;; stats over the last :window samples
    :handler ...}

   {:id      :compute-pressure
    :inputs  [:stats]
    :outputs [:pressure]
    :handler (fn [_ {:keys [stats]} _]
               {:pressure (+ (* 0.55 (get-in stats [:cpu :avg] 0.0))
                             (* 0.35 (get-in stats [:mem :last] 0.0))
                             (* 0.10 (get-in stats [:io-wait :last] 0.0)))})}

   {:id      :classify-alert
    :inputs  [:pressure :warn-threshold :crit-threshold]
    :outputs [:alert-level]
    :handler (fn [_ {:keys [pressure warn-threshold crit-threshold]} _]
               {:alert-level (cond
                               (>= pressure (or crit-threshold 0.85)) :critical
                               (>= pressure (or warn-threshold 0.55)) :warn
                               :else                                  :ok)})}])
```

The vector of events also acts as a spec for what the app does, clearly stating every business rule that's fired from the raw sample to the alert level. The thresholds and the window are hooked up to sliders that can be dragged to re-run the same pure events without a new sample arriving. One subtlety worth noting is that Domino runs an event once per changed input path which requires handlers to be idempotent.

With Domino you get a transactional data flow engine for managing the state of the application. Inputs come in, a transaction happens, and outputs come out. The real benefit is knowing exactly what the relationships are between all the fields in the document and the business rules associated with them. I've found that's the actual business problem in most large applications I've worked on. You end up with a lot of business logic along with many derived fields, and the complexity of their relationships gets too big to keep in your head. Then somebody comes and asks for a new business rule, and it becomes impossible to guarantee that adding it won't break some other rule within the system.

Taxes and loans are a really good example. You have a bunch of things that get calculated together, and the formulas change over time as the laws get updated, so you have to maintain clear rule sets for each scenario. When the calculations are scattered across the code base, there's no easy way to see what a given change touches, and no easy way to prove the rules are still consistent afterwards.

Another context I have direct experience working in is a hospital, where patient data needs to be coordinated between different teams. An app used to do patient assessments for surgeries will need to coordinate data between nurses, surgeons, dietitians, and other clinical staff. You end up with large forms that track many hundreds of different fields, and those fields are then used to calculate the scores for the pre-surgery assessment. Nobody can hold all of that in their head, and every field can potentially affect the outcome making it important to ensure the scores are derived correctly.

## Reusable rules and views

Domino's approach makes the business logic reusable and composable, because the rule functions and the UI widgets are context free. If you write a formula for calculating BMI, that formula becomes a building block you can attach to any two fields representing height and weight, along with an output field for the BMI. A table widget can collect rows of information, and a graph widget can attach to the same path and render trends over time.

Domino also lets you create views attached to the schema, and these are used to map the fields in the document to the UI. If you have two roles such as a nurse and a surgeon, they might care about different subsets of the data in the document, and those subsets are likely to overlap. Being able to attach different views with their own widgets, naming conventions, and the fields they display makes it easy to express the same underlying data in different ways based on the context. Since the views still go through the common transact mechanism over the whole document, the values are recalculated whether they appear in a given view or not. A nurse might be collecting the height and weight of a patient, while the doctor only cares about the resulting BMI. Since the nurse doesn't need to see the BMI for it to be calculated, what's shown in the view has no direct relation to the business rules that still need to be fired. Whether you show a piece of data to the user or not, the business logic has to stay consistent across the document.

Another problem this approach solves is concurrent multiuser workflows. Since you know the subgraph of fields affected by any set of rules up front, you can lock those fields together whenever a user is editing a field belonging to the set. Different users can safely work on different parts of the document without worrying about overwriting each other's data. The related fields stay locked while a user edits, and the logic gets applied transactionally once they're done.

## The UI layer

That leaves the final piece of the puzzle, which is the interface itself. Glimmer is a reactive GUI toolkit where you write Reagent-style components that return hiccup. Its sole job is to keep the widget tree in sync as the reactive state changes, and [glimmer-datastar](https://github.com/jolt-lang/glimmer-datastar) implements the server side of the Datastar protocol on top of glimmer. The page holds an open server-sent events stream, and the server re-renders the fragment and pushes it out whenever the state changes. The browser stays a dumb terminal with all the business logic living on the server.

In pretty much any large app I've worked on, I found that you always want to keep the application state in one place. Either it lives entirely on the front end and the backend is treated as a service bus, or it lives entirely on the backend with the client being responsible for collecting input and displaying UI widgets. Splitting the state across both sides means the two constantly have to negotiate over who owns what, creating a source of subtle bugs.

In the dashboard, the authoritative Domino context lives in an atom which is written to at whatever rate the machine produces samples. It, in turn, publishes to a reactive glimmer ratom on a timer, and that ratom is what the SSE streams subscribe to. This keeps the page from repainting at the rate that the data streams into the system, and prevents a misbehaving client from reaching back into ingestion.

```clojure
;; the authoritative domino context is a plain atom
(defonce ctx (atom nil))

;; the single reactive cell the SSE renders subscribe to
(defonce view (ratom/atom {:db nil :cascade [] :log []}))

(defn publish!
  "Mirror the authoritative state into the view. One caller, on a timer."
  []
  (ratom/reset! view {:db (db) :cascade (change-history) :log @log-entries}))
```

The page itself is then just a function of that snapshot.

```clojure
(defn fragment
  "The live region, rendered from one published snapshot."
  [live?]
  (let [{:keys [db cascade log]} @state/view
        {:keys [sample history stats alert pressure controls]} db]
    [:div#app-body
     (alert-banner alert)
     (gauge pressure (:warn controls) (:crit controls))
     ;; metrics, the side panels, and the controls rail
     ...]))
```

## The dashboard example

I put together [a dashboard](https://github.com/jolt-lang/examples/tree/main/reactive-dashboard) that ties all of these ideas together. It's a live system monitor which renders the CPU, memory, and network figures that come out of /proc, so the page shows what the machine is currently doing.

Each layer sits in its own namespace, and their split follows the architecture I've discussed above. At the bottom we have app.pipeline, which is the Ebb layer that owns the streams which can sleep, require retries, or get cancelled. The app.state is managed by the Domino layer which sits between the data streams and the UI. Finally, app.ui renders hiccup from the published snapshot and hands it to Datastar.

The pipeline runs three ingestion lanes side by side, each demonstrating a different discipline against a live producer. Lane A pushes through m/observe into m/relieve, so the producer doesn't have to wait on a slow consumer. Lane B pulls one line per unit of demand through m/via m/blk ensuring that nothing is dropped with the pressure landing on the OS pipe instead. Lane C is a poll loop on a timer, because procfs builds its files at read time meaning that there's nothing to subscribe to. When you pause lane A, the flow gets cancelled, which kicks off the cleanup to destroy the child process, causing the pid to disappear from the lane card on the page.

Each sample arrives as a single Domino transact, and from there the cascade runs from the raw sample to window stats to a composite pressure index to an alert level. The Cascade panel lists the paths the last transaction wrote, using their execution order. The Model panel draws the event graph straight from the schema to render the actual business logic. The Log panel interleaves Domino transactions with Ebb task lifecycle events to illustrate the plumbing between the layers while the app runs.

Notably, Domino effects never perform IO themselves. Instead, an effect posts a request onto an Ebb mailbox that's drained by the supervisor fiber which spawns the matching task. Then, each task transacts its own result back into the document once it completes. The live context sits in a glimmer ratom allowing every connected page to repaint when the model changes.

The effect that asks for alert delivery fires on transitions to post a request onto the bus.

```clojure
{:id      :announce-alert
 :inputs  [:alert-level]
 :handler (fn [_ {:keys [alert-level]}]
            (bus/request! {:type :alert :level alert-level}))}
```

In Ebb, a mailbox post hands the value directly to a waiting consumer and runs it until it parks again, on the posting thread. Effects fire inside the transaction while a write lock is held, and the supervisor's handlers transact, so posting inline would deadlock the two sides against each other. So, requests have to be collected during the transaction and posted once the lock is released.

```clojure
(defonce requests (m/mbx))

(defn request!
  "Post a request, or collect it if a transaction is in progress."
  [req]
  (if-let [collector *collector*]
    (swap! collector conj req)
    (requests req)))
```

The supervisor fiber sits on the other side of the bus to consume requests and turn them into tasks.

```clojure
(defn- drain-task
  "Take one request at a time and handle it before taking the next."
  [config]
  (m/sp
   (loop []
     (let [req (m/? bus/requests)]
       (handle! config req)
       (recur)))))
```

The alert below calls the sink, and retries with linear backoff while the sink keeps refusing, writing every attempt back into the model. The sink's failure rate is itself a slider, so retries can be exercised on demand.

```clojure
(defn alert-task
  "Deliver an alert, retrying with linear backoff."
  [level max-attempts]
  (m/sp
   (loop [attempt 1]
     (state/transact! [[[:alert :delivery]
                        {:status :sending :level level
                         :attempt attempt :max max-attempts}]])
     (let [outcome (m/? (m/attempt (deliver-once level attempt)))]
       (if-let [err (try (outcome) nil (catch Exception e e))]
         (do (m/? (m/sleep (* 200 attempt)))
             (recur (inc attempt)))
         (state/transact! [[[:alert :delivery]
                            {:status :delivered :level level
                             :attempt attempt :max max-attempts}]]))))))
```

The full task also gives up after the configured number of attempts, and a cancelled alert means that the level recovered or a newer alert replaced the current one.

User input is treated as just another event into the system. Every slider transacts new values into the document to trigger rules and effects.

```clojure
(defn- control-route
  "Every slider lands here: coerce, transact, and let Domino's effects
  act on the change downstream."
  [path signal value]
  (state/transact! [[path value]])
  (patch {signal value}))
```

Changing the sample interval transacts the `interval-ms` control, whose effect asks the supervisor to cancel lane C and spawn it again at the new rate.

What I like about this setup is that each piece ends up doing a well-defined job. Ebb owns time and cancellation, Domino owns the rules describing the business logic, and the UI just renders whatever the state happens to be at any particular time. The business logic lives in a transactional document where every dependency is declared explicitly, making it clear and transparent.
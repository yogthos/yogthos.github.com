{:title "Structuring Clojure Applications", :layout :post, :tags ["clojure" "architecture"]}

This post will take a look at a strategy for structuring Clojure applications that I've found useful in my projects.

While the idea of writing applications in a pure functional style is appealing, it's not always clear how to separate side effects from pure compuation in practice. Variations of [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) approach are often suggested as a way to accomplish this goal. This style dictates that IO should be handled in the outer layer that wraps pure computation core of the application.

While this notion is appealing, it only works in cases where the totality of the data that will be operated on is known up front. Unfortunately, it's impossible to know ahead of time what data will be needed in most real world applications. In many cases additional data needs to load conditionally based on the type of input and the current state of processing.

What we can do, however, is break up our application into small components that can be reasoned about in isolation. Such components can then be composed together to accomplish tasks of increased complexity. I like to think of this as a Lego model of software development. Each component can be viewed as a Lego block, and we can compose these Lego block in many different ways as we solve different problems.

The problem being solved can be expressed in terms of a workflow represented by a graph where the nodes compute the state, and the edges represent transitions between the states. Each time we enter a node in this graph, we look at the input, decide what additional data we may need, run the computation, and transition to the next state. Each node in the graph is a Lego block that accomplishes a particular task. These nodes are then connected by a layer of code governs the data flow.

One approach to implement the above architecture is to use a map to describe overall state, then pass it through multimethods that each operate on a particular type of state and produce a new one. Each multimethod takes the state map as a parameter, does some operations on it, and then returns a new map that gets passed to the next multimethod. If you're thinking that this sounds a like a state machine then you're very much correct.

### Implemention

Let's take a look at a concrete example of what this looks like in practice. Say we have a workflow where one user would like to send an email money transfer to another user using our system. There are a few cases we might want to handle here.

There's the happy path scenario where both users are in the system. In this case we simply withdraw the amount from the payor account and deposit it into the payee account.

Another scenario could be that the payor does not have the sufficient funds to do the transaction. In this case we may want to suspend the transaction until the user adds more funds.

Finally, the user receiving the funds may not be in the system, and they need to be invited before they can accept the transfer.

We can start by defining a few helper functions that represent interactions with external resources.

```clojure
(def store (atom {:workflows {"33a19b1f-c7d1-45d8-9864-0ea17e01a26d"
                              {:id "33a19b1f-c7d1-45d8-9864-0ea17e01a26d"
                               :from   {:email "bob@foo.bar"}
                               :to     {:email "alice@bar.baz"}
                               :amount 200
                               :action :transfer}}
                  :users {"bob@foo.bar" {:funds 100}
                          "alice@bar.baz" {:funds 10}}}))

(defn persist [store {:keys [id] :as state}]
  (swap! store assoc-in [:workflows id] state))

(defn query [store email]
  (get-in @store [:users email]))

(defn load-state [store workflow-id]
  (get-in @store [:workflows workflow-id]))

(defn send-invite [email]
  (println "sending invite to" email))

(defn notify-user [email message]
  (println "notifying" email message))

(defn send-transfer [store from to amount]
  (println "transfering from" from "to" to amount)
  (swap! store
         #(-> %
             (update-in [:users from :funds] - amount)
             (update-in [:users to :funds] + amount))))
```
Next, we'll create a map to represent the initial state of the workfow.

```clojure
{:id "33a19b1f-c7d1-45d8-9864-0ea17e01a26d"
 :from   {:email "bob@foo.bar"}
 :to     {:email "alice@bar.baz"}
 :amount 200
 :action :transfer}
```

The map will contain a unique id, some initial data that represents user input, and an `:action` key indicating what action should be applied to the current state of the workflow.

Let's define a multimethod that will dispatch the approprate action handler based on the value of the `:action` key. The multimethod will accept a map of resources as the first argument. The resources represent any code that deals with IO side effects such as database connections. The map representing the state of the workflow will be passed in as the second argument.
 
```clojure
(defmulti handle-action (fn [_resources {:keys [action]}] action))
```

We can now define a handler for the `:transfer` operation. This multimethod will hydrate some additional data about the users from the datastore, take the appropriate action, and return a new state with the updated `:action` key to indicate the next step in the workflow.

```clojure
(defmethod handle-action :transfer [{:keys [store]} {:keys [from to amount] :as state}]
   (let [from-info (query store (:email from))
         to-info   (query store (:email to))
         available-funds (:funds from-info)
         state     (-> state
                       (update :from merge from-info)
                       (update :to merge to-info))] 
     (cond
       (nil? to-info)
       (assoc state :action :invite) 
       (>= available-funds amount)
       (do
         (send-transfer store (:email from) (:email to) amount)
         (assoc state :action :done))
       (< available-funds amount)
       (assoc state :action :notify-missing-funds))))
```

Let's add the handlers for `:invite` and `:notify-missing-funds` actions.

```clojure
(defmethod handle-action :notify-missing-funds [{:keys [store]} {:keys [from] :as state}] 
  (notify-user (:email from) "missing funds")
  (persist store (assoc state :action :transfer))
  {:action :await})

(defmethod handle-action :invite [{:keys [store]} {:keys [to] :as state}]
  (send-invite to)
  (persist store (assoc state :action :transfer))
  {:action :await})
```

Note that `:invite` and `:notify-missing-funds` actions persist the state and return the `:await` action when they complete. We'll use this behavior to indicate that the workflow is blocked on an external action and needs to be suspended.

Finally, we'll add a function that executes the state machine. This function will accept a map containing the resources along with a workflow id. It will load the current state and execute it by dispatching the multimethod defined above.

```clojure
(defn run-workflow
  [{:keys [store] :as resources} workflow-id]
  (loop [state (load-state store workflow-id)] 
    (condp = (-> state :action)
      :done state
      :await :workflow-suspended
      (let [state (handle-action resources state)]
        (recur state)))))
```

For simplicity's sake let's use an atom as our mock data store.

```clojure
(def store (atom {:workflows {"33a19b1f-c7d1-45d8-9864-0ea17e01a26d"
                              {:id "33a19b1f-c7d1-45d8-9864-0ea17e01a26d"
                               :from   {:email "bob@foo.bar"}
                               :to     {:email "alice@bar.baz"}
                               :amount 200
                               :action :transfer}}
                  :users {"bob@foo.bar" {:funds 100}
                          "alice@bar.baz" {:funds 10}}}))
```

We can now try running this workflow in the REPL. If we run it with the initial state, then we should see that the workflow was suspended because there were insufficient funds to transfer.

```clojure
=> (run-workflow {:store store} "33a19b1f-c7d1-45d8-9864-0ea17e01a26d")

notifying bob@foo.bar missing funds
:workflow-suspended
```

The workflow tries to notify the user of the missing funds and returns. Let's add more funds to the account trying to send the transfer.

```clojure
=> (swap! store assoc-in [:users "bob@foo.bar" :funds] 300)
```

The workflow restarts where it left off and completes the transfer successfully.

```clojure
=> (run-workflow {:store store} "33a19b1f-c7d1-45d8-9864-0ea17e01a26d")

transfering from bob@foo.bar to alice@bar.baz 200
{:id "33a19b1f-c7d1-45d8-9864-0ea17e01a26d",
 :from {:email "bob@foo.bar", :funds 300},
 :to {:email "alice@bar.baz", :funds 10},
 :amount 200,
 :action :done}
```

### Formalizing Side Effects

We can make one futher improvement over the implementation above by formalizing resource providers using protocols. Doing so will make it clear what the external dependecies are and facilitate mocking. Let's create `Notify` and `DataStore` protocols that look as follows.

```clojure
(defprotocol Notify
  (send-invite [email])
  (notify-user [email message]))

(defprotocol DataStore
  (persist [_ state])
  (query [_ email])
  (add-funds [_ email amount])
  (load-state [_ workflow-id])
  (send-transfer [_ from to amount]))
```

Next, let's add a couple of records that implement these protocols.

```clojure
(defrecord MockNotify []
  Notify
  (send-invite [_ email]
    (println "sending invite to" email))
  (notify-user [_ email message]
    (println "notifying" email message)))

(defrecord AtomDataStore [store]
  DataStore
  (persist [_ {:keys [id] :as state}]
    (swap! store assoc-in [:workflows id] state))
  (query [_  email]
    (get-in @store [:users email]))
  (add-funds [_ email amount]
    (swap! store assoc-in [:users "bob@foo.bar" :funds] 300))
  (load-state [_ workflow-id]
    (println "hi")
    (get-in @store [:workflows workflow-id]))
  (send-transfer [_ from to amount]
    (println "transfering from" from "to" to amount)
    (swap! store
           #(-> %
                (update-in [:users from :funds] - amount)
                (update-in [:users to :funds] + amount)))))
```

We'll also need to modify our multimethods to use `Notify` protocol instead of simply calling the functions we defined earlier.

```clojure
(defmethod handle-action :notify-missing-funds [{:keys [store notify]} {:keys [from] :as state}]
  (notify-user notify (:email from) "missing funds")
  (persist store (assoc state :action :transfer))
  {:action :await})

(defmethod handle-action :invite [{:keys [store notify]} {:keys [to] :as state}]
  (send-invite notify to)
  (persist store (assoc state :action :transfer))
  {:action :await})
```

Finally, we'll instantiate the records and passing them to our `run-workflow` function.

```clojure
(def store (->AtomDataStore (atom {:workflows {"33a19b1f-c7d1-45d8-9864-0ea17e01a26d"
                                                {:id "33a19b1f-c7d1-45d8-9864-0ea17e01a26d"
                                                :from   {:email "bob@foo.bar"}
                                                :to     {:email "alice@bar.baz"}
                                                :amount 200
                                                :action :transfer}}
                                    :users {"bob@foo.bar" {:funds 100}
                                            "alice@bar.baz" {:funds 10}}})))
(def notify (->MockNotify))

(run-workflow {:store store
               :notify notify} 
              "33a19b1f-c7d1-45d8-9864-0ea17e01a26d")

(add-funds store "bob@foo.bar" 100)

(run-workflow {:store store
               :notify notify} 
              "33a19b1f-c7d1-45d8-9864-0ea17e01a26d")
```

### Discussion

There are several aspects of the above approach that I've found to be particularly useful when building applications.

Each multimethod can be treated as a small program that can be reasoned about and tested independently. These multimethods can easily be structured using Clean Architecture style keepng IO at the edges.

Passing resources in as an explicit parameter allows decoupling IO from computation. This design lends itself well to testing since resources, such as the data store, are passed in explicitly. We can pass in a map of mock resources when running tests without any changes to the rest of the code. In fact, we can start developing against mock resources and ensure that the workflow logic works as intended before having to worry about connecting to databases or other systems.

Using a map to track the state of the execution makes it easy to inspect it. We can log this map to see what operation we're doing, what the data looks like, and so on. The state can also be easily serialized, allowing us to suspend and resume computation as needed. This is particularly useful in cases when the workflow needs to be suspended pending some external action as we saw earlier.

This design also plays well with Integrant which can be used to manage the system map containing stateful resources.

Most importantly, this type of architecture creates reusable components without implicit coupling. Each multimethod can be used indepenently of the others, and composed into different workflows. This gives us composable Lego blocks that we can use to build larger structures.





{:title "Wrapping GTK4 in 800 lines of Clojure with Jolt" :layout :post, :tags ["programming" "clojure" "jolt" "gui"]}

Native toolkits are not terribly ergonomic, and are a lot more painful to use compared with web dev in many ways. Building a UI with them is an imperative exercise where you construct widgets one call at a time, pack them into containers, and wire each event to its handler by hand. What's worse is that the structure of the interface often ends up living outside your language altogether forcing you to use tools like GtkBuilder XML or Xcode storyboards, where none of your usual tools for composing and refactoring code can reach. Layout is governed by box packing rules and constraint systems that are easy to describe but hard to predict. And a common task such as turning a list of items into a list of widgets that stay in sync with the data results in a ton of boilerplate that you have to repeat over and over.

The pain of working with native toolkits gave rise to things like Electron which simply package a browser engine as a frontend for the application. While that technically works, it's a clunky and inefficient hack around the problem. Every app ends up having to ship its own copy of the browser along with a JavaScript runtime, and the result never quite feels native.

However, even doing that still doesn't address the biggest frustration about having a compile cycle that breaks your development flow. And that's especially problematic when building a UI where you can't easily automate testing. You have to load up the app, click through its menus, and get it to a particular state so that you can visually inspect whether a change works as you intended and has decent UX.

Working with Reagent and other Clojure UI toolkits in ClojureScript is an enjoyable experience precisely because you can build up the UI gradually, and keep a running state as you add more components to it. You make a change, look at the app, see it instantly, and then iterate on it.

I've always been a big fan of the Reagent reactive model which I find to be intuitive. You treat your UI state as a data structure, and have UI components subscribe to paths within it. Whenever an element at a particular path changes, the UI component associated with it gets updated. And that's really all there is to it. While Reagent is built on top of React, the latter isn't actually needed in this model. React uses a VDOM that gets diffed and then rendered to the actual DOM, and the reason it needs a VDOM is due to the fact that React is agnostic regarding what triggers a component change. That's why you need the whole React lifecycle with checks for componentDidMount, componentWillUnmount, and so on. In Reagent a component collapses to a single render function, and the reactive tracking decides which components need to be re-run, so the lifecycle is derived from the state of the data. And because the reactive model already knows exactly what changed, it makes it possible to use it to drive the DOM directly without needing React as the [mr-clean](https://bitbucket.org/sonwh98/mr-clean/) library illustrates.

Since this model works well with a browser DOM, then why not apply it to a native toolkit? All that's needed is to create wrappers to render native widgets by passing them values from the reactive atom, and then provide a callback for the widgets to trigger on user input. We don't need an equivalent of a VDOM because all the changes are driven by the state of the reactive atoms, and can be rendered directly to the UI. This can even be done with a batching layer to control the rate of UI updates if needed. And this is how [glimmer](https://github.com/jolt-lang/glimmer) works, providing a reactive core that can be hooked up to a particular UI toolkit. Then, there are [glimmer-gtk](https://github.com/jolt-lang/glimmer-gtk/), [glimmer-uikit](https://github.com/jolt-lang/glimmer-uikit/), and [glimmer-tui](https://github.com/jolt-lang/glimmer-tui/) to provide concrete bindings for different types of UI widgets.

The canonical counter with glimmer-gtk looks pretty much exactly like its Reagent counterpart:

```clojure
(ns counter
  (:require [glimmer.ratom :as r :refer [atom]]
            [glimmer.core :as ui]
            [glimmer-gtk.core])) ; installs the GTK4 backend

(defn counter []
  (let [count (atom 0)]
    (fn []
      [:vbox {:spacing 12}
       [:label {:label (str "Count: " @count)}]
       [:hbox {:spacing 8}
        [:button {:label "- 1" :on-click #(swap! count dec)}]
        [:button {:label "+ 1" :on-click #(swap! count inc)}]
        [:button {:label "reset" :on-click #(reset! count 0)}]]])))

(defn -main [& _]
  (ui/run counter :title "counter" :width 320 :height 160))
```

The outer function runs once to create the local state, and the inner one re-runs whenever `@count` changes, patching the live widgets in place instead of rebuilding the tree. If you've used Reagent before, this should all look very familiar with the only difference being that the elements are GTK4 widgets instead of DOM nodes.

### What it takes to wrap a widget

It turns out that there is surprisingly little code involved in hooking a C toolkit up to a reactive Clojure core. The entire glimmer-gtk backend sits under 800 lines of Clojure split across four namespaces, and none of it involves anything exotic.

Jolt's FFI lets you promote a C function to the Clojure layer by naming the symbol it points at along with its argument and return types. We can see a few examples of what bindings from the GTK backend look like below.

```clojure
(ns glimmer-gtk.ffi
  (:require [jolt.ffi :as ffi]))

(ffi/defcfn gtk-button-new-with-label "gtk_button_new_with_label" [:string]
  :pointer)
(ffi/defcfn gtk-button-set-label "gtk_button_set_label" [:pointer :string]
  :void)
(ffi/defcfn gtk-box-new "gtk_box_new" [:int :int]
  :pointer)
(ffi/defcfn gtk-box-append "gtk_box_append" [:pointer :pointer]
  :void)
```

Pointers are plain machine addresses represented as numbers, strings are marshalled to and from C strings automatically, and GTK booleans are ints that are handled by a one line `->bool` helper. There is no C shim to compile or bindings generator to run, and no interface DSL to learn. The shared libraries are declared in `deps.edn` under `:jolt/native`, and Jolt loads them before the namespaces are required.

One thing to note here is that the main loop binding needs a bit of special treatment.

```clojure
(ffi/defcfn g-application-run "g_application_run" [:pointer :int :pointer]
  :int :blocking)
```

The `:blocking` flag tells the runtime that the call parks the thread for the lifetime of the app, so it shouldn't pin the garbage collector while GTK owns the main loop.

GTK's API is also full of enums like `GTK_ALIGN_START` and `GTK_ORIENTATION_VERTICAL`, so a common approach is to maintain a table of constants mirroring the C headers. But glimmer-gtk has no need for such tables since every GObject enum registers its members with a lowercase nick which maps to a Clojure keyword. So, three extra bindings are all it takes to resolve a nick to its integer value at runtime through the GObject type registry.

```clojure
(ffi/defcfn g-type-from-name
  "g_type_from_name" [:string] 
  :size_t)
(ffi/defcfn g-type-class-ref         
  "g_type_class_ref" [:size_t] 
  :pointer)
(ffi/defcfn g-enum-get-value-by-nick 
  "g_enum_get_value_by_nick" [:pointer :string]
  :pointer)
```

When you write `[:label {:halign :start}]`, the backend looks up the `GtkAlign` type to get its class struct, asks it for the member with the `start` nick, and reads the integer out of the struct it gets back. Successful lookups are then memoized, and a raw integer can still be used as an escape hatch. This trick is the reason why there isn't a single `GTK_*` constant needed anywhere in the library.

So that's all the boilerplate that's needed to expose the needed GTK components. With that in place, each hiccup tag can map to a widget spec in a registry. These specs are represented as small maps describing how to construct the widget, apply props to it, and what kind of container it is. Here is what the code for declaring a button looks like.

```clojure
(defn- ->bool [x] (if x 1 0))

(defn- button-spec []
  {:ctor    (fn [p]
              (if (:label p)
                (g/gtk-button-new-with-label (:label p))
                (g/gtk-button-new)))
   :apply   (fn [w p]
              (when (contains? p :label)
                (g/gtk-button-set-label w (:label p)))
              (when (:tooltip p)
                (g/gtk-widget-set-tooltip-text w (:tooltip p)))
              (when (contains? p :sensitive)
                (g/gtk-widget-set-sensitive w (->bool (:sensitive p)))))
   :container :none})
```

The reconciler drives these through a fixed lifecycle where `create!` runs the constructor, applies the props, and wires up the event handlers, while `apply-props!` re-runs the prop application against the existing widget on each re-render, patching it in place as needed. Handlers are connected once when the widget mounts, and they're expected to close over reactive cells, so the closure captured on the first render stays correct for the life of the widget, just like it does in Reagent.

Event props are `:on-*` keys looked up in a signal table.

```clojure
(def signals
  (atom {:on-click    "clicked"
         :on-change   "changed"
         :on-activate "activate"
         :on-toggled  "toggled"}))
```

Each handler gets wrapped in a `foreign-callable` and connected with `g_signal_connect_data`.

```clojure
(doseq [[event handler] props]
  (when-let [signal (@signals event)]
    (let [cb (ffi/foreign-callable
              (fn [widget _data] (handler))
              [:pointer :pointer] :void :collect-safe)]
      (retain-callable! cb)
      (g/g-signal-connect-data widget signal cb ffi/null ffi/null g/CONNECT-DEFAULT))))
```

The `:collect-safe` flag is important here because GTK calls the handler from inside the blocking main loop, and the callable also has to be retained on the Clojure side, since C holds it as a raw pointer that's opaque to the garbage collector.

Another detail worth noting is that GTK emits signals synchronously from its own setters, so when a re-render programmatically sets an entry's text, GTK fires `changed` on the spot which triggers the handler. Since the handler causes the atom to reset, you end up in a render loop. The fix is to bracket programmatic setters with a suppression set so that their emissions are ignored.

```clojure
(defn- set-entry-text! [widget text]
  (when (and (some? text) (not= text (g/gtk-editable-get-text widget)))
    (swap! suppressing conj widget)
    (g/gtk-editable-set-text widget text)
    (swap! suppressing disj widget)))
```

Both the widget and the signal registries are open, so adding a widget the library doesn't know about is simply a matter of writing its spec and registering it.

Finally, glimmer itself doesn't need to see any of this because a backend simply has to provide a map of eight functions handed to the reconciler at registration time.

```clojure
(def backend
  {:name           :gtk4
   :create!        w/create!
   :apply-props!   w/apply-props!
   :append-child!  w/append-child!
   :remove-child!  w/remove-child!
   :replace-child! w/replace-child!
   :reorder-child! w/reorder-child!
   :schedule       post-to-gui
   :run            run!})
```

That's the entire contract between the reactive core and the platform, and that's why writing a backend for a different toolkit is simply a matter of wiring up the widgets into the lifecycle. It's even possible to have a stable subset of common widgets across platforms as long as you keep the naming consistent.

### Bring your own toolkit

Another notable approach is seen with [glitter](https://glitter-uikit.b12n.app) and its AppKit renderer glitter-uikit, which are based on [Replicant](https://github.com/cjohansen/replicant). While glimmer is driven by a reactive atom where you build a tree of stateful components, Replicant rejects having local state entirely, and models the entire user interface as a single pure function which turns your application data into hiccup. While Reagent couples your rendering logic with a reactive state graph to optimize updates behind the scenes, Replicant acts as a remarkably strict unidirectional renderer where data goes in and hiccup comes out.

The same counter in glitter-uikit looks like this:

```clojure
(require '[glitter-uikit.app :as app]
         '[glitter-uikit.appkit :as appkit]
         '[glitter.core :as core])

(defonce state (atom {:count 0}))

(defn view [{:keys [count]}]
  [:vbox {:spacing 12}
   [:label {:label (str "Count: " count)}]
   [:hbox {:spacing 8}
    [:button {:label "+ 1" :on {:click [[:action/inc]]}}]]])

(defn execute-actions [_event actions]
  (doseq [[kind] actions]
    (case kind
      :action/inc (swap! state update :count inc)
      nil)))

(core/set-dispatch! execute-actions)

(defn -main [& _]
  (app/run (fn [window] (appkit/mount! window view state))))
```

Here the leaves are AppKit views instead of GTK widgets, and notice that the button no longer closes over the atom. It simply declares what it wants done as data, and a dispatch function interprets those actions against the application state. The hiccup stays the same, and the only difference is where the state lives and who is responsible for updating it.

### Conclusion 

Bringing web-style development to native widgets isn't a new idea, of course. React Native popularised the approach letting you write React components, and render to the platform's native widgets. The catch there is that the app still runs inside a JavaScript runtime that talks to the platform through a bridge, while the development loop revolves around bundling JavaScript and hot-reloading it into a running app. Flutter sidesteps the bridge by bringing its own rendering engine and drawing every control itself, which means you're no longer using native widgets. Another approach is what Tauri does keeping the web frontend backed by the OS webview. This approach is lighter than Electron but still renders HTML rather than native controls, and is subject to the quirks of the webview implementation on each platform. Meanwhile, the native world has been converging on the same idea from the other side, with SwiftUI and Jetpack Compose offering declarative UIs, but those put you right back in a compiled language with a rebuild cycle and no REPL. Each of these approaches ends up being a compromise involving either having a heavyweight runtime or giving up ergonomics.

With Jolt, we can finally have the best of both worlds using native widgets without having to bundle a whole browser engine just to render the UI, have a clean Hiccup based API that lets you arrange components just like you would with HTML elements in the DOM, and have an interactive development environment where you can see the application evolve as you make changes to it. Since Jolt is a Clojure dialect that compiles to native code, there's no JVM or JavaScript runtime in the way, and the app compiles into a lean binary. You get the same feedback loop that makes web development pleasant, while driving real platform widgets in a native application.


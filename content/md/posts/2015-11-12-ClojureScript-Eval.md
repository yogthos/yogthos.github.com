{:title "Evaluating ClojureScript in the Browser"
:layout :post
:tags ["clojurescript"]}

ClojureScript can now [compile itself without relying on the Google Closure compiler](https://swannodette.github.io/2015/07/29/clojurescript-17/), and it's now possible to evaluate code straight in the browser. In this post we'll look at how that's accomplished by creating a code editor using [CodeMirror](https://codemirror.net/), [highlight.js](https://highlightjs.org/), and [Reagent](https://reagent-project.github.io/). The code entered in the editor will be sent for evaluation and the result displayed to the user.

Let's start by creating a new Reagent project by running the following command:

```
lein new reagent cljs-eval-example +figwheel
```

Next, we'll navigate to the project folder and start Figwheel by running:

```
lein figwheel
```

Let's open the browser at `http://localhost:3449` and navigate to the `cljs-eval-example.core` namespace in the `src/cljs` folder. We'll first need to reference `cljs.js` namespace:

```clojure
(ns cljs-eval-example.core
  (:require
   ...
   [cljs.js :refer [empty-state eval-str js-eval]]))
```

We'll create `evaluate` function that will accept a string and a callback. This function calls [cljs.js/eval-str](https://cljs.github.io/api/cljs.js/eval-str) as follows:

```clojure
(defn evaluate [s cb]
  (eval-str
     (empty-state)
     s
     nil
     {:eval       js-eval    
      :source-map true
      :context    :expr}
     cb))
```

The `eval-str` function accepts an initial state, followed by the string representing the form to evaluate, a name, a map with the options, and a callback function for handling the result of the evaluation. We can create an initial state by calling `cljs.js/empty-state` function. We can now test that our code works by adding a button to our `home-page` component:

```clojure
(defn home-page []
  [:div
   [:button
    {:on-click #(evaluate "(println \"hello world!\")" (fn [_]))}
    "let's compile!"]])
```

When we click the button we should see `"hello world!"` printed in the browser console. Next, let's add a `:textarea` to allow entering some text and then send it for evaluation.

```clojure
(defn home-page []
  (let [input (atom nil)
        output (atom nil)]
    (fn []
      [:div
       [:textarea
        {:value @input
         :on-change #(reset! input (-> % .-target .-value))}]       
       [:div>button
        {:on-click #(evaluate @input (fn [result] (reset! output result)))}
        "let's compile!"]
       [:p @output]])))
```

At this point we can type some code in our input box, click the button to evaluate it, and see the result. So far so good, now let's make the editor look a bit nicer by replacing it with the CodeMirror version.

We'll open up the `cljs-eval-example.handler` namespace in the `src/clj` folder. There, we'll update the `include-css` and `include-js` portions of the `head` to add the respective CSS and Js files for running CodeMirror.

```clojure
(defn head []
  [:head
   [:meta {:charset "utf-8"}]
   [:meta {:name "viewport"
           :content "width=device-width, initial-scale=1"}]
   (include-css
    (if (env :dev) "/css/site.css" "/css/site.min.css")
    "//cdnjs.cloudflare.com/ajax/libs/codemirror/5.8.0/codemirror.min.css"
    (if (env :dev) "css/site.css" "css/site.min.css"))
   (include-js
    "//cdnjs.cloudflare.com/ajax/libs/codemirror/5.8.0/codemirror.min.js"
    "//cdnjs.cloudflare.com/ajax/libs/codemirror/5.8.0/mode/clojure/clojure.min.js")])
```

With that in place we'll need to reload the page for the new assets to become available. Since we're using external JavaScript that modifies the DOM, we'll need to use the `reagent.core/create-class` function to create the editor component.

The `create-class` function accepts a map keyed on the [React lifecycle methods](https://facebook.github.io/react/docs/component-specs.html). The methods that we wish to implement are `:render` and `:component-did-mount`:

```clojure
(defn editor [input]
  (reagent/create-class
   {:render (fn [] [:textarea 
                     {:default-value ""
                      :auto-complete "off"}])
    :component-did-mount (editor-did-mount input)}))
```

The `editor` component will accept the `input` atom as the parameter and pass it to the `editor-did-mount` function. This function will look as follows:

```clojure
(defn editor-did-mount [input]
  (fn [this]
    (let [cm (.fromTextArea  js/CodeMirror
                             (reagent/dom-node this)
                             #js {:mode "clojure"
                                  :lineNumbers true})]
      (.on cm "change" #(reset! input (.getValue %))))))
```

The `editor-did-mount` is a closure that returns a function that accepts the mounted React component, it then calls `reagent/dom-node` on it to get the actual DOM node mounted in the browser. We'll then call `.fromTextArea` method on `js/CodeMirror` and pass it the node along with a map of rendering hints.

Calling `.fromTextArea` returns an instance of the CodeMirror. As a last step we'll add the `change` event to this instance to reset the `input` atom with the updated text whenever the text in the editor is changed.

We can now update the `home-page` component to use the `editor` component instead of a plain `textarea`:

```clojure
(defn home-page []
  (let [input (atom nil)
        output (atom nil)]
    (fn []
      [:div
       [editor input]
       [:div
        [:button
         {:on-click #(evaluate @input (fn [{:keys [value]}] (reset! output value)))}
         "run"]]
       [:p @output]])))
```

The editor looks a lot nicer now, but the output doesn't have any highlighting. Let's fix that by running it through highlight.js to generate nicely formatted results.

Once again, we'll need to add the additional CSS and Js files in the `cljs-eval-example.handler` namespace:

```clojure
(defn head []
  [:head
   [:meta {:charset "utf-8"}]
   [:meta {:name "viewport"
           :content "width=device-width, initial-scale=1"}]
   (include-css
    (if (env :dev) "/css/site.css" "/css/site.min.css")
    "//cdnjs.cloudflare.com/ajax/libs/codemirror/5.8.0/codemirror.min.css"
    "//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.9.1/styles/default.min.css"
    (if (env :dev) "css/site.css" "css/site.min.css"))
   (include-js
    "//cdnjs.cloudflare.com/ajax/libs/highlight.js/8.9.1/highlight.min.js"
    "//cdnjs.cloudflare.com/ajax/libs/codemirror/5.8.0/codemirror.min.js"
    "//cdnjs.cloudflare.com/ajax/libs/codemirror/5.8.0/mode/clojure/clojure.min.js")])
```

Back in the `cljs-eval-example.core` namespace we'll add a reference for `[cljs.pprint :refer [pprint]]` and write the `result-view` component that
will take care of highlighting the output.

```clojure
(ns cljs-eval-example.core
  (:require ...
            [cljs.pprint :refer [pprint]]))

...
            
(defn result-view [output]
  (reagent/create-class
   {:render (fn []
              [:pre>code.clj
               (with-out-str (pprint @output))])
    :component-did-update render-code}))
```

Highlight.js defaults to using `<pre><code>...</pre></code>` blocks, so we'll generate one in the `:render` function. Then we'll call the `render-code` function when the `:component-did-update` state is triggered. This function will simply pass the node to the `.highlightBlock` function provided by highlight.js:

```clojure
(defn render-code [this]
  (->> this reagent/dom-node (.highlightBlock js/hljs)))
```

Finally, we'll have to update the `home-page` component to use the `result-view` component we just wrote:

```clojure
(defn home-page []
  (let [input (atom nil)
        output (atom nil)]
    (fn []
      [:div
       [editor input]
       [:div
        [:button
         {:on-click #(evaluate @input (fn [{:keys [value]}] (reset! output value)))}
         "run"]]
       [:div
        [result-view output]]])))
```

Now both the editor and the output should look nicely highlighted, and the output will be formatted as a bonus. The entire code listing is as follows:

```clojure
(ns cljs-eval-example.core
  (:require
   [reagent.dom :as dom]
   [reagent.core :as reagent :refer [atom]]
   [cljs.js :refer [empty-state eval-str js-eval]]
   [cljs.pprint :refer [pprint]]))

(defn evaluate [s cb]
  (eval-str
     (empty-state)
     s
     nil
     {:eval       js-eval    
      :source-map true
      :context    :expr}
     cb))

(defn editor-did-mount [input]
  (fn [this]
    (let [cm (.fromTextArea  js/CodeMirror
                             (dom/dom-node this)
                             #js {:mode "clojure"
                                  :lineNumbers true})]
      (.on cm "change" #(reset! input (.getValue %))))))

(defn editor [input]
  (reagent/create-class
   {:render (fn [] [:textarea
                    {:default-value ""
                     :auto-complete "off"}])
    :component-did-mount (editor-did-mount input)}))

(defn render-code [this]
  (->> this dom/dom-node (.highlightBlock js/hljs)))

(defn result-view [output]
  (reagent/create-class
   {:render (fn []
              [:pre>code.clj
               (with-out-str (pprint @output))])
    :component-did-update render-code}))

(defn home-page []
  (let [input (atom nil)
        output (atom nil)]
    (fn []
      [:div
       [editor input]
       [:div
        [:button
         {:on-click #(evaluate @input (fn [{:keys [value]}] (reset! output value)))}
         "run"]]
       [:div
        [result-view output]]])))

(defn mount-root []
  (dom/render [home-page] (.getElementById js/document "app")))

(defn init! []
  (mount-root))
```

A complete example project is available on [GitHub](https://github.com/yogthos/cljs-eval-example).

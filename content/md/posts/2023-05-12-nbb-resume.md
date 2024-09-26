{:title "Making a Resume with Node.js Babashka (nbb)" :layout :post, :tags ["clojure" "babashka"]}

I recently had to update my resume and decided that I might as well have some fun with it while I do it. One thing that I've always found frustrating using an editor like OpenOffice is that it conflates the tasks of formatting and editing content. I don't want to have to worry about look and feel when I'm thinking about the content of the resume, and vice versa.

The obvious solution is to create a template for how the resume should look, and then populate it with the relevant data. Of course, there are already off the shelf tools such as [JSON Resume](https://jsonresume.org/) that do this, but what fun is there in using an existing tool when you can build one that does exactly what you want. Let's take a look at what's involved in making a similar tool with Clojure and [nbb](https://github.com/babashka/nbb).

I decided to create a Hiccup template that would represent the layout of the HTML document and then to put the contents of the resume in a separate EDN file. Then all I'd need to do would be to walk over the template, inject the data, and render HTML which could then be converted to a PDF document.

### Specification

Generally, I find it's helpful to start by defining what the API will look like first, and then figure out what the best way to implement it is. This way there is less of a chance that implementation details will bleed into the API. In this scenario the API will be the format of the EDN file and the Hiccup template.

The EDN is just a data structure that's used to organize the data in the resume. I based mine on the [schema](https://jsonresume.org/schema/) that JSON Resume uses. The schema contains sections such as `:basics`, `:work`, `:education`, and so on. For example, the `:basics` section might look as follows:

```clojure
{:basics {:name "John Doe"
          :label "Programmer"
          :image "profile.jpg"
          :email "john@gmail.com"          
          :summary "A summary of John Doe…"}}
```

This data then needs to be fed into the Hiccup template that might look like this:

```clojure
[:html
 [:body
  [:header#header
   [:div.container
    [:div.row 
     [:div.col-sm-9.col-sm-push-3
      [:h1 :data/basics.name]
      [:h2 :data/basics.label]]]]]
  [:page/image {:src   :data/basics.image
                :width "60px"}]
  [:div [:strong "Email"] [:td [:span.email :data/basics.email]]]
  [:section#about.row
   [:aside.col-sm-3
    [:h3 "About"]]
   [:div.col-sm-9
    [:p :data/basics.summary]]]]]
```

I decided to use namespaced keys to specify the dynamic elements in the template. This provides a clean way to differentiate them from the static Hiccup tags and hint at the type of key. For example, keys namespaced with `data` indicate that they're paths that should be looked up within the EDN document. The `:data/basics.name` keyword translates into `(get-in data [:basics :name])` when the template is parsed.

Another example is using `page` namespace to indicate a tag that needs to be processed in a special way. The `:page/image` tag above will create an `:img` tag with the image at the path specified using `:data/basics.image` injected as a base 64 string. This trick provides a flexible way to specify dynamic behaviors in the template.

Finally, I wanted to handle evaluation of forms in order to handle things like iteration within the template. In the snippet below, `for` macro is called on the data found under the `projects` key in order to create a list of projects:

```clojure
[:section#projects.row
    [:aside.col-sm-3
     [:h3 "Projects"]]
    [:div.col-sm-9
     [:div.row
      (for [{:keys [name summary url]} :data/projects]
        [:div.col-sm-12
         [:h4.strike-through
          [:span name]]
         [:div summary]
         [:div
          [:a {:href url} url]]])]]]
```

Examples above cover all the functionality I expect to need for making a nice looking resume. Let's take a look at what's involved in putting it all together.

### Implementation

Conveniently, `nbb` provides support for starting up nREPL by running `nbb nrepl-server :port 1337`. This facilitates interactive development that Clojure developers know and love. First thing I decided to do after getting the REPL fired up was to make a little Hiccup parser borrowing the relevant bits from the original implementation:

```clojure
(defn normalize-body [body]
  (if (coll? body) (apply str (doall body)) (str body)))

(defn as-str  
  [& xs]
  (apply str (map normalize-body xs)))

(defn escape-html  
  [text]
  (-> (as-str text)
      (string/replace #"&" "&amp;")
      (string/replace #"<" "&lt;")
      (string/replace #">" "&gt;")
      (string/replace #"'" "&apos;")))

(defn xml-attribute [id value]
  (str " " (as-str (name id)) "=\"" (escape-html value) "\""))

(defn render-attribute [[name value]]
  (cond
    (true? value) (xml-attribute name name)
    (not value) ""
    :else (xml-attribute name value)))

(defn render-attr-map [attrs]
  (apply str (sort (map render-attribute attrs))))

(defn merge-attributes [{:keys [id class]} map-attrs]
  (->> map-attrs
       (merge (when id {:id id}))
       (merge-with #(if %1 (str %1 " " %2) %2) (when class {:class class}))))

(defn normalize-element [[tag & content]]
  (let [re-tag    #"([^\s\.#]+)(?:#([^\s\.#]+))?(?:\.([^\s#]+))?"
        [_ tag id class] (re-matches re-tag (as-str (name tag)))
        tag-attrs {:id    id
                   :class (when class (string/replace class #"\." " "))}
        map-attrs (first content)]
    (if (map? map-attrs)
      [tag (merge-attributes tag-attrs map-attrs) (next content)]
      [tag tag-attrs content])))

(defn render-element [[tag attrs & content]]
  (str "<" (name tag) (render-attr-map attrs) ">" (as-str (flatten content)) "</" (name tag) ">"))

(defn render-hiccup [hiccup]
  (postwalk
   (fn [node]
     (if (and (not (map-entry? node)) (vector? node))
       (-> node normalize-element render-element)
       node))
   hiccup))
```

Next, I wrote a template parser that would walk the Hiccup template and inject relevant data into it:

```clojure
(def path-sep (.-sep path))

(defn image? [node]
  (and (vector? node) (= :page/image (first node))))

(defn css? [node]
  (and (vector? node) (= :page/css (first node))))

(defn data-node? [node]
  (and (keyword? node) (= "data" (namespace node))))

(defn eval-forms [template]
  (prewalk
   (fn [node]
     (if (list? node)
       (eval node)
       node))
   template))

(defn slurp [filename & {:keys [encoding]}]
  (.toString
   (if encoding
     (fs/readFileSync filename encoding)
     (fs/readFileSync filename))))

(defn spit [filename data & {:keys [encoding mode flag]
                             :or   {encoding "utf8"
                                    mode     "0o666"
                                    flag     "w"}}]
  (let [data (if (string? data) data (str data))]
    (fs/writeFileSync filename data encoding mode flag)))

(defn inject-css [theme ref]
  [:style
   {:type "text/css"}
   (slurp (str theme path-sep ref))])

(defn image->b64 [file-path {:keys [theme]}]
  (when file-path
    (let [format    (last (string/split file-path #"\."))]
      (str
       "data:image/" format ";base64, "
       (-> (path/resolve (str theme path-sep file-path))
           (fs/readFileSync)
           (.toString "base64"))))))

(defn inject-image [[_ path] opts]
  [:img {:src (image->b64 path opts)}])

(defn parse-path [path]
  (mapv keyword (string/split path #"\.")))

(defn parse-template [{:keys [theme template data] :as opts}]
  (eval-forms
   (postwalk
    (fn [node]
      (cond
        (css? node)
        (map (partial inject-css theme) (rest node))
        (image? node)
        (inject-image node opts)
        (data-node? node)
        (get-in data (parse-path (name node)))
        :else node))
    template)))
```

As you can see, `postwalk` is used to navigate the template. Each node is inspected and then handled using the appropriate function based on its type. After all the data is injected in the template, the result is passed to `eval-forms` to evaluate any code such as the `for` macro we saw above.

With these pieces above in place, I can now generate a nice looking HTML page with the resume content. The last interesting bit is to convert the resulting HTML into a PDF document. The easiest way I found was to use puppeteer in headless mode to render the page and write it out as a PDF:

```clojure
(defn write-pdf [{:keys [browser pending target pdf-opts]} html]
  (-> browser
      (.then #(.newPage %))
      (.then
       (fn [page _] 
         (-> (.setContent page html)
             (.then #(.emulateMediaType page "screen"))
             (.then (fn [_ _]
                      (-> (.pdf page (clj->js (merge {:path target} pdf-opts)))
                          (.then
                           (fn [_] (reset! pending false)))
                          (.catch #(js/console.error (.-message %))))))
             (.catch #(js/console.error (.-message %))))))))
```

The entire code for this ended up weighing in at around 200 lines, and I'm pretty happy with the result. Being able to solve these kinds of tasks in a few lines of code is what makes Clojure such a productive language for me. Incidentally, [here's](https://github.com/yogthos/resume/blob/build/resume.pdf) a link to my resume, and I am currently open to collaboration or employment opportunities.

The entire project is available [here](https://github.com/yogthos/resume) for reference.

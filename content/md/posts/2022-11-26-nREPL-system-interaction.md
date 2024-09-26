{:title "Using nREPL as System Interface", :layout :post, :tags ["clojure" "babashka" "repl"]}

Clojure REPL is a powerful tool for developing programs interactively. Connecting the editor to the REPL allows us to get instant feedback on the code we're writing and have confidence that it works as intended as we're developing the application. However, the REPL isn't inherently limited to application development. It provides us with an interface to the language, and the language in turn be used as an interface to the host system. Let's take a look at how we can use [Babashka](https://book.babashka.org/) along with [Osquery](https://osquery.readthedocs.io/en/stable/introduction/using-osqueryi/) to inspect the state of the host.

Osquery is a handy tool that allows using SQL commands in order to leverage a relational data-model to describe a device. Different aspects of the system are mapped to relational tables using the following [schema](https://www.osquery.io/schema/5.5.1/). The tables give us access to files, ports, mounts, and many other aspects of the system. One aspect of Osqeury that's particularly useful to us is that it's able to return results in JSON format that we can parse into EDN and work with as structured data in the REPL.

To see how this works we'll start the nREPL server by running `bb --nrepl-server`. The REPL will start on port `1667` by default, we can also set a custom port by providing port number as the second argument to `bb`. Once the REPL is running we can connect any nREPL compatible editor such as Calva or Emacs.

Let's create a file called `osquery.clj` and open it in the editor and add some code to drive Osquery. First thing we'll need to do is to require the namespaces for interacting with the shell and parsing JSON:

```clojure
(require '[clojure.java.shell :refer [sh]]
         '[cheshire.core :as json])
```

Next, we'll define the `osquery` function that will take a SQL query as text, execute `osqueryi` command and return its result as EDN:

```clojure
(defn osquery [query]
  (let [{:keys [exit out err]} (sh "osqueryi" "--json" query)]
    (if (zero? exit)
      (json/decode out true)
      (throw (Exception. err)))))
```

And we're now ready to try to query some information about the system. Let's run a query to see all the routes where destination is `::1`

```clojure
(osquery "select * from routes where destination = '::1'")
```

We should get back a list of routes that looks something like the following:

```clojure
({:hopcount "0",
  :interface "lo0",
  :mtu "16384",
  :type "local",
  :source "",
  :gateway "::1",
  :netmask "128",
  :flags "2098181",
  :destination "::1",
  :metric "0"})
```

The result is just a plain Clojure data structure we can trivially manipulate using full power of Clojure. 

We can even go a step further using [HoneySQL](https://github.com/seancorfield/honeysql) library that will allow us to make structured queries. We'll need to require `deps` and pull in the library as follows:

```clojure
(require '[babashka.deps :as deps])

(deps/add-deps '{:deps {com.github.seancorfield/honeysql {:mvn/version "2.2.861"}}})

(require '[honey.sql :as hsql])
```

Finally, we'll update our `osquery` function as follows:

```clojure
(defn osquery [query]
  (let [{:keys [exit out err]} (apply sh "osqueryi" "--json" (hsql/format query {:inline true}))]
    (if (zero? exit)
      (json/decode out true) 
      (throw (Exception. err)))))
```

With the changes above we can now write our queries in EDN:

```clojure
(osquery {:select [:*] :from [:routes] :where [:= :destination "::1"]})
```

I hope this little example illustrates how the REPL can be used as a powerful OS interaction tool as well as a programming tool and inspires you to use the REPL in new and exciting ways. Babashka in particular is a great tool for such REPL driven interaction due to fast startup and wide range of useful libraries that let us access databases, HTTP servers, and other resources. This makes Babashka an excellent tool for doing devops.
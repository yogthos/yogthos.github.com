{:title "Introducing Kit Framework", :layout :post, :tags ["clojure" "web" "kit"]}

[Kit](https://kit-clj.github.io/) is a Clojure web framework building on experience from Luminus while embracing latest tools and best practices that emerged over the years. Kit shares the same goals as Luminus while aiming to address its deficiencies. Before we dive into Kit, let's take a moment to establish some background. Kit was created as a collaboration between [Nik](https://nikperic.com/), [Dan](http://www.danboykis.com/), and myself. The project leverages our collective experience developing web applications using Clojure. Nik provides his own rationale for the project [here](https://nikperic.com/2022/01/08/why-kit.html).

## Background

My original motivation behind Luminus was to provide a frictionless beginner experience for Clojure web development. Clojure community favors structuring applications by leveraging composable libraries. This approach affords gives the developer full control over the structure of their project making it easy for experienced Clojure users to build lean applications that contain only the necessary components.

Unfortunately, having to know what libraries and tools to use and how to put them together effectively creates a significant barrier for Clojure beginners. This is one of the major problems addressed by frameworks where such decisions are made by the maintainers of the framework.

Frameworks allow users to focus on the business logic of their application while aiming to handle all the cross-cutting concerns. Downside of this approach is that the framework has to accommodate for many different types of projects. Users of the framework end up inheriting the complexity of the entire framework regardless of the actual needs of their project.

Luminus provides a middle ground between these approaches using project templates. The template makes all the decisions regarding the libraries that are used and the structure of the project. Using such a template allows users to create a skeleton project that works out of the box. However, the user is free to modify the code in the project any way they see fit without being locked into the decisions made by the maintainers of the framework.

Just like a traditional framework, Luminus provides a curated stack of libraries that are known to be maintained and to work well together. This stack is coupled with a documentation site that illustrates how to accomplish common tasks such as HTML templating, routing, and database access.

One major deficiency of Luminus is that it's based around Leiningen templates. Any template features that the user wants to use in their project have to be known at project creation time. For example, if you created a barebones project and then later decided that you wanted to add ClojureScript support, then all the wiring would have to be done manually.

Another problem with baking all the features directly into the template is the resulting maintenance overhead. Any features supported by Luminus have to be maintained in the official repository. As the number of supported features grows so does the maintenance burden.

With all that in mind, let's take a look at what Kit does differently and what improvements it introduces over Luminus.


## Kit Stack

Kit stack is similar to Luminus with a few notable changes. Let's see what they are and explore the rationale behind them.

Kit uses [Integrant](https://github.com/weavejester/integrant) to manage stateful components in the project. While [Mount](https://github.com/tolitius/mount) is a great library for managing stateful components, it doesn't lend itself well towards creating modules since the component is described as code within the project. On the other hand, Integrant uses an EDN configuration file for managing state making it easy to package component configuration in the modules. Integrant also follows data oriented approach favored by Clojure community where the entire system of components and their relationships is described as a map. This makes it easy to see what all the resources and their relationships in the project are at a glance.

Another major change is that tools.deps along with tools.build are used for managing project lifecycle in favor of Leiningen. While Leiningen is a fine tool, it's clear that the community is moving towards using official tooling and Kit embraces this decision. Using official tools also means that there is one less tool to install, making for a smoother beginner experience.

Aside from these changes, the stack and project structure will be familiar to existing Luminus users. Ring is used as the HTTP server abstraction, Reitit being used for routing, Selmer for HTML templating, Migratus for migrations, and HugSQL for managing SQL queries.

With that out of the way, let's take look at the most exciting aspect of the framework which is its module system.

## Kit Modules

Kit modules are templates that can be applied to an existing project using [kit-generator](https://github.com/kit-clj/kit/tree/master/libs/kit-generator) library. Modules are managed using git repositories, and official modules can be found [here](https://github.com/kit-clj/modules). Let's take a brief look at what a module repository looks like.

A module repository must contain a `modules.edn` file describing the modules that are provided. For example, here are the official modules provided by Kit:

```clojure
{:name "kit-modules"
 :modules
 {:kit/html
  {:path "html"
   :doc "adds support for HTML templating using Selmer"}
  :kit/sqlite
  {:path "sqlite"
   :doc "adds support for SQLite embedded database"}
  :kit/cljs
  {:path "cljs"
   :doc "adds support for cljs using shadow-cljs"}}}
```

As we can see above, the official repository contains three modules. Let's take a look at the [`:kit/html`](https://github.com/kit-clj/modules/tree/master/html) module to see how it works. This module contains a `config.edn` file and a folder called `assets`. Let's take a look at the configuration for the module:

```clojure
{:default
 {:require-restart? true
  :actions
  {:assets           [["assets/home.html"    "resources/html/home.html"]
                      ["assets/error.html"    "resources/html/error.html"]
                      ["assets/css/screen.css"    "resources/public/css/screen.css"]
                      ["assets/img/kit.png" "resources/public/img/kit.png"]
                      ["assets/src/pages.clj"    "src/clj/<<sanitized>>/web/routes/pages.clj"]
                      ["assets/src/layout.clj"   "src/clj/<<sanitized>>/web/pages/layout.clj"]]
   :injections       [{:type   :edn
                       :path   "resources/system.edn"
                       :target []
                       :action :merge
                       :value  {:reitit.routes/pages
                          {:base-path ""
                             :env       #ig/ref :system/env}}}
                      {:type   :edn
                       :path   "deps.edn"
                       :target [:deps]
                       :action :merge
                       :value  {selmer/selmer {:mvn/version "1.12.49"}
                                luminus/ring-ttl-session {:mvn/version "0.3.3"}}}
                      {:type   :clj
                       :path   "src/clj/<<sanitized>>/core.clj"
                       :action :append-requires
                       :value  ["[<<ns-name>>.web.routes.pages]"]}]}}}
```

We can see that the module has a `:default` profile. Kit module profiles allow providing variations of a module with different configurations. For example, a database module could have different profiles for different types of databases. In case of HTML, we only need a single profile.

The`:require-restart?` key specifies that the runtime needs to be restarted for changes to take effect. This is necessary for modules that add Maven dependencies necessitating JVM restarts to be loaded.

Next, the module specifies the actions that will be performed. The first action called `:assets` specifies new assets that will be added to the project. These are template files that will be read from the `assets` folder and injected in the project. Assets are akin to traditional Leiningen templates.

The other configuration action is called `:injections` and specifies code that will be injected into existing files within the project. In order to provide support for rendering HTML templates, the module must update Integrant system configuration by adding a reference for new routes to `system.edn`, add new dependencies to `deps.edn`, and finally require the namespace that contains the routes for the pages in the core namespace of the project.

# Trying Things Out

Let's create a new Kit project and see how this all works in practice. Kit uses [clj-new](https://github.com/seancorfield/clj-new) templates for instantiating the project, make sure you have it [installed locally](https://kit-clj.github.io/docs/guestbook.html#installing_a_build_tool) to follow along. Let's create a project called `guestbook` by running the following command:

```
clojure -X:new :template io.github.kit-clj :name kit/guestbook
```

Once the project is created, you can start the REPL by running `clj -M:dev -M:repl`, alternatively if you have `make` installed just run `make repl` instead. Once the REPL starts, you can run `(go)` to start the HTTP server.

Default project provides a minimal configuration with a health status API located at `http://localhost:3000/api/health`. Let's see how we can add support for rendering HTML pages using Selmer by installing the official HTML module.

## Adding Modules

Kit projects use a configuration file called `kit.edn` that specifies some metadata about the project and allows the user to reference module repositories. Default configuration will look something like the following:

```clojure
{:full-name "kit/guestbook"
 :ns-name   "kit.guestbook"
 :sanitized "kit/guestbook"
 :name      "guestbook"
 :modules   {:root         "modules"
             :repositories [{:url  "git@github.com:kit-clj/modules.git"
                             :tag  "master"
                             :name "kit-modules"}]}}
```

## REPL driven workflow

Kit embraces the REPL and the generator library is aliased in the `user` namespace as `kit`. Let's see how we can us it to install HTML module in the project. First, we'd need to sync our module repositories. This is done by running the following command in the REPL:

```clojure
user=> (kit/sync-modules)
2021-11-30 11:42:41,010 [main] DEBUG org.eclipse.jgit.util.FS - readpipe [git, --version],/usr/local/bin
2021-11-30 11:42:41,030 [main] DEBUG org.eclipse.jgit.util.FS - readpipe may return 'git version 2.33.1'
2021-11-30 11:42:41,030 [main] DEBUG org.eclipse.jgit.util.FS - remaining output:
...
2021-11-30 11:42:41,769 [main] DEBUG o.e.jgit.transport.PacketLineOut - git> 0000
2021-11-30 11:42:41,769 [main] DEBUG o.e.jgit.transport.PacketLineOut - git> done

2021-11-30 11:42:41,835 [main] DEBUG o.e.jgit.transport.PacketLineIn - git< NAK
nil
user=>
```

Once the modules are synchronized, we can list the available modules by running `kit/list-modules`:

```clojure
user=> (kit/list-modules)
:kit/html - adds support for HTML templating using Selmer
:kit/sqlite - adds support for SQLite embedded database
:kit/cljs - adds support for cljs using shadow-cljs
nil
user=>
```

We can see that the three modules specified in the official modules repository are now available for use. Let's install the HTML module by running `kit/install-module` function and passing it the keyword specifying the module name:

```clojure
user=> (kit/install-module :kit/html)
updating file: resources/system.edn
updating file: deps.edn
updating file: src/clj/kit/guestbook/core.clj
applying
 action: :append-requires
 value: ["[kit.guestbook.web.routes.pages]"]
:kit/html installed successfully!
restart required!
nil
user=>
```

Let's restart the REPL and run `(go)` command again to start the application. We should now be able to navigate to `http://localhost:3000` and see the default HTML page provided by the module.

Generator aims to be idempotent, and will err on the side of safety in case of conflicts. For example, if we attempt to install `:kit/html` module a second time then we'll see he following output:

```clojure
user=> (kit/install-module :kit/html)
:kit/html requires following modules: nil
module :kit/html is already installed!
nil
user=>
```

Generator lets us know that the module already exists and there is nothing to be done.

## Conclusion

I hope this post convinced you that Kit approach is an improvement over Luminus for both users and developers. With Kit, you no longer have to know what features you're going to be using up front. New functionality can now be added gradually as you discover the need for it. You're no longer restricted to using official modules either. Anyone can make a repository with their own modules that template common functionality that they need and use these along side or even in place of the official modules. For example, if you wanted to use Hiccup instead of Selmer, then you could trivially add support for that yourself based on the example above.

Kit was created by Dmitri Sotnikov, Nikola Peric, and Dan Boykis. We hope that this project will make it easier for Clojure developers to make web applications going forward. Get in touch with us on Clojurians slack at #kit-clj, we're excited to hear community feedback, ideas and suggestions for the project.


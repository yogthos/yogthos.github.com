{:title "Luminus is Moving -> HTTP Kit -> Immutant"
 :layout :post
 :tags ["clojure" "luminus"]}
 
## Update

After having some discussions with the author of HTTP Kit and doing a deeper evaluation of Immutant I'm switching to it as the default.

It turns out that Immutant addresses all of the concerns as well as HTTP Kit while having the benefit of a larger team maintaining it.

The version 2 of Immutant is modular and provides a minimal runtime that has low overhead. The websocket support works similarly to HTTP Kit and is now documented as well. Unlike Jetty 9 adapters with websocket support, Immutant builds do not require JRE 8 to run.

Finally, Immutant provides many useful pluggable libraries for caching, message queues, and scheduling.

## End Update
 
One of the guiding principles for Luminus has been to provide a great user experience out of the box. Having to go through a tedious setup before you can focus on the problem you actually want to solve should be unnecessary.

Luminus removes the burden or having to find the libraries, configure middleware, and add the common boilerplate. The application generated by the template is ready for  deployment out of the box. The only part that's missing is the domain logic for your application.

As the project evolves I'm always looking for new ways to streamline user experience. Clojure web ecosystem is rapidly evolving along with the best practices and tools. Luminus aims to keep abreast of these changes and to provide a reference implementation for Ring based applications.

Recently, Luminus moved to using [Migratus](https://github.com/yogthos/migratus) for handling database migrations for reasons discussed in [this](http://yogthos.net/posts/2015-06-29-Luminus-Migratus.html) post. This time we'll look at the reasons for moving to HTTP Kit as the default server.

Up to now, Luminus applications would use the version of Jetty packaged by the Ring dependency. The major drawback of the default Jetty adapter is its lack of support for websockets. After evaluating the alternatives I settled on HTTP Kit as the default server for Luminus.

HTTP Kit is built on top of [NIO](https://en.wikipedia.org/wiki/Non-blocking_I/O_(Java\)). It combines [high performance](https://github.com/ptaoussanis/clojure-web-server-benchmarks) when handling a large number of connections with [low memory overhead](http://www.http-kit.org/600k-concurrent-connection-http-kit.html) per connection. Finally, it provides a Ring/Compojure compatible API for working with [websockets](https://en.wikipedia.org/wiki/WebSocket) that's now [part](http://www.luminusweb.net/docs/websockets.md) of the official Luminus documentation.

While HTTP Kit is the default, all the major HTTP servers are supported via their respective flags:

* `+alpeh` - [Aleph](https://github.com/ztellman/aleph) is a stream based server built on top of Netty
* `+immutant` - [Immutant](http://immutant.org/) is a [JBoss](http://www.jboss.org/) based server with many built in features such as messaging, scheduling and caching
* `+jetty` - [Jet](https://github.com/mpenet/jet) is the Ring Jetty adapter with websocket support

Another major change is that the [lein-ring](https://github.com/weavejester/lein-ring) plugin is no longer used by default. Since the plugin is based on the Jetty based [ring-server](https://github.com/weavejester/ring-server) library, a separate workflow was required for the alternative HTTP servers.

Instead, the template now provides its own `core` namespace that manages the server lifecycle. This provides a consistent experience regardless of the server being used. The `lein-ring` plugin is now part of the `+war` profile used to generate server independent WAR archives for deployment to application servers such as [Apache Tomcat](http://tomcat.apache.org/).




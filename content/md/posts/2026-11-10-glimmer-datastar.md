{:title "Rendering in batches with glimmer and Datastar" :layout :post, :tags ["programming" "clojure" "jolt"]}

Anders Murphy recently wrote about [faster streaming HTML with batches and
aggregates](https://andersmurphy.com/2026/09/29/faster-streaming-html-with-batches-and-aggregates.html).
The idea is simple. When the server streams HTML to a page, it should collect the changes and render once
for the whole batch. Similarly, it makes sense to avoid rendering the same thing twice for two
different pages to avoid resending the data that the client already has.

I've been building [glimmer](https://github.com/jolt-lang/glimmer) and
[glimmer-datastar](https://github.com/jolt-lang/glimmer-datastar) to do reactive server side rendering for
[jolt](https://github.com/jolt-lang/jolt), and ran into similar problems. This post covers how both libraries have been reworked to facilitate batch processing, and how these changes are used in the [newsroom](https://github.com/yogthos/newsroom) app.

## The setup

Glimmer is a Reagent-style library where state lives in ratoms which
UI components subscribe to. The original
target was native GUIs such as [glimmer-gtk](https://github.com/jolt-lang/glimmer-gtk) and [glimmer-tui](https://github.com/jolt-lang/glimmer-tui), but the reactive core is toolkit agnostic. So, naturally I got curious if I could use the same model on the server with [Datastar](https://data-star.dev/) on the frontend. 

The way this works is that each open page keeps a Server-Sent Events stream to the server. When the page is rendered, any ratom the page reads is recorded, and the stream subscribes to it. Then whenever one of those ratoms changes, that causes the stream to render the page again. So, when a `swap!` happens on a ratom, that sends a `datastar-patch-elements` event with the new HTML to every page that renders it.

```clojure
(def state (ratom/atom {:greetings []}))

(def handler
  (-> (fn [_] {:status 200 :body (render-page @state)})
      (datastar/wrap-datastar {:tick-ms 15})))
```

The first version did the obvious thing which is to wake up every stream that reads the ratom on a write to do a render. The naive approach works fine with a few pages that do occasional
writes, but it doesn't scale with load because the cost ends up being writes * pages.

## Render once per tick, not once per write

The fix here is to decouple writes from render requests. A write only needs to
mark the streams that read the ratom as dirty, then a separate render loop can run on a fixed timer specified by `:tick-ms`. And every dirty stream ends up being rendered exactly once each time it wakes up with all the changes that have been batched up since the last time:

```clojure
(defn mark-dirty! [sched conn]
  (swap! (:dirty sched) conj conn)
  (wake! sched))

(defn- tick! [{:keys [txs dirty batch-fn] :as sched}]
  (run-batch! batch-fn (drain txs))
  ;; snapshot after the writes, so the connections they dirtied render now
  (let [[conns _] (swap-vals! dirty (constantly #{}))]
    (render-all! sched (vec conns))))
```

The loop sleeps out whatever is left of the tick before rendering, allowing every
change that arrives to land in the same batch. Meanwhile, an idle loop simply
parks on a channel without incurring any additional cost.

The effect on a burst with ten open streams and a hundred
`swap!`s in a row is fairly dramatic as one would expect:

| | renders | frames sent |
|---|---|---|
| a wakeup per write | 1000 | 55 |
| render ticks | 20 | 20 |

Before, the server had to do a thousand renders, most of which were thrown away. With ticks in place, the render count depends on the number of pages and how long the burst lasts rather than how many writes it contains. Incidentally, glimmer's GUI side already worked this way since a component's watcher holds a `pending` flag to ensure that a burst of changes queues a single deferred render on the UI thread.

## Slow clients drop frames instead of queueing them

A tick produces at most one frame per stream, and each stream sends its frames
through a channel with a sliding buffer of one. If a client hasn't taken the
last frame by the time the next one is ready, the old frame is discarded so that
the client always gets the latest update. This way a bad connection can't back up the
render loop or build up an unbounded queue of stale HTML.

## Batched writes with `tx!`

Since ticks batch renders, it makes sense for writes to be batched as well, as an opt-in. This is done using `tx!` to queue a thunk that runs on the loop thread at the start of the next tick, and before a render happens:

```clojure
(fn [request]
  (datastar/tx! request #(swap! state update :greetings conj "hello"))
  {:status 204})
```

Writes and renders have to take turns, so that a render can't observe a partial
update. If you pass a `:batch-fn`, it receives all of a tick's thunks together, so you can run them in a transaction, and calling `tx!` returns a promise of the thunk's result.

## Using component cache to avoid rendering the same thing twice

While ticks cut renders per page, there is also waste across different pages to consider. If a hundred people are looking at the same 300-row board, rendering it a hundred times
per tick produces a hundred identical strings.

To address that, glimmer-datastar provides its own hiccup renderer in `jolt.datastar.html`. The head of the vector is a component of `[row item]`, and its HTML is
cached under the vector itself, so the key is the function plus its arguments.
The whole board can now render once per change with every page showing it sharing the
result.

As always, the tricky part is knowing when a cached entry is stale, since components
read ratoms as well as their arguments, glimmer now has `capture` for this case:

```clojure
(let [a (atom 1) b (atom 2)]
  (r/capture #(+ @a @b)))   ; => [3 [a b]]
```

It runs a function and returns its result along with every reactive cell the
function read. The cache stores each entry with those cells and the values it
saw in them, and once any of those values changes, that indicates a need for a cache refresh.
And on a hit, the cache simply reads the cells again.

The cache also admits an entry only when it's asked for more than once, so components that
render once and never again don't push out ones that render every frame. It
evicts by generation, which is roughly LRU without needing per-entry bookkeeping on
the hit path.

On a 4-core machine, with 100 streams showing the 300-row board and one row
changing per tick, a tick takes:

| render-threads | 1 | 2 | 4 | 8 |
|---|---|---|---|---|
| no component cache | 891 ms | 472 ms | 481 ms | 480 ms |
| component cache | 68 ms | 55 ms | 55 ms | 47 ms |

The cache is the big win here while render threads level off,
so two is the default.

And `capture` also fixes another problem unrelated to speed. Since a stream now knows
exactly which cells its last render read, it only needs to watch those. A cell it
stopped reading can be unwatched right away, rather than leaving a subscription
behind that triggers extra renders later.

## Not sending what the client already has: patches

With rendering no longer being the bottleneck, the wire becomes the main cost since a single row change to that 300-row board still sends a 40 KB page. One obvious solution here is to enable streaming compression which gets you part of the way. Using ring-chez-adapter's
`wrap-gzip` compresses an SSE stream with a single deflate window across
frames, so a frame that's almost identical to the previous one compresses to
almost nothing. But that holds only while a frame fits in deflate's 32 KB window.
Past that the saving mostly disappears, and even a one-row change costs
4316 gzipped bytes.

So, we need to use patches to address the underlying problem. A component whose root element has an id, like `[:tr {:id ...}]`, is a *part* of the page. Since each stream compares its new page with the last one, part by part, it only needs to send parts that changed. Then, on the frontend, Datastar swaps each one in by id. When the page changes around its parts, such as a row being added, text outside every part being edited, or the client missing a frame, the whole page still gets sent.

| rows | gzip stream, per change | patch, gzip stream |
|---|---|---|
| 50 | 92 bytes | 28 bytes |
| 300 | 4316 bytes | 35 bytes |

Since the size of a patch depends on the change rather than the page, the comparison is
cheap too. A cached component brings its parts as the same shared vector on
every page, so the diff can skip it with an identity check. On my machine, this roughly halved the time for each tick going from 21.7 ms with whole frames to just 7.0 ms with patches. Using the delta is key for incremental view maintenance because only parts of the page that change have to be sent as updates.

## Aggregates: derived state that follows the change

We're not done yet though, because another trick that can be applied is to use aggregates. Take a reaction like `(reaction (count (filter open? @todos)))`. It recomputes from scratch on
every write, so whether a single row or a thousand change, the `reaction` still costs a thousand.

Glimmer's new `glimmer.table` borrows from DBSP. A table is a keyed collection
cell, and a view over it maps or filters only the rows that changed. An aggregate
whose operation has an inverse, like a count or a sum, simply takes the old row out
and puts the new one in:

```clojure
(def todos (t/table {1 {:title "a" :done false}}))
(def open (t/view todos (fn [_ v] (when-not (:done v) v))))
(def open-count (t/aggregate open t/count-of))

(t/put! todos 2 {:title "b" :done true})   ; costs one row, not the table
```

These are ordinary reactive cells, so pages subscribe to them with `@` like
anything else. With ticks, the cache and patches, a write costs one row to
derive, there is now one component to render, and one part to send.

## Letting go of closed pages

Of course, batching only helps if you're not doing work for pages nobody is looking at.
So, when a client goes away, the server closes the stream's channel. A transducer
on that channel runs on close and unwatches every cell the stream was
tracking, making it possible to garbage collect the connection right away.
And a render that the handler answers with a redirect or an error, such as a 401 after sign-out, cleans up the stream the same way.

## What does this look like in practice

I've always been interested in understanding how world news and events all connect to each other. There are many different things happening on any given day, and things that often seem like isolated events can often have shared underlying causes.

Decision makers get fancy daily briefings prepared for them by analysts who review the events to produce a perfectly prepared report. So, I figured why can’t I have something like that too?

And so, I built [Newsroom](https://github.com/yogthos/newsroom) which is a self-hosted news desk app to gather sources and write a daily briefing tailored to what I'm interested in. The app goes through hundreds of sources using a combination of RSS and web scraping. It then groups the news into categories and gets an LLM to build a graph of events and their connections to provide a basis for the report.

It was a perfect project to exercise the library since it has a live sidebar showing the progress as each source is aggregated, and the model's progress as it streams.

That kind of workload is the worst case for one-render-per-write. A run fetches its
sources concurrently from several threads, and each source reports a result
and a log line. Meanwhile, the model's progress updates many times a second while it
streams. Every one of these events used to be a `swap!` on the run's status ratom, and every
`swap!`, in turn, translated into a render of every page watching that reader's run.


Now, the server asks for `{:tick-ms 200}` which prevents event flooding. However fast the status changes, an open page still renders at most five times a second, and a burst of
sources finishing together all get packaged into a single frame. The whole change was just one line, since newsroom already asked for the same 200 ms through the old `:rate-limit-ms`
option. What changed underneath though is that a tick now coalesces the writes
instead of only spacing them out.

Ticks can also split two related writes across frames to ensure correct order.
A source used to set its state and then append its log line in a second
`swap!`, so a page could show "ok, 12 items" in the source list before the
log mentioned it. Now both go in one write:

```clojure
(update-status! (:run-id ctx)
                (fn [st]
                  (-> st
                      (update-in [:sources name] merge {:state :ok :count (count items)})
                      (add-event {:text (str name ": " (count items) " items") :level :ok}))))
```

That's the same idea `tx!` enforces, done by hand where one function owns
both writes. It also depends on glimmer's `swap!` being atomic, because sources call this from several threads at once.

Each newsroom page has two live regions, the sidebar and the article, both running on separate streams. The sidebar reads the run status, which changes constantly during a run. The article reads only a counter bumped when a day is stored. Since a
stream only watches what its last render read, the article doesn't
need to repaint while a run is in progress.

All readers have their own lanes in the form of a status ratom and a stored counter, so each reader's run only dirties their own pages. When a tab closes, or a reader signs out and the stream gets its 401, the stream drops its subscriptions.

Incidentally, the same kind of batching also works for the database. Making the status of a run durable makes it possible to pick up where it was interrupted. But the same problem we talked about earlier came back from the other direction. Writing the status to SQLite on every `swap!` results in a database write per progress tick. So, Newsroom marks the run as unsaved instead, and a background thread writes the changed runs once a second:

```clojure
(defn- update-status! [run-id f & args]
  (swap! (status-of run-id) (fn [st] (if (identical? run-id (:run st)) (apply f st args) st)))
  (when (and (instance? Run run-id) (.-job ^Run run-id))
    (swap! unsaved conj run-id)
    @saver))
```

This is the same tick pattern of marking the state dirty, and doing a flush on a timer. A restart loses at most a second of the log without the worry of having IO pressure. And the final state can be written synchronously when the run ends.

## Summary

Each layer that I've discussed in this post removes a different kind of repeated work:

- **ticks** ensure that one render happens per page per tick rather than per write
- **the component cache**: further gives one render per change on each page
- **sliding buffers** give one frame in flight per client
- **`tx!`** makes it so that a render can't see a partial update
- **patches** send the change only for the page components that changed
- **tables** derive state from the change instead of the collection itself
- **release on close** cleans up pages nobody is looking at

The reactive model is key for all of this, because the dependency tracking used to decide what to re-render can also be used to infer what can be skipped.

{:title "Fibers in Jolt: green threads that fit core.async" :layout :post, :tags ["programming" "clojure" "scheme" "chez" "concurrency"]}

Jolt now provides opt-in support to run `go` blocks on fibers instead of OS threads. This post will discuss how that works along with the different trade-offs made compared to other implementations, and why core.async turns out to be a great fit for the mechanism. All the numbers below are from an Apple M1 Pro with 10 cores, measured with the harness in `bench/fibers` on the current tree.

## The problem with a thread per process

As you probably know, core.async's programming model is best served by cheap green processes that communicate over channels. Jolt's original implementation backed every `go` block with a real OS thread. Using system threads affords the same semantics, and it has a nice property that there's nothing special about a `go` body. But real threads have significant overheads putting a limit on the number you can reasonably have, and they're not particularly cheap to start.

Let's take a look at what that ceiling looks like for threads and fibers when spawning K processes that each immediately park on an empty channel:

| backend | K | created | per spawn |
| --- | --- | --- | --- |
| fiber | 10,000 | 10,000 | 1.09 µs |
| fiber | 100,000 | 100,000 | 0.74 µs |
| thread | 1,000 | 1,000 | 53 µs |
| thread | 10,000 | 4,080 | 168 µs |
| thread | 100,000 | 4,079 | 159 µs |

As the number of threads goes up, they effectively stop working. My machine runs out somewhere around 4,080 live threads, and by that point, the spawn cost has already gone up 3x. Memory story isn't encouraging either with a parked process costing 4,160 bytes of live heap on a fiber while sitting at 68,729 bytes on a thread. That's a 16.5x difference as a base, and measured as peak RSS rather than live bytes the gap widens to 44x since a thread needs a guard page along with a real stack mapping. So the motivation to have a light weight mechanism should be pretty obvious.

## What a fiber is here

A fiber consists of a record holding a state, a body thunk, a continuation slot, an intrusive run queue link, a slice of per-fiber dynamic state, and the carrier it belongs to. In addition, the scheduler needs a little bookkeeping to track the pending step, the fiber's registered monitors, and the interrupt depth it parked at. Parking captures the current continuation with `call/1cc` and jumps to the scheduler, and that continuation is what gets invoked when resuming. That's all there is to it at a high level, and on Chez a bare continuation switch measures just 8.6 ns.

The current fiber lives in a Chez virtual register costing about 2 ns to read. Since the cost is so low, a scheduler can do millions of switches per second. The full scheduler yield, including swapping the fiber's dynamic slice and arming the preemption timer described further down, comes to around 137 ns.

Another consideration here is that a continuation on Chez is a stack segment, which is not free. A completed fiber that holds no continuation costs just 108 bytes, but the moment it parks, the cost jumps to about 4,177 bytes. Interestingly, that number barely moves with stack depth:

| shape | bytes per fiber |
| --- | --- |
| completed, no continuation | 108 |
| parked, 1 frame | 4,177 |
| parked, 3 nested calls | 4,187 |
| parked inside a `dynamic-wind` | 4,281 |

So a fiber isn't actually cheap because its stack is small, but due to 4 KB being much less than the 69 KB an OS thread costs, which makes it possible to have hundreds of thousands of them running concurrently.

## Why core.async fits

On the JVM, `go` had to be a macro that CPS-transforms its body into a state machine because the JVM had no continuations when core.async was originally written. That's the key reason why `<!` and `>!` only work lexically inside a `go` block. Putting a parking take inside a function then calling it from a `go` body does not work since the macro cannot see past the call boundary to rewrite it.

Jolt, on the other hand, has real continuations, so there's no need for the transform to park. A fiber's `<!` registers a waiter on the channel and captures its continuation, wherever it happens to be. With this approach, parking works through arbitrary call depth, helper functions, callbacks, or even `eval`. The whole limitation core.async has on the JVM goes away on the Chez runtime.

Jolt ships its own native channels, but it implements the same design for the waiter protocol. A channel operation that cannot complete immediately registers a handler and waits to be woken. The only difference from threads is that they wait on a condition variable while fibers wait by parking. The channel core doesn't need to know which it is talking to. All it has to do is commit to a handler under its lock, write a mailbox, and call a wake function. The immediate-completion path, where a buffered value or a waiting putter is already there, captures nothing and never touches the scheduler at all.

Adding fibers meant adding a second wake strategy, and the blocking variants fall out from that as well. On a fiber, `<!!` and `>!!` park exactly the way `<!` and `>!` do. Blocking semantics are preserved, in that the process does not proceed until the value arrives.

## Paying for the continuation only when you need it

Yet, having 4 KB per parked fiber still bothered me since for a large class of `go` bodies it should be avoidable. When the park site is visible to the compiler, the rest of the body can be turned into a closure of a few hundred bytes rather than necessitating a whole stack segment.

And that brings us back to the JVM's transform, which I originally avoided, but the big question was how to avoid inheriting the JVM's limitation along with it. Having to prove that the pass can rewrite every park in a body means a closed world analysis with anything calling park within the body resulting in a compilation time error.

Jolt makes the choice per park site instead, with the continuation park being used as the runtime fallback. A CPS pass in `clojure.core.async` rewrites the body where it can so that a park it rewrote stores a closure and switches with no capture, but a park it could not rewrite is left as written and parks by capturing. Both mechanisms coexist inside a single fiber, and can be mixed freely. Since there is no static claim to defend, a park inside a called function, a `try`, a nested `fn`, a collection literal, or reached through `eval` still works. It just keeps the continuation park, which is what a park cost before any of this existed.

The result on a parked process:

| park mechanism | live bytes | continuations held |
| --- | --- | --- |
| rewritten body | 877 | 0 of 10,000 |
| captured continuation | 4,785 | 10,000 of 10,000 |

That's a 5.5x difference in memory. The park and resume round trip, meanwhile, is 1,040 to 1,049 ns rewritten against 984 to 1,018 ns captured, so the actual win here is memory usage rather than time.

It's also worth noting that `alts!` still captures, because threading a continuation through the waiter registration would be its own major piece of work, and so does any park inside a `try`, because the rewrite would have to carry the exception frame explicitly. The pass also treats a bare `fn` as opaque, since it cannot see what the closure is handed to, and that covers a larger set than it sounds like since `binding`, `dosync` and `locking` all hand their body over as a function, and a park inside any of them takes the capture too. All of these are correctness-preserving fallbacks rather than failures, however. A rewritten park does not rewind the dynamic-wind chain on the way back in, so a park that sits inside a wind has to be one the pass left alone.

## Preemption, and the locks it forced

A cooperative scheduler assumes that `go` bodies reach a channel op reasonably often. When a body is pure computation instead, the fiber holds its carrier for as long as it runs, and every fiber queued behind it is simply stuck since fibers cannot migrate carriers. That creates potential for an unbounded starvation window.

The way to deal with the problem is to make the scheduler preemptive. Chez polls an engine timer at procedure calls and loop back edges, which means even a tight Scheme loop is preemptible, and the timer handler can turn the fiber's quantum into a yield. The default quantum is about 0.45 ms. A queued fiber stuck behind a fiber spinning in a bare loop on the same carrier gets to run within about a millisecond, and a 200 ms compute-bound spin gets preempted around 265 times.

The `clojure.core.async/*fiber-preempt-ticks*` var sets the quantum, subject to a floor, and is read once when the carrier pool starts. No value turns preemption off, so code that wants effectively cooperative behaviour can ask for a very long quantum instead. However, it's worth noting that preemption cannot help with a fiber that's inside a blocking foreign call because the timer is only polled in Scheme.

To ensure that preemption works safely, every lock in the runtime routes through a common counting wrapper, and the scheduler refuses to switch a fiber that holds one, re-arming on a short retry so the preemption lands just after the region instead of being dropped. That works because those regions measure around 55 ns against a 0.45 ms quantum, but the locks whose region is a user body are a special case. These include `locking`, `dosync`, a `delay` being forced, and `java.util.concurrent.locks.ReentrantLock`. Those regions are as long as the caller's code and the caller may park inside them, so they must carry ownership in a field keyed on the fiber rather than in an OS mutex. A field survives a context switch, and no counted lock is held while user code runs, which makes a long `locking` body preemptible.

The upshot for anyone writing jolt code is that a lock is a lock. You can hold a monitor across a `<!`, run a transaction that parks in the middle, and force a `delay` whose body blocks on a channel, with exclusion holding in each case.

## Proving the design using formal tooling

The awkward thing about concurrency work is that it's both notoriously difficult to reason about and to test exhaustively. So, I decided to try proving certain properties of the design using Z3 through the [chiasmus MCP](https://github.com/yogthos/chiasmus) to help ensure that my approach was sound. The pattern is to state the rule along with the property it is supposed to enforce, then have the solver either hand back a counterexample or report that none exists.

The lock ownership rule is a good example to walk through because it is small enough to show in full. The entire question here is which identity an acquire writes into the owner field and what the next acquire does with it. In the runtime that comes down to two pieces:

```scheme
;; who is asking: the FIBER when there is one, else the OS thread's identity
(define (monitor-self) (or (jolt-current-fiber) (current-interrupt-box)))

;; and what the acquire does with the answer
(let ((me (monitor-self)))
  (let loop ()
    (let ((owner (vector-ref m monitor-i-owner)))
      (cond
        ((eq? owner me) (vector-set! m monitor-i-count (fx+ 1 (vector-ref m monitor-i-count))))
        ((not owner)    (vector-set! m monitor-i-owner me)
                        (vector-set! m monitor-i-count 1))
        (else           (monitor-wait! m) (loop))))))
```

The model, written in SMT-LIB, consists of four facts. Two execution contexts have identities, and the design either gives them the same one, which is the thread they share, or different ones, which is the fiber. The first context takes a free lock and parks inside the section without releasing. The second then runs the acquire decision exactly as the code writes it. And the property under test is that no state has both contexts inside the section at once.

```scheme
(assert (! (= by_thread (= id_f1 id_f2)) :named identity-model))
(assert (! (= owner_after_f1 id_f1)      :named f1-owns))
(assert (! f1_in_section                 :named f1-still-inside))
(assert (! (= f2_enters (or (= owner_after_f1 NONE)
                            (= owner_after_f1 id_f2)))
                                         :named f2-lock-decision))
(assert (! (and f1_in_section f2_enters) :named seeking-violation))
```

The correspondence we're interested in is that `by_thread` records which branch `monitor-self` took, since the thread branch is the one that hands two fibers on a carrier the same identity, and `f2_enters` is the disjunction of the two cond arms that get in without waiting.

Asking whether that violation is reachable at all comes back SAT, and the assignment the solver hands back is the bug itself: `by_thread` true, both identities equal, and both contexts inside the section. Pinning the design to context identity and asking the same question comes back UNSAT. Here the unsat core names the identity choice alongside the acquire rule, which says the property depends on that choice rather than holding by accident of how the rest of the model happened to be written.

I could have reasoned through this by hand and been fairly sure, but having a formal proof takes the guesswork out of the rule itself. The solver quantifies over every assignment the model admits, so an UNSAT is exhaustive rather than a sample, and a SAT identifies the exact assignment that breaks it.

Of course, there is a limit to how much a solver can help since it proves a property of the rule I described to it, rather than of the code itself, and it knows nothing about implementation details such as Chez mutexes or the winder chain. Hence, the result can only be as strong as the model is faithful. However, there is a lot of value in knowing that the approach is fundamentally sound, while the actual implementation can be covered by the tests.

Not every invariant has a shape that lends itself well to this approach, and you have to know when to reach for it. The things generally worth formalizing are the rules for the load-bearing decisions that determine whether the approach itself is sound or not.

## How this compares to Go and the JVM

Go's goroutines start with a small stack, around 2 KB, and grow by copying when they need more. Since the Go runtime has precise stack maps, it allows relocating a goroutine's stack, so goroutines can migrate freely between OS threads, allowing the scheduler to steal work. A goroutine that blocks on IO parks on the netpoller, and a goroutine that makes a genuinely blocking syscall causes its processor to be handed to another thread.

JVM virtual threads keep their stack as heap-allocated chunks that mount and unmount from a carrier thread. Unmounting copies the stack out while mounting copies it back. A virtual thread on the JVM can also remount on a different carrier than the one it last ran on.

Unfortunately, Jolt cannot do either, which leads us to the central trade-off. A Chez continuation captured on one OS thread raises "attempt to return to stale foreign context" when you try to resume it on another. So a fiber is bound to its carrier for life. There is no way to load balance the work since an idle carrier cannot take another carrier's queued fibers.

Preemption means the fibers sharing a carrier at least take turns, avoiding a starvation problem. What is left is that a carrier's work cannot be moved somewhere else, which shows up as skew. You can see both halves in the scaling benchmark. Forty CPU-bound fibers across carriers scale nearly linearly, from 903 Mops/sec on one carrier to 6,499 on ten, which is 7.2x on my 10-core machine. Give one fiber ten times the work of the others and the batch takes 112 ms, which is how long that one fiber takes.

Go and the JVM are able to rebalance because they have a stack representation that can be moved around. Jolt doesn't have a similar mechanism to lean on, so the carrier pool acts as a throughput knob, and growing it does not rescue work that is already skewed onto one carrier.

## Blocking IO, which is where this usually falls apart

Another key challenge for a green thread system comes from blocking operations such as `read` on a fiber pinned to a carrier. Since continuations cannot migrate, everything queued up behind it ends up having to wait for it to finish.

Jolt's socket layer sets `O_NONBLOCK` and treats `EAGAIN` as "wait for readiness". Waiting means asking a per-process poller, kqueue on macOS and epoll on Linux, to report when the fd is ready. If there is a current fiber, the poller registers the fd and the fiber parks. And when there is not, the caller does a plain blocking wait on its own thread. The user-facing code is identical in both cases, so the same socket code implicitly works on a fiber and on a thread.

The wait has to be collect-safe, because Chez's collector stops the world, and a thread sitting inside a foreign call that is not marked collect-safe still counts as active. As a result, a collection from any other thread fails outright with "cannot collect when multiple threads are active". A poller stuck in `kevent` is essentially blocked all the time, which means that getting this wrong would result in the process never being able to collect. A full collect must succeed while the poller is blocked, and the failure mode is easy to miss.

Another tricky bit is that registration races need a control pipe. A fiber can register an fd while the poller is already inside `kevent`, and that registration has to interrupt the wait rather than sit there until the next unrelated event. The pipe read end is permanently in the poller's set, a registration writes a byte, and the poller drains pending registrations on every wake. This approach avoids needing timed polls or doing sleep in the wait path.

Finally, the commit to park has to be atomic with the wake, which is the same race the channel layer has, and gets solved the same way. The fiber marks itself parked under the poller's table lock, the poller collects woken fibers under that same lock and resumes them after releasing it.

## The numbers, including the ones that do not flatter fibers

We can see how this trade-off shows up in channel throughput:

| workload | thread | fiber |
| --- | --- | --- |
| ping-pong, 2 processes | 3.64 µs/roundtrip | 6.25 µs/roundtrip |
| ping-pong, pool pinned to 1 carrier | | 1.89 µs/roundtrip |
| fan-in, 8 producers x 2,500 values | 84,382 values/sec | 139,441 values/sec |

Two processes ping-ponging are actually a good margin slower on fibers than on threads. When two fibers land on different carriers, every handoff requires a cross-thread wakeup to take a lock, signal a condition variable, then wake another OS thread. That's strictly more work than two live OS threads doing handoffs directly between each other. But when the pool is pinned to a single carrier, the benchmark runs at 1.89 µs. Since the handoff is now a continuation switch that happens on the same thread, it's 1.9x faster than thread communication.

The fan-in case, which is closer to what people actually build, goes the other way giving 1.65x in favor of fibers. Having eight producers and one consumer is a shape where holding eight OS threads would be significantly more expensive.

Context switch costs, for calibration:

| operation | cost |
| --- | --- |
| bare continuation switch | 8.6 ns |
| scheduler yield including slice swap | 137 ns |
| OS thread channel handoff | 1,819 ns |

Memory usage characteristics are generally good, and stay flat under churn. Creating 16,000 fibers in waves of 2,000, with a full collect between batches, settles at about 234,000 bytes and stays there from the second wave on, since fibers release their memory as they finish.

## What this means in practice

Fibers are provided as an opt-in mechanism which is enabled using `clojure.core.async/*go-backend*`. The var defaults to `:thread`, and you bind it to `:fiber` around the spawn. The thread backend has no pinning story to worry about, and it remains the right default for code that does unpredictable things. The pool size is managed using `clojure.core.async/*fiber-carrier-count*`, which defaults to the machine's processor count and gets read when the pool starts.

The rough guidance is that if you have many processes that spend most of their time parked, fibers win by a lot, on both spawn cost and memory. If you have a small number of processes doing tight channel handoffs then you have to pin the pool. A process that just computes for a long time is fine since the scheduler preempts it. The case that still needs care is a process that blocks a carrier on something the poller does not cover, and that's where `thread` should be used, since it always spawns a real OS thread regardless of the backend setting.

The part I find most satisfying is that adding fibers ended up being a matter of implementing a different wake strategy because core.async's channel protocol doesn't assume what a waiter is. And having real continuations means parking is no longer confined to places where the macro can see it. Thus, Jolt avoids the single most annoying restriction of core.async on the JVM, while keeping the compiler transform around as a memory optimization for the cases where it applies.

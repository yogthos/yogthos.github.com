{:title "The Hidden Elegance of Gradient Noise " :layout :post, :tags ["programming" "clojure" "graphics"]}

How would you go about rendering a scene reminiscent of dark teal water, lit from somewhere below, with thousands of faint cyan filaments drifting and swirling across it? Your instinct might be to reach for a shader or to create a particle simulation, but you could render the whole thing using just a couple hundred lines of arithmetic instead. That's precisely what we're going to do in this post by rendering these filaments using the same function Ken Perlin wrote in 1985 to fake textures on a computer that couldn't draw them for real, which we know today as Perlin noise.

<iframe src="/files/perlin-flow.html" title="Perlin flow field visualization" loading="lazy" style="width:100%;height:480px;border:0;display:block;border-radius:6px;margin:1.5em 0;"></iframe>

I'll walk you through a moving-water visualization to illustrate what
Perlin noise actually is, and how a single noise value can be used to steer thousands of
particles into curving currents to create a flowing surface. The snippets use 
the [Squint](https://github.com/squint-cljs/squint) ClojureScript dialect,
but the ideas are language-agnostic.

## What is Perlin noise?

Naively using random values is the wrong approach for creating a natural-looking texture.
Pure randomness at every pixel will produce boring static that's chaotic and grainy. Real surfaces such as marble or water are smooth because neighbouring points tend to be correlated. A piece of marble that's bright here is probably still fairly bright a millimetre over there.

Perlin noise provides a way to generate that kind of structured
pseudo-randomness. It's a deterministic function from a point in space to a
scalar value, with three properties that make it magical for graphics, which are as follows.

Nearby inputs give nearby outputs without seams, leading to smooth transitions. The same seed always gives the same output, so the texture ends up being stable across frames. And it has no preferred direction, making it look isotropic, unlike a simple grid of blurred random dots.

Under the hood it's just gradient noise generated in three steps. First, we need a tile space in the form of a grid, and then we plant a pseudo-random gradient vector at every corner to provide a direction. For any point inside a cell, we need to figure out how strongly each corner's gradient points toward it using a dot product. Finally, we just blend the contributions of the surrounding corners.

A naive linear blend would leave ugly visible creases at every grid line. Perlin, instead, passes the interpolation parameter through a fade curve which is a polynomial shaped so that it starts and ends flat, allowing the value to ease gently into each corner:

```clojure
(defn fade [t]
  (* t t t (+ (* t (- (* t 6) 15)) 10)))
```

The formula above is just `6t⁵ − 15t⁴ + 10t³` with its first derivative being zero at
both `t = 0` and `t = 1`, which is precisely what guarantees the output is
smooth across cell boundaries. Linear interpolation itself is likewise dead simple:

```clojure
(defn lerp [t a b]
  (+ a (* t (- b a))))
```

The gradient lookup hashes a corner to one of a fixed set of directions and
returns the dot product against the point's offset within the cell:

```clojure
(defn grad [hash x y z]
  (let [h (bit-and hash 15)
        u (if (< h 8) x y)
        v (if (< h 4) y (if (or (== h 12) (== h 14)) x z))]
    (+ (if (zero? (bit-and h 1)) u (- u))
       (if (zero? (bit-and h 2)) v (- v)))))
```

A small seeded PRNG shuffles an identity permutation table at construction time to decide which gradient each corner gets, making the field reproducible. A caller doesn't need to worry about any of this and simply passes their desired `x`, `y`, and `z` to `noise3` to get back a smooth value. Perlin's raw output sits roughly in `[-1, 1]`, and the implementation remaps it to `[0, 1]` so that downstream consumers can scale it linearly into their own positive range:

```clojure
(/ (+ 1 n) 2)
```

And that's the whole noise engine in a nutshell. Now that we have our noise, let's see what we can do with it to create a smooth animation.

## From a number to a current

Smooth scalar values are nice, but what if we wanted to create an animation which moves in a particular direction? Well, to do that we just have to treat the noise value as an angle to give us a compass heading. Next, we multiply by a full turn (`2π`) so that the entire
`[0, 1]` range maps to every possible direction:

```clojure
(defn create-flow-field 
  [{:keys [noise noise-scale force-scale time-scale]
    :or {noise-scale 0.003 force-scale 1 time-scale 0.15}}]
  (let [noise3 (:noise3 noise)]
    {:force-at
     (fn [x y t]
       (let [theta (* (noise3 (* x noise-scale) (* y noise-scale) (* t time-scale))
                      js/Math.PI 2)]
         #js {:x (* (js/Math.cos theta) force-scale)
              :y (* (js/Math.sin theta) force-scale)}))}))
```

And with that trick we get a flow field which we can ask for a velocity vector of a pixel at `(x, y)`. Since the underlying noise is
smooth, nearby pixels get nearly identical headings and the field ends up looking like a coherent map of currents, complete with eddies, calm spots, and converging streams.

The `noise-scale` knob controls the zoom factor of the flow. Scaling the coordinates down
before sampling samples the noise at a coarse resolution, creating swirls that are broad and slow. On the other hand, scaling up produces nervous little vortices.

A keen reader will have noticed that the function takes a third coordinate, `t`, that we'll come back to later. For now, I'll leave a hint that it's going to be our secret ingredient for motion.

## Drawing the curves

To actually see the current we have to drop particles into the field
and let them drift. Each particle needs to keep track of its previous position as it's moved by its local current, so that we can draw a short line segment from where it was
to where it landed:

```clojure
(defn update-particle! [p force]
  (set! (.-lifetime p) (dec (.-lifetime p)))
  (if (neg? (.-lifetime p))
    (respawn! p)
    (do
      (set! (.-prevX p) (.-x p))
      (set! (.-prevY p) (.-y p))
      (set! (.-x p) (+ (.-x p) (.-x force)))
      (set! (.-y p) (+ (.-y p) (.-y force)))
      (wrap! p (.-width p) (.-height p))))
  p)
```

When we run that for a few thousand particles over a thousand frames in a row, they
trace a curve through the field, and since the field is smooth and
continuous, neighbouring particles trace neighbouring curves. The collective
result has a look of flow lines following a current similar to the way dye disperses in moving water.

Each segment itself is just a stroked line, tinted by a second, finer noise
pass so the colour shimmers across the surface instead of reading as just flat
cyan:

```clojure
(defn- draw-segment! [p noise2]
  (let [v     (noise2 (* (.-x p) 0.004) (* (.-y p) 0.004))
        hue   (+ 185 (* v 30))
        light (+ 55 (* v 25))]
    (set! (.-strokeStyle ctx) (str "hsla(" hue ", 80%, " light "%, 0.3)"))
    (doto ctx
      (.beginPath)
      (.moveTo (.-prevX p) (.-prevY p))
      (.lineTo (.-x p) (.-y p))
      (.stroke))))
```

So the shape of the motion comes from the noise field while the colour comes from an independent one sampled at a different scale. Thus, we have two channels of the same primitive, doing two different jobs.

## Two additions that make it move

Everything we've done so far produces a frozen flow field. Next, we'll need to make two small changes to turn it into a living animation.

### 1. Time is just a third dimension

Remember the unused `t` in `force-at`, which we were going to come back to? Well, what I didn't mention is that Perlin noise can be defined for any number of dimensions, and the implementation here is actually 3D. The first two dimensions are
in space, but the third one is time. Each frame, we advance `t` a tiny bit, and because
the noise is smooth in all directions, the entire current field ends up drifting as a result. Eddies migrate, streams bend, while calm patches open and close. The field smoothly evolves from one frame to another frame as we increment the counter:

```clojure
(swap! state update :time inc)
```

The `time-scale` parameter governs how fast that evolution happens, and we want to keep it small to produce gentle change rather than a strobe. And that's how using an extra noise dimension as the clock turns a static render into an animation. In case you're wondering, you can generalize it freely, and a 3D animation can be similarly created using 4D noise.

### 2. Trails decay into the deep

The last step is to make sure that our trails fade over time to create continuous motion as old trails fade out, and new ones appear over time. To achieve a shimmering effect we want to avoid fully clearing the canvas. Instead, every frame paints a translucent dark rectangle over the scene before drawing the new segments:

```clojure
(set! (.-fillStyle ctx) "rgba(3, 18, 26, 0.03)")
(.fillRect ctx 0 0 width height)
```

A value of `0.03` alpha is doing a huge amount of work creating the effect of old line segments slowly getting drowned. A particle's recent trail glows bright, one from half a second ago starts to fade, and then it's gone completely. The result is a cheap,
accidental motion-blur that gives the surface its reflective, continuously
flowing quality.

Tuning this alpha number shifts the whole mood, with higher values making trails vanish
almost instantly, while lower ones smear into long ghostly streaks.

## Tying the edges together

Another thing to consider is how to keep the surface believable at the borders. Here, we can have particles that drift off one edge reappear on the opposite side using a toroidal,
seamlessly tiling wrap. When a particle wraps, its previous
position needs to wrap along with it to avoid drawing ugly streaks across the canvas:

```clojure
(defn- wrap-delta [v extent]
  (cond (>= v extent) (- extent)
        (neg? v)     extent
        :else        0))
```

In a flow field, particles spiral into a
handful of attractor orbits and drain out of the rest of the canvas. To keep
the whole surface populated, each particle has to have a randomized lifetime so that when it
expires, it can respawn at a fresh random location with its lifetime reset.
Lifetimes also need to be jittered from the start so that respawns stay staggered rather than
all firing on the same frame.

## The loop

Here's how the whole machine runs frame by frame:

```clojure
(defn draw []
  (let [{:keys [width height particles time]} @state
        force-at (:force-at field)
        noise2   (:noise2 noise)
        n        (alength particles)]
    ;; Fade old trails toward the deep.
    (set! (.-fillStyle ctx) "rgba(3, 18, 26, 0.03)")
    (.fillRect ctx 0 0 width height)
    (set! (.-lineWidth ctx) 1)
    (set! (.-lineCap ctx) "round")
    ;; For each particle: sample the current, drift, draw its segment.
    (dotimes [i n]
      (let [p (aget particles i)]
        (update-particle! p (force-at (.-x p) (.-y p) time))
        (draw-segment! p noise2)))
    ;; Advance the clock and schedule the next frame.
    (swap! state update :time inc)
    (reset! raf-id (js/requestAnimationFrame draw))))
```

If you read the function from top to bottom, you can see the exact steps that are happening. First, a dark background is painted on the canvas, then the noise field is sampled for each of a couple thousand particles to see which way the water flows. The particles are nudged that way,
and a faint coloured line is drawn behind each. Doing that sixty times a second creates the final animation.

## Why it works

Now we can see how the whole animation is put together. The noise gives us the basis for the flow field, the third dimension provides an arrow of time, and the fade creates a sense of motion. All of these ideas compose into something that feels far more complex than the sum of its parts.

The full source can be seen on [Squint playground](https://squint-cljs.github.io/squint/?src=gzip%3AH4sIAAAAAAAAE51a%2FY7bNhL%2FP08xcVGclKwd2fvRrH29y26vvRboHYI2wCU1Fi0tjSxmZVIlKVvaIIe%2Bw90T9kkOQ4qS%2FLm5CotYEueLM8OZH6kECaYCVmW%2BQKXq8wnMNWJy9wRgNoMfERNM4PUP%2F%2Fw7cA2lxgSkyGvYZDxHWJQ8T7hYgskQClSr0jDDpQDDFjmOngAEORqYMwjWMmeG5%2FgUglJovhSYDBfcDHXGUzNUfJkZIMUQhSEpBwhSAXN3CxCs9YYVT4G519UdBMQtFQTPoYKoukomiy%2Bu08uQBISey2lfQ%2FBev%2FgHM9mIr8rcsVZSwSt2wppXDMaXragjl7diDK%2FYDq2BTlHwHI5bQSNHrWBr%2BOIxI47YdDUGtu6csX%2BxdeNqy%2FXihBWtreYEkYHxRUj%2B7yu8mFxfXF99Mbm%2BCul68iSw%2BZayBGFu7iB4BsRpyEX2Phi636vQuh%2FGNp6OK0dVwNwAg8Wd9WnLsgDWF79ULIF5xnQGFdTwQNN0yZC5uTCRgB0eX3bmlhDwFII%2FQwYvQ2Lshtbd0EUItXuiwH75JWQwnoT%2BjjxQwUObxM8d6QMq%2BdeeahiHIekbQtkF6DDlJAxJ%2FRAolu0Uh8CUYvXQLYs5Uwo4vO%2FmaVYFBGyJhuiAe3OY9m96o%2B8bE7rR92BWRc%2BfsUJmcCgk19gVCKeJ1j0EXBg5tCZBoJhYIkwur3q5V7gJ9qmwQGbgcjyhJdsSKrEECHr1iNy8XRlmM%2FiG6wzV77%2F95x0zqEFnZZrmCDK1pYgnKAw3db8mnVkhmMCi7lU7qlEAQSI1%2Fgpz3tl%2BCREMx%2B36CPretjPm3XJOc0mp8AwCJZYhxZxTfP3Sm83gb7Jc5JhALuV9WbjyCFpCUMzf3sFzeBfCRrFCQ5wjE3ndmmX4CjUZdjmedLZQmIo2hC4APmE4Gd%2FqdiGycTtvSqdfD%2Ft1w9LayQyr3dlVJ2qQY6l3WepHWR52WR5OsLzt5uhtpJkeZ3i3y1A%2FwvDTLsPDIwxpReuy8vacoqyJsvaGnKJ8IMoHb8EJyhICW0bTU4rXnuiUzo0nOqVuNoNYKoFqSNWVozBTm89QFlDMeVLdAXkO1ywvmUFbg10eH7yWLh15UgGrgNXAHu4gsIW7SWvgSRW2g6ea4I0rtA3b2xDenSK%2B6RPfhPDTKeLbPnHARQw34WmWW9hjeRueNul2y6TbR%2BTvm3T7iEmzGRjFcy6QKeDCoCosHJPCV8yXEJcLHLoAgw%2BwPi5SULlQBWwehyaOcP2pGMaRlxAsKVRpRWsnfQjpmfyUYEwZ37wN%2F4jUW7twraA6bGXfdrL7Y5%2Bi4o%2FP0GXUTdjM0yl%2BCK1FLrQ34dacW4rwD2u7tdraOR7QedvTuU8X%2Bj68d81m8BpVzgXI0hSloT3Dv%2BfD8dn4bgYKV6wAI2EenY3vjlQGQqHPYQwiJNzTn6PtYZO2h91B0HQ1amgtNAD4MG0omx%2F3eO4ezz9aUDObUXndpBzzBJ5DwZThcY56B%2B4QzdARzT9M77HWTSt1woY6ZjlCKlXs76ldu9sjHrLXVCr40BcRjaLofEvQuCcKotH48uPHDnH5dr41tcYBH6ZODDPOgLbnm9aiBiBmaCx%2B9n4MnkHVn1hIb%2Bq9N6Zn2dEk9F399Xcw6SfLZ%2B81fJhWVq2niaWmEmRY2PfAruRpvcWkuTjE9DGkv50w%2BvB2QSR%2FbHhiMsjQbl1yniJN63jUbMw8Gc3vO5FywU3tAuMnVpGhNUwLheu39EQ376D2cqetiPZmumLV97tvW3pnpvt32ljrfj66RP5WbiBlChjEUqqEC%2Bq9q1IbsHszWnA59eUFi%2B%2BBC80TBKwMCjOCG0gVW%2BGfNAlayTWuUNhFy%2FINqzVsMM%2BhFAkq%2BMXx%2FHJGsJWB5mKZowWtRI9Clsts5Lcm9HqYYG4YzNeNNpu%2BsRQJBH%2F5EvzbkMBOc9ttRQUu%2Fwrr0D64wXZsirlG%2FxB1sSaVT2FebMW1WzJJBUHPqmA0rKAIHXGnOKl3qWqicsL8FmqToRgKafxWLWnhV6DRPG1lU5NubpMq3KNxGdLStY9EGx7RVO9JqTsJ9japD2t6t63pnae11IXLpNe%2BDIIuuGI5IQWKdYobYMYoFhupQKoFN9pCvUQxV%2Bo9ilCo%2FT0JjJlYM00ZqDCuaQWaDFf0zCBVqDPIZexgyD1iYcsAbDJJe6NSpSxGKGRR5sxgMiKBZDqlW8GFwIQExaVSlLNaNgZQsqIi0zYahARtFLJ7YLGSulGgWNFmqkJdsI2gzOnV1%2B0CpZhI5Cok37nkKnp1T9THaJvFWrRHAVvZIai17uWCaHJpO76Cuu9eNEWTDe1IW1Eo1KNhv6zQXr5dKmWR9MuiXTW2iFoPHJRGrX%2F7nXWBPbCwi3Vn0BnWOrdoXiTy%2BCpwfjmRvM4Zj641%2B2un0zsHPLZc7O8usSslRT%2Fe2%2FFsFw3l5IYZVPD7b%2F%2F16e5ykIul87cUMTZD3ZEJ5XEwWqL5Orc197b%2BLqGmksi4tDV4YMUO%2BjXHZX8wUkiV2j5tbfIpQq7jNUK3BToTvMSeT3gCcdgq3B2NtX6DlaFbbeocId5p%2BoOE6yJn9XSRy%2Fh%2BVkjNaUVPU15hMjOymEazHFMzjWYPQy4SrKbX19fXs0LajcgQ17TRmAopsNM%2BYkWBIvkq43lCqhcyqfvTCSH2tHGb2c7TpnKe%2FUoKQ4Y3URlMkkFzjmjpkkJBsOLCneKNhgmueYyveYX5D1SSSNuGi0RuQhhbMOqUODwEwdaJ2CSaXERXER3UWhqHGYN9GNmA00bIdBcDjl%2FCdAsFji5gugUEoyi6bhEOaEPNPmBGruBDAxWiFiZEMG2RrQUo8zsnDSISYSUollICOBGC512VUKj5AxWHri5ubLoIgepfVlXnojYjspbkW2dER7NTBZ21LjrhgbO0DYWobYWeq5nacbbsIJtT1uWwY6eqahRsYFBUgyOajvBkWzwjjeaNYkKnUq1sClJ6RRD5Xy%2FbHh%2B6qDGtZdziuw7b9Qo1HVi2ZVpvhcIj2S208xFeWdldcyKllOSTqyjac9YL6%2BaegBCuot7XE7BHwcR1Q4efIx%2FB9lTyZxBtNbFWUQug8nodHWyK40n%2FoLc7Fd7F6bs7BM%2B%2Fg9ZOXDu7BS%2BgmeYnSTgOvD%2BJfQvnf%2BztgeirmmHKALI4a7eewOirhrMTbGkELoCAlvVpA29SrrSBDVt3IZ7NCHA1nVYTONKFQpZYWKaYyVCByZggXvpSRx%2FnMgTNVujAf7cRP9z6D7iRxnuBDEZFqTObLA0uOJzqXTFiyi5Rap9vaKrWFRqXtlMtatpfIG0VziDldB7lymXBtLaekAJB8aKwolpgR9I8bOxPnLxBM2caiDHNmYFY5rJULQoktDhs9Fs45M4OuuW2dhP1ZxDPWrRBFfnCeamBFO5NryKWtF2hQ42Xl0S3hvP%2BKshdlXkOl83o5HIPMGqj5D3%2B6MqQscDRKBhkOmfBwCoYnMHL6PMzGDTyBp%2BfQTQ6D9sKlUgCy6ZqG%2BwCl1y8Zt16CkYEK97IXVTmAVhHR%2BeIjq46BMxGztw%2B4iT%2FPla9ulMYe8CwX8z8uQYE7RGHa7Q9MO7iA%2F5opDkE6hG0OctyFEvCdl5r923JVvK8jCkZE6buIeV57nLUrhgwXBhNuU07GsV4rt3u2sgNU4ldXwliceYFLvnafyT3CUorm3ABF8szUJjmGBu%2BJr6Y%2Ba8%2FPvykvhf8gVouWHB%2BBuOXZzC5okBHFOmmFRH1Dxgb24aoBW1V%2BN0dg0DXyq3k8YHhr1jh1cpSJF5N78vUTg%2Fwnx27cPqPj5Zmb%2FNRQNBFdjulbCL0C832OvXL9GDNcXoavMNF3G1JaHIe9rzXLxT%2BWqI2N4Kv7Fb0Gxti0tTPYG1Ltkthuy23c%2BUJvHKi7qysmIkY8x1RPHF7pQZQ2fudzh5%2BWl%2B%2FO50Xn0Xn48mYfWImeJv%2BH3f0cPbPbjrDnGuDAhVJG7Ek%2BZrg%2FPfNyw79wcDRD5r%2F1tG5Y98ZVtFnPwfW5%2BH%2FAAdbYsWgIgAA), and the version running above is served from [perlin-flow.js](/files/perlin-flow.js) generated from Squint.
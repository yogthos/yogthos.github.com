var squint_core = await import("squint-cljs/core.js");
globalThis.user = globalThis.user || {};
var mulberry32 = function (seed) {
  const a1 = squint_core.volatile_BANG_(seed >>> 0);
  return function () {
    squint_core.vreset_BANG_(
      a1,
      (function (x) {
        return (x + 1831565813) | 0;
      })(squint_core.deref(a1)),
    );
    const av2 = Math.imul(
      squint_core.deref(a1) ^ (squint_core.deref(a1) >>> 15),
      1 | squint_core.deref(a1),
    );
    const t3 = (av2 + Math.imul(av2 ^ (av2 >>> 7), 61 | av2)) ^ av2;
    return ((t3 ^ (t3 >>> 14)) >>> 0) / 4294967296;
  };
};
globalThis.user.mulberry32 = mulberry32;
var fade = function (t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
};
globalThis.user.fade = fade;
var lerp = function (t, a, b) {
  return a + t * (b - a);
};
globalThis.user.lerp = lerp;
var grad = function (hash, x, y, z) {
  const h1 = hash & 15;
  const u2 = h1 < 8 ? x : y;
  const v3 =
    h1 < 4
      ? y
      : squint_core.truth_(
            (() => {
              const or__25732__auto__4 = h1 === 12;
              if (or__25732__auto__4) {
                return or__25732__auto__4;
              } else {
                return h1 === 14;
              }
            })(),
          )
        ? x
        : z;
  return ((h1 & 1) === 0 ? u2 : -u2) + ((h1 & 2) === 0 ? v3 : -v3);
};
globalThis.user.grad = grad;
var array_swap_BANG_ = function (arr, i, j) {
  const tmp1 = arr[i];
  arr[i] = arr[j];
  return (arr[j] = tmp1);
};
globalThis.user.array_swap_BANG_ = array_swap_BANG_;
var create_noise = function (seed) {
  const perm1 = squint_core.into_array(squint_core.range(256));
  const p2 = squint_core.into_array(squint_core.repeat(512, 0));
  const rng3 = globalThis.user.mulberry32(
    (() => {
      const or__25732__auto__4 = seed;
      if (squint_core.truth_(or__25732__auto__4)) {
        return or__25732__auto__4;
      } else {
        return 0;
      }
    })(),
  );
  for (let G__5 of squint_core.iterable(squint_core.range(255, 0, -1))) {
    const i6 = G__5;
    globalThis.user.array_swap_BANG_(perm1, i6, Math.floor(rng3() * (i6 + 1)));
  }
  const n17 = 512;
  let i8 = 0;
  for (; i8 < n17; i8++) {
    p2[i8] = perm1[i8 & 255];
  }
  const noise39 = function (x, y, z) {
    const floor_x10 = Math.floor(x);
    const floor_y11 = Math.floor(y);
    const floor_z12 = Math.floor(z);
    const X13 = floor_x10 & 255;
    const Y14 = floor_y11 & 255;
    const Z15 = floor_z12 & 255;
    const fx16 = x - floor_x10;
    const fy17 = y - floor_y11;
    const fz18 = z - floor_z12;
    const u19 = globalThis.user.fade(fx16);
    const v20 = globalThis.user.fade(fy17);
    const w21 = globalThis.user.fade(fz18);
    const g22 = function (idx, ax, ay, az) {
      return globalThis.user.grad(p2[idx], ax, ay, az);
    };
    const A23 = p2[X13] + Y14;
    const AA24 = p2[A23] + Z15;
    const AB25 = p2[A23 + 1] + Z15;
    const B26 = p2[X13 + 1] + Y14;
    const BA27 = p2[B26] + Z15;
    const BB28 = p2[B26 + 1] + Z15;
    const n29 = globalThis.user.lerp(
      w21,
      globalThis.user.lerp(
        v20,
        globalThis.user.lerp(
          u19,
          g22(AA24, fx16, fy17, fz18),
          g22(BA27, fx16 - 1, fy17, fz18),
        ),
        globalThis.user.lerp(
          u19,
          g22(AB25, fx16, fy17 - 1, fz18),
          g22(BB28, fx16 - 1, fy17 - 1, fz18),
        ),
      ),
      globalThis.user.lerp(
        v20,
        globalThis.user.lerp(
          u19,
          g22(AA24 + 1, fx16, fy17, fz18 - 1),
          g22(BA27 + 1, fx16 - 1, fy17, fz18 - 1),
        ),
        globalThis.user.lerp(
          u19,
          g22(AB25 + 1, fx16, fy17 - 1, fz18 - 1),
          g22(BB28 + 1, fx16 - 1, fy17 - 1, fz18 - 1),
        ),
      ),
    );
    return (1 + n29) / 2;
  };
  const noise230 = function (x, y) {
    return noise39(x, y, 0);
  };
  return { noise2: noise230, noise3: noise39 };
};
globalThis.user.create_noise = create_noise;
var create_flow_field = function (p__2) {
  const map__12 = p__2;
  const noise3 = squint_core.get(map__12, "noise");
  const noise_scale4 = squint_core.get(map__12, "noise-scale", 0.003);
  const force_scale5 = squint_core.get(map__12, "force-scale", 1);
  const time_scale6 = squint_core.get(map__12, "time-scale", 0.15);
  const noise37 = squint_core.get(noise3, "noise3");
  return {
    "force-at": function (x, y, t) {
      const theta8 =
        noise37(x * noise_scale4, y * noise_scale4, t * time_scale6) *
        Math.PI *
        2;
      return {
        x: Math.cos(theta8) * force_scale5,
        y: Math.sin(theta8) * force_scale5,
      };
    },
  };
};
globalThis.user.create_flow_field = create_flow_field;
var create_particle = function (p__3) {
  const map__12 = p__3;
  const x3 = squint_core.get(map__12, "x");
  const y4 = squint_core.get(map__12, "y");
  const width5 = squint_core.get(map__12, "width");
  const height6 = squint_core.get(map__12, "height");
  const lifetime7 = squint_core.get(map__12, "lifetime", Infinity);
  return {
    x: x3,
    y: y4,
    prevX: x3,
    prevY: y4,
    lifetime: lifetime7,
    maxLifetime: lifetime7,
    width: width5,
    height: height6,
  };
};
globalThis.user.create_particle = create_particle;
var wrap_delta = function (v, extent) {
  if (v >= extent) {
    return -extent;
  } else {
    if (v < 0) {
      return extent;
    } else {
      if ("else") {
        return 0;
      } else {
        return null;
      }
    }
  }
};
globalThis.user.wrap_delta = wrap_delta;
var wrap_BANG_ = function (p, width, height) {
  const dx1 = globalThis.user.wrap_delta(p.x, width);
  const dy2 = globalThis.user.wrap_delta(p.y, height);
  if (dx1 === 0) {
  } else {
    p.x = p.x + dx1;
    p.prevX = p.prevX + dx1;
  }
  if (dy2 === 0) {
  } else {
    p.y = p.y + dy2;
    p.prevY = p.prevY + dy2;
  }
  return p;
};
globalThis.user.wrap_BANG_ = wrap_BANG_;
var respawn_BANG_ = function (p) {
  const nx1 = Math.random() * p.width;
  const ny2 = Math.random() * p.height;
  p.x = nx1;
  p.prevX = nx1;
  p.y = ny2;
  p.prevY = ny2;
  return (p.lifetime = p.maxLifetime);
};
globalThis.user.respawn_BANG_ = respawn_BANG_;
var update_particle_BANG_ = function (p, force) {
  p.lifetime = p.lifetime - 1;
  if (p.lifetime < 0) {
    globalThis.user.respawn_BANG_(p);
  } else {
    p.prevX = p.x;
    p.prevY = p.y;
    p.x = p.x + force.x;
    p.y = p.y + force.y;
    globalThis.user.wrap_BANG_(p, p.width, p.height);
  }
  return p;
};
globalThis.user.update_particle_BANG_ = update_particle_BANG_;
if (typeof user !== "undefined" && typeof user.canvas !== "undefined") {
} else {
  var canvas = (() => {
    const prev1 = document.getElementById("water");
    if (squint_core.truth_(prev1)) {
      prev1.remove();
    }
    const c2 = document.createElement("canvas");
    c2.id = "water";
    c2.style.cssText =
      "display:block;position:fixed;top:0;left:0;z-index:9999;pointer-events:none";
    document.body.appendChild(c2);
    return c2;
  })();
  globalThis.user.canvas = canvas;
}
if (typeof user !== "undefined" && typeof user.ctx !== "undefined") {
} else {
  var ctx = globalThis.user.canvas.getContext("2d");
  globalThis.user.ctx = ctx;
}
if (typeof user !== "undefined" && typeof user.dpr !== "undefined") {
} else {
  var dpr = squint_core.min(
    (() => {
      const or__25732__auto__1 = window.devicePixelRatio;
      if (squint_core.truth_(or__25732__auto__1)) {
        return or__25732__auto__1;
      } else {
        return 1;
      }
    })(),
    2,
  );
  globalThis.user.dpr = dpr;
}
var noise = globalThis.user.create_noise(20240607);
globalThis.user.noise = noise;
var field = globalThis.user.create_flow_field({
  noise: globalThis.user.noise,
  "noise-scale": 0.0018,
  "force-scale": 1.4,
  "time-scale": 0.0009,
});
globalThis.user.field = field;
var state = squint_core.atom({ width: 0, height: 0, particles: [], time: 0 });
globalThis.user.state = state;
var raf_id = squint_core.atom(null);
globalThis.user.raf_id = raf_id;
var resize_BANG_ = function () {
  const w1 = window.innerWidth;
  const h2 = window.innerHeight;
  globalThis.user.canvas.width = Math.floor(w1 * globalThis.user.dpr);
  globalThis.user.canvas.height = Math.floor(h2 * globalThis.user.dpr);
  globalThis.user.canvas.style.width = `${w1 ?? ""}px`;
  globalThis.user.canvas.style.height = `${h2 ?? ""}px`;
  globalThis.user.ctx.setTransform(
    globalThis.user.dpr,
    0,
    0,
    globalThis.user.dpr,
    0,
    0,
  );
  return squint_core.swap_BANG_(
    globalThis.user.state,
    squint_core.assoc,
    "width",
    w1,
    "height",
    h2,
  );
};
globalThis.user.resize_BANG_ = resize_BANG_;
var seed_particles_BANG_ = function () {
  const map__12 = squint_core.deref(globalThis.user.state);
  const width3 = squint_core.get(map__12, "width");
  const height4 = squint_core.get(map__12, "height");
  const n5 = squint_core.min(2600, Math.floor((width3 * height4) / 600));
  const arr6 = new Array();
  const n47 = n5;
  let _8 = 0;
  for (; _8 < n47; _8++) {
    (() => {
      const life9 = 90 + Math.random() * 120;
      const p10 = globalThis.user.create_particle({
        x: Math.random() * width3,
        y: Math.random() * height4,
        width: width3,
        height: height4,
        lifetime: life9,
      });
      p10.lifetime = Math.random() * life9;
      return arr6.push(p10);
    })();
  }
  return squint_core.swap_BANG_(
    globalThis.user.state,
    squint_core.assoc,
    "particles",
    arr6,
  );
};
globalThis.user.seed_particles_BANG_ = seed_particles_BANG_;
var draw_segment_BANG_ = function (p, noise2) {
  const v1 = noise2(p.x * 0.004, p.y * 0.004);
  const hue2 = 185 + v1 * 30;
  const light3 = 55 + v1 * 25;
  globalThis.user.ctx.strokeStyle = `${"hsla("}${hue2}${", 80%, "}${light3}${"%, 0.3)"}`;
  const G__54 = globalThis.user.ctx;
  G__54.beginPath();
  G__54.moveTo(p.prevX, p.prevY);
  G__54.lineTo(p.x, p.y);
  G__54.stroke();
  return G__54;
};
globalThis.user.draw_segment_BANG_ = draw_segment_BANG_;
var draw = function () {
  const map__12 = squint_core.deref(globalThis.user.state);
  const width3 = squint_core.get(map__12, "width");
  const height4 = squint_core.get(map__12, "height");
  const particles5 = squint_core.get(map__12, "particles");
  const time6 = squint_core.get(map__12, "time");
  const force_at7 = squint_core.get(globalThis.user.field, "force-at");
  const noise28 = squint_core.get(globalThis.user.noise, "noise2");
  const n9 = particles5.length;
  globalThis.user.ctx.fillStyle = "rgba(3, 18, 26, 0.03)";
  globalThis.user.ctx.fillRect(0, 0, width3, height4);
  globalThis.user.ctx.lineWidth = 1;
  globalThis.user.ctx.lineCap = "round";
  const n610 = n9;
  let i11 = 0;
  for (; i11 < n610; i11++) {
    (() => {
      const p12 = particles5[i11];
      globalThis.user.update_particle_BANG_(
        p12,
        force_at7(p12.x, p12.y, time6),
      );
      return globalThis.user.draw_segment_BANG_(p12, noise28);
    })();
  }
  squint_core.swap_BANG_(
    globalThis.user.state,
    squint_core.update,
    "time",
    squint_core.inc,
  );
  return squint_core.reset_BANG_(
    globalThis.user.raf_id,
    requestAnimationFrame(globalThis.user.draw),
  );
};
globalThis.user.draw = draw;
var start = function () {
  const temp__25603__auto__1 = squint_core.deref(globalThis.user.raf_id);
  if (squint_core.truth_(temp__25603__auto__1)) {
    const id2 = temp__25603__auto__1;
    cancelAnimationFrame(id2);
  }
  globalThis.user.resize_BANG_();
  globalThis.user.seed_particles_BANG_();
  const map__34 = squint_core.deref(globalThis.user.state);
  const width5 = squint_core.get(map__34, "width");
  const height6 = squint_core.get(map__34, "height");
  globalThis.user.ctx.fillStyle = "#03121a";
  globalThis.user.ctx.fillRect(0, 0, width5, height6);
  return squint_core.reset_BANG_(
    globalThis.user.raf_id,
    requestAnimationFrame(globalThis.user.draw),
  );
};
globalThis.user.start = start;
if (typeof user === "undefined" || typeof user._resize_listener === "undefined") {
  var _resize_listener = window.addEventListener("resize", function () {
    globalThis.user.resize_BANG_();
    return globalThis.user.seed_particles_BANG_();
  });
  globalThis.user._resize_listener = _resize_listener;
}

globalThis.user.start();

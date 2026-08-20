import { composeProtrusion, latinProtrusion, defaultBuildOptions, breakParagraph, layoutLines, defaultBreakOptions, ItemType, CJK_CHAR, graphemes, fontProtrusion, textMakesBox, buildItems } from './chunk-SNOJHREQ.js';
export { composeProtrusion, fontProtrusion, hangingPunctuation, kinsokuNotAtLineEnd, kinsokuNotAtLineStart, latinProtrusion } from './chunk-SNOJHREQ.js';

// src/dom/measure.ts
function fontSpecOf(style) {
  const letterSpacing = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;
  const wordSpacing = parseFloat(style.wordSpacing) || 0;
  const computed = function (property, fallback) {
    if (fallback === void 0) {
      fallback = "normal";
    }
    return style.getPropertyValue(property).trim() || fallback;
  };
  const spec = {
    style: style.fontStyle,
    weight: style.fontWeight,
    sizePx: parseFloat(style.fontSize) || 16,
    family: style.fontFamily,
    letterSpacingPx: letterSpacing,
    wordSpacingPx: wordSpacing,
    stretch: style.fontStretch || "100%",
    variationSettings: style.fontVariationSettings || "normal",
    variantAlternates: computed("font-variant-alternates"),
    variantCaps: computed("font-variant-caps"),
    variantEastAsian: computed("font-variant-east-asian"),
    // font-variant-emoji is newer than the other longhands and is absent
    // from older CSSStyleDeclaration typings/engines. An unsupported
    // property computes to the same effective initial value.
    variantEmoji: computed("font-variant-emoji"),
    hyphens: style.hyphens || style.webkitHyphens || "manual",
    ligatures: computed("font-variant-ligatures"),
    featureSettings: computed("font-feature-settings"),
    numeric: computed("font-variant-numeric"),
    variantPosition: computed("font-variant-position"),
    direction: style.direction === "rtl" ? "rtl" : "ltr",
    key: ""
  };
  spec.key = [spec.style, spec.weight, spec.sizePx, spec.family, spec.letterSpacingPx, spec.wordSpacingPx, spec.stretch, spec.variationSettings, spec.variantAlternates, spec.variantCaps, spec.variantEastAsian, spec.variantEmoji, spec.ligatures, spec.featureSettings, spec.numeric, spec.variantPosition].join("|");
  return spec;
}
function ctxFontOf(spec) {
  const style = spec.style === "normal" ? "" : spec.style + " ";
  const weight = spec.weight === "400" || spec.weight === "normal" ? "" : spec.weight + " ";
  return `${style}${weight}${spec.sizePx}px ${spec.family}`;
}
var sharedCtx = null;
var currentKey = "";
var currentDirection = "ltr";
function getCtx() {
  if (sharedCtx === null) {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(0, 0);
    sharedCtx = canvas.getContext("2d");
    if (sharedCtx === null) throw new Error("justif: no 2d canvas context");
  }
  return sharedCtx;
}
var probeCtx = null;
function probeAdvance(font, text) {
  if (probeCtx === null) {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(0, 0);
    probeCtx = canvas.getContext("2d");
    if (probeCtx === null) throw new Error("justif: no 2d canvas context");
  }
  probeCtx.font = font;
  let width = 0;
  for (let at = 0; at < text.length;) {
    let end = Math.min(text.length, at + 2048);
    const code = text.charCodeAt(end - 1);
    if (code >= 55296 && code <= 56319 && end < text.length) end++;
    width += probeCtx.measureText(text.slice(at, end)).width;
    at = end;
  }
  return width;
}
function setFont(ctx, spec) {
  if (currentKey === spec.key && currentDirection === spec.direction) return;
  if ("direction" in ctx) ctx.direction = spec.direction;
  currentDirection = spec.direction;
  ctx.font = ctxFontOf(spec);
  if ("letterSpacing" in ctx) ctx.letterSpacing = spec.letterSpacingPx + "px";
  if ("wordSpacing" in ctx) ctx.wordSpacing = spec.wordSpacingPx + "px";
  if ("fontVariantCaps" in ctx) {
    ctx.fontVariantCaps = "normal";
  }
  currentKey = spec.key;
}
function applyFontSpec(el, spec) {
  el.style.fontStyle = spec.style;
  el.style.fontWeight = spec.weight;
  el.style.fontSize = spec.sizePx + "px";
  el.style.fontFamily = spec.family;
  el.style.letterSpacing = spec.letterSpacingPx + "px";
  el.style.wordSpacing = spec.wordSpacingPx + "px";
  el.style.direction = spec.direction;
  el.style.fontStretch = spec.stretch;
  el.style.fontVariationSettings = spec.variationSettings;
  el.style.setProperty("font-variant-alternates", spec.variantAlternates);
  el.style.setProperty("font-variant-caps", spec.variantCaps);
  el.style.setProperty("font-variant-east-asian", spec.variantEastAsian);
  el.style.setProperty("font-variant-emoji", spec.variantEmoji);
  el.style.setProperty("font-variant-ligatures", spec.ligatures);
  el.style.setProperty("font-variant-numeric", spec.numeric);
  el.style.setProperty("font-variant-position", spec.variantPosition);
  el.style.setProperty("font-feature-settings", spec.featureSettings);
}
function requiresDomMeasurement(spec) {
  return spec.variantCaps !== "normal" || spec.variantAlternates !== "normal" || spec.variantEastAsian !== "normal" || spec.variantEmoji !== "normal" || spec.ligatures !== "normal" || spec.featureSettings !== "normal" || spec.numeric !== "normal" || spec.variantPosition !== "normal";
}
function supportsSpec(spec) {
  if (spec.stretch !== "100%" && spec.stretch !== "normal") return false;
  if (spec.variationSettings !== "normal") return false;
  return true;
}
var widthCache = /* @__PURE__ */new Map();
var domWidthCache = /* @__PURE__ */new Map();
var pendingDomWidths = /* @__PURE__ */new Map();
var collectingDomWidths = false;
var segmenter;
function graphemeCount(text) {
  if (segmenter === void 0) {
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;
  }
  if (segmenter === null) return Array.from(text).length;
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}
function measureCanvasWidth(text, spec) {
  let perFont = widthCache.get(spec.key);
  if (perFont === void 0) {
    perFont = /* @__PURE__ */new Map();
    widthCache.set(spec.key, perFont);
  }
  const hit = perFont.get(text);
  if (hit !== void 0) return hit;
  const ctx = getCtx();
  setFont(ctx, spec);
  let width = ctx.measureText(text).width;
  if (!("letterSpacing" in ctx)) {
    if (spec.letterSpacingPx !== 0) width += spec.letterSpacingPx * graphemeCount(text);
    if (spec.wordSpacingPx !== 0) {
      let spaces = 0;
      for (const ch of text) if (ch === " " || ch === "\xA0") spaces++;
      width += spec.wordSpacingPx * spaces;
    }
  }
  perFont.set(text, width);
  return width;
}
function cachedDomWidth(text, spec) {
  return domWidthCache.get(spec.key)?.get(text);
}
function queueDomWidth(text, spec) {
  let pending = pendingDomWidths.get(spec.key);
  if (pending === void 0) {
    pending = {
      spec,
      texts: /* @__PURE__ */new Set()
    };
    pendingDomWidths.set(spec.key, pending);
  }
  pending.texts.add(text);
}
function flushDomWidths() {
  if (pendingDomWidths.size === 0) return;
  if (typeof document === "undefined" || document.body === null) {
    pendingDomWidths.clear();
    return;
  }
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;white-space:pre;width:max-content;contain:layout style paint;";
  const probes = [];
  for (const _ref of pendingDomWidths.values()) {
    const spec = _ref.spec;
    const texts = _ref.texts;
    let perFont = domWidthCache.get(spec.key);
    if (perFont === void 0) {
      perFont = /* @__PURE__ */new Map();
      domWidthCache.set(spec.key, perFont);
    }
    for (const text of texts) {
      if (perFont.has(text)) continue;
      if (text.length === 0) {
        perFont.set(text, 0);
        continue;
      }
      const span = document.createElement("span");
      applyFontSpec(span, spec);
      span.style.display = "block";
      span.style.width = "max-content";
      span.style.whiteSpace = "pre";
      span.textContent = text;
      host.append(span);
      probes.push({
        span,
        text,
        spec
      });
    }
  }
  pendingDomWidths.clear();
  document.body.append(host);
  try {
    for (const _ref2 of probes) {
      const span = _ref2.span;
      const text = _ref2.text;
      const spec = _ref2.spec;
      domWidthCache.get(spec.key).set(text, span.getBoundingClientRect().width);
    }
  } finally {
    host.remove();
  }
}
function collectDomMeasurements(work) {
  if (collectingDomWidths) return work();
  collectingDomWidths = true;
  try {
    return work();
  } finally {
    collectingDomWidths = false;
    flushDomWidths();
  }
}
function measureWidth(text, spec) {
  if (!requiresDomMeasurement(spec)) return measureCanvasWidth(text, spec);
  const hit = cachedDomWidth(text, spec);
  if (hit !== void 0) return hit;
  queueDomWidth(text, spec);
  if (collectingDomWidths) return measureCanvasWidth(text, spec);
  flushDomWidths();
  return cachedDomWidth(text, spec) ?? measureCanvasWidth(text, spec);
}
var bearingCache = /* @__PURE__ */new Map();
function measureInkBearings(ch, spec) {
  let perFont = bearingCache.get(spec.key);
  if (perFont === void 0) {
    perFont = /* @__PURE__ */new Map();
    bearingCache.set(spec.key, perFont);
  }
  const hit = perFont.get(ch);
  if (hit !== void 0) return hit;
  const ctx = getCtx();
  setFont(ctx, spec);
  const m = ctx.measureText(ch);
  const bearings = {
    l: Math.max(0, -m.actualBoundingBoxLeft),
    r: Math.max(0, m.width - m.actualBoundingBoxRight)
  };
  perFont.set(ch, bearings);
  return bearings;
}
function isMonospace(spec) {
  return Math.abs(measureWidth("i", spec) - measureWidth("M", spec)) < 0.01;
}
function clearMeasureCache() {
  widthCache.clear();
  domWidthCache.clear();
  pendingDomWidths.clear();
  bearingCache.clear();
  currentKey = "";
}

// src/dom/calibrate.ts
var NO_EXPANSION = {
  ratioAtMax: 1,
  ratioAtMin: 1
};
var CALIBRATION_STRING = "Sphinx of black quartz, judge my vow; 0123456789 flavors of justified text.";
var RESPONSE_EPSILON = 0.05;
var HEBREW_SAMPLE = "\u05D0\u05D1\u05D2\u05D3\u05D4\u05D5\u05D6\u05D7\u05D8\u05D9\u05DB\u05DC\u05DE\u05E0\u05E1\u05E2\u05E4\u05E6\u05E7\u05E8\u05E9\u05EA";
var ARABIC_SAMPLE = "\u0627\u0644\u062D\u0645\u062F\u0644\u0644\u0647\u0631\u0628\u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0646\u0648\u0628\u0647\u0646\u0633\u062A\u0639\u064A\u0646";
var CJK_SAMPLE = "\u6C38\u56FD\u916C\u9DF9\u91B8\u3042\u304B\u3059\u306A\u306E\u306F\u305F\u307E\u30A2\u30AB\u30CA\u30BF\u30DE\uAC00\uB098\uB2E4\uB77C\uB9C8\uBC14\uC0AC";
function calibrationTextFor(runText) {
  let text = "";
  let tag = "";
  if (runText !== void 0) {
    if (/\p{Script=Hebrew}/u.test(runText)) {
      text = HEBREW_SAMPLE;
      tag = "he";
    }
    if (/\p{Script=Arabic}/u.test(runText)) {
      text += ARABIC_SAMPLE;
      tag += "ar";
    }
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(runText)) {
      text += CJK_SAMPLE;
      tag += "cjk";
    }
  }
  return text === "" ? {
    text: CALIBRATION_STRING,
    tag: ""
  } : {
    text,
    tag
  };
}
var cache = /* @__PURE__ */new Map();
function calibrateStretch(spec, maxPct, minPct, samplePcts, runText) {
  if (samplePcts === void 0) {
    samplePcts = [];
  }
  const _calibrationTextFor = calibrationTextFor(runText),
    calibrationText = _calibrationTextFor.text,
    tag = _calibrationTextFor.tag;
  const cacheKey = `${spec.key}|${maxPct}|${minPct}|${samplePcts.join(",")}|${tag}`;
  const hit = cache.get(cacheKey);
  if (hit !== void 0) return hit;
  if (spec.variationSettings.includes('"wdth"') || spec.stretch !== "100%" && spec.stretch !== "normal") {
    cache.set(cacheKey, NO_EXPANSION);
    return NO_EXPANSION;
  }
  if (typeof document === "undefined" || document.body === null) return NO_EXPANSION;
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;white-space:pre;width:max-content;contain:layout style;";
  const span = document.createElement("span");
  applyFontSpec(span, spec);
  span.textContent = calibrationText;
  host.append(span);
  document.body.append(host);
  const widthAt = stretch => {
    span.style.fontStretch = stretch;
    return span.getBoundingClientRect().width;
  };
  let result;
  try {
    const base = widthAt("100%");
    const wide = widthAt(maxPct + "%");
    const narrow = widthAt(minPct + "%");
    const ratioAtMax = base > 0 && Math.abs(wide - base) > RESPONSE_EPSILON ? wide / base : 1;
    const ratioAtMin = base > 0 && Math.abs(narrow - base) > RESPONSE_EPSILON ? narrow / base : 1;
    let ratios;
    if (base > 0 && (ratioAtMax !== 1 || ratioAtMin !== 1) && samplePcts.length > 0) {
      ratios = /* @__PURE__ */new Map();
      for (const pct of samplePcts) {
        if (pct > 100 && ratioAtMax === 1) ratios.set(pct, 1);else if (pct < 100 && ratioAtMin === 1) ratios.set(pct, 1);else ratios.set(pct, widthAt(pct + "%") / base);
      }
    }
    result = {
      ratioAtMax,
      ratioAtMin,
      ratios
    };
  } finally {
    host.remove();
  }
  cache.set(cacheKey, result);
  return result;
}
function clearCalibrationCache() {
  cache.clear();
}

// src/dom/observe.ts
function createWidthObserver(onWidths) {
  const pending = /* @__PURE__ */new Map();
  let frame = 0;
  const flush = () => {
    frame = 0;
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    onWidths(batch);
  };
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const size = entry.contentBoxSize?.[0];
      const width = size !== void 0 ? size.inlineSize : entry.contentRect.width;
      pending.set(entry.target, width);
    }
    if (frame === 0) frame = requestAnimationFrame(flush);
  });
  return {
    observe: el => observer.observe(el, {
      box: "content-box"
    }),
    unobserve: el => {
      observer.unobserve(el);
      pending.delete(el);
    },
    disconnect: () => {
      observer.disconnect();
      pending.clear();
      if (frame !== 0) cancelAnimationFrame(frame);
    }
  };
}

// src/dom/geometry.ts
var FRAGMENT_WIDTH_TOLERANCE_PX = 0.5;
function fragmentBoxesOf(el, style) {
  const view = el.ownerDocument.defaultView;
  if (view === null) return {
    ok: false,
    reason: "zero content width"
  };
  const cs = style ?? view.getComputedStyle(el);
  const rects = [...el.getClientRects()].filter(rect => rect.width > 0);
  if (rects.length === 0) return {
    ok: false,
    reason: "zero content width"
  };
  const borderBoxWidth = rects[0].width;
  if (rects.some(rect => Math.abs(rect.width - borderBoxWidth) > FRAGMENT_WIDTH_TOLERANCE_PX)) {
    return {
      ok: false,
      reason: "fragment boxes have unequal widths"
    };
  }
  const contentWidth = borderBoxWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
  return contentWidth > 0 ? {
    ok: true,
    rects,
    contentWidth
  } : {
    ok: false,
    reason: "zero content width"
  };
}

// src/dom/read.ts
var REJECT_TAGS = /* @__PURE__ */new Set(["WBR", "IMG", "PICTURE", "VIDEO", "AUDIO", "CANVAS", "IFRAME", "OBJECT", "EMBED", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "MATH", "TABLE", "HR", "SVG"]);
var UNSUPPORTED_SCRIPTS = /[\u0E00-\u0EFF]/;
var BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
var STRONG_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
var NON_RTL_LETTER = /(?![\p{Script=Hebrew}\p{Script=Arabic}])\p{L}/u;
var RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;
function textSupported(text, direction) {
  if (BIDI_CONTROLS.test(text)) return false;
  if (UNSUPPORTED_SCRIPTS.test(text)) return false;
  if (direction === "rtl") {
    if (NON_RTL_LETTER.test(text)) return false;
    if (!RTL_LETTER.test(text)) return false;
  } else if (STRONG_RTL.test(text)) {
    return false;
  }
  return true;
}
var MARGIN_PROPS = ["marginLeft", "marginRight"];
function transparentColor(color) {
  const value = color.trim().toLowerCase();
  if (value === "transparent") return true;
  if (/^rgba\([^)]*,\s*0(?:\.0*)?%?\s*\)$/.test(value)) return true;
  return /\/\s*0(?:\.0*)?%?\s*\)$/.test(value);
}
function splitCss(value, commas) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;else if (ch === ")") depth = Math.max(0, depth - 1);else if (depth === 0 && (commas ? ch === "," : /\s/.test(ch))) {
      const token = value.slice(start, i).trim();
      if (token.length > 0) out.push(token);
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail.length > 0) out.push(tail);
  return out;
}
function shadowPaintedEdges(value, direction) {
  let left = false;
  let right = false;
  if (value === "none") return {
    start: false,
    end: false
  };
  for (const shadow of splitCss(value, true)) {
    const tokens = splitCss(shadow, false);
    if (tokens.some(token => token.toLowerCase() === "inset")) continue;
    const color = tokens.find(token => token === "transparent" || /^[a-z-]+\(/i.test(token));
    if (color !== void 0 && transparentColor(color)) continue;
    const lengths = tokens.filter(token => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?$/i.test(token)).map(token => parseFloat(token));
    if (lengths.length < 2) continue;
    const offsetX = lengths[0];
    const blur = Math.max(0, lengths[2] ?? 0);
    const spread = lengths[3] ?? 0;
    const reach = blur + spread;
    if (offsetX - reach < 0) left = true;
    if (offsetX + reach > 0) right = true;
  }
  return direction === "rtl" ? {
    start: right,
    end: left
  } : {
    start: left,
    end: right
  };
}
function paintedInlineEdges(style, direction) {
  const clips = style.backgroundClip.split(",").map(clip => clip.trim());
  const clippedToText = clips.length > 0 && clips.every(clip => clip === "text");
  const background = !clippedToText && (style.backgroundImage !== "none" || !transparentColor(style.backgroundColor));
  if (background) return {
    start: true,
    end: true
  };
  return shadowPaintedEdges(style.boxShadow, direction);
}
function firstLetterRange(text) {
  const punctuation = /^[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}]$/u;
  const clusters = graphemes(text);
  let offset = 0;
  let i = 0;
  while (i < clusters.length && /^\s+$/u.test(clusters[i])) {
    offset += clusters[i].length;
    i++;
  }
  if (i === clusters.length) return null;
  const start = offset;
  while (i < clusters.length && punctuation.test(clusters[i])) {
    offset += clusters[i].length;
    i++;
  }
  if (i === clusters.length || /^\s+$/u.test(clusters[i])) return null;
  offset += clusters[i].length;
  i++;
  while (i < clusters.length && punctuation.test(clusters[i])) {
    offset += clusters[i].length;
    i++;
  }
  return {
    start,
    end: offset
  };
}
function textPointAt(nodes, target) {
  let offset = 0;
  for (const node of nodes) {
    const end = offset + node.data.length;
    if (target <= end) return {
      node,
      offset: target - offset
    };
    offset = end;
  }
  const last = nodes[nodes.length - 1];
  return last === void 0 ? null : {
    node: last,
    offset: last.data.length
  };
}
function pxValue(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
var FIRST_LETTER_PROPERTIES = ["float", "box-sizing", "width", "height", "min-width", "max-width", "min-height", "max-height", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style", "border-left-style", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "font-family", "font-size", "font-style", "font-weight", "font-stretch", "font-kerning", "font-optical-sizing", "font-feature-settings", "font-variation-settings", "font-variant-caps", "font-variant-east-asian", "font-variant-ligatures", "font-variant-numeric", "font-variant-position", "font-synthesis", "line-height", "letter-spacing", "word-spacing", "color", "background-color", "background-image", "background-position", "background-size", "background-repeat", "background-origin", "background-clip", "text-decoration-line", "text-decoration-color", "text-decoration-style", "text-decoration-thickness", "text-shadow", "text-transform", "vertical-align", "direction", "writing-mode", "-webkit-text-fill-color", "-webkit-text-stroke-color", "-webkit-text-stroke-width"];
var FIRST_LETTER_INNER_PROPERTIES = ["font-family", "font-size", "font-style", "font-weight", "font-stretch", "font-kerning", "font-optical-sizing", "font-feature-settings", "font-variation-settings", "font-variant-caps", "font-variant-east-asian", "font-variant-ligatures", "font-variant-numeric", "font-variant-position", "font-synthesis", "line-height", "letter-spacing", "word-spacing", "color", "text-decoration-line", "text-decoration-color", "text-decoration-style", "text-decoration-thickness", "text-shadow", "text-transform", "vertical-align", "-webkit-text-fill-color", "-webkit-text-stroke-color", "-webkit-text-stroke-width"];
function firstLetterStyle(style) {
  return FIRST_LETTER_PROPERTIES.map(property => [property, style.getPropertyValue(property)]).filter(entry => entry[1] !== "");
}
function firstLetterInnerStyle(style, paragraph) {
  return FIRST_LETTER_INNER_PROPERTIES.map(property => [property, style.getPropertyValue(property)]).filter(_ref3 => {
    let property = _ref3[0],
      value = _ref3[1];
    return value !== "" && value !== paragraph.getPropertyValue(property);
  });
}
function physicalFloatSide(value, direction) {
  if (value === "left" || value === "right") return value;
  if (value === "inline-start") return direction === "rtl" ? "right" : "left";
  if (value === "inline-end") return direction === "rtl" ? "left" : "right";
  return null;
}
var FIRST_LETTER_METRIC_PROPERTIES = ["font-family", "font-size", "font-style", "font-weight", "font-stretch", "font-kerning", "font-optical-sizing", "font-feature-settings", "font-variation-settings", "font-variant-alternates", "font-variant-caps", "font-variant-east-asian", "font-variant-emoji", "font-variant-ligatures", "font-variant-numeric", "font-variant-position", "font-synthesis", "line-height", "letter-spacing", "word-spacing", "text-transform", "vertical-align"];
var FIRST_LETTER_INLINE_BOX_PROPERTIES = ["margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width"];
function nonFloatedFirstLetterChangesLayout(p, paragraphStyle, style, text) {
  const differsFromParagraph = FIRST_LETTER_METRIC_PROPERTIES.some(property => style.getPropertyValue(property) !== paragraphStyle.getPropertyValue(property));
  const hasBox = FIRST_LETTER_INLINE_BOX_PROPERTIES.some(property => Math.abs(parseFloat(style.getPropertyValue(property)) || 0) > 1e-6);
  if (!differsFromParagraph && !hasBox) return false;
  const span = firstLetterRange(text);
  if (span === null) return false;
  const nodes = [];
  const walker = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    nodes.push(node);
  }
  const point = textPointAt(nodes, span.start);
  const source = point?.node.parentElement ?? p;
  const sourceStyle = p.ownerDocument.defaultView?.getComputedStyle(source);
  if (sourceStyle === void 0) return false;
  return hasBox || FIRST_LETTER_METRIC_PROPERTIES.some(property => style.getPropertyValue(property) !== sourceStyle.getPropertyValue(property));
}
function visualLines(rects, lineHeight) {
  const lines = [];
  const threshold = Math.max(2, lineHeight * 0.45);
  for (const rect of [...rects].sort((a, b) => a.top - b.top || a.left - b.left)) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const line = lines.find(candidate => Math.abs(candidate.top - rect.top) < threshold);
    if (line === void 0) lines.push({
      top: rect.top,
      left: rect.left,
      right: rect.right
    });else {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
    }
  }
  lines.sort((a, b) => a.top - b.top);
  return lines;
}
function floatedFirstLetter(p, paragraphStyle, style, floatSide, text, span) {
  const nodes = [];
  const walker = p.ownerDocument.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    nodes.push(node);
  }
  const start = textPointAt(nodes, span.start);
  const end = textPointAt(nodes, span.end);
  if (start === null || end === null) return null;
  const range = p.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const glyphRect = range.getBoundingClientRect();
  const specifiedWidth = parseFloat(style.width);
  const pseudoLineHeight = parseFloat(style.lineHeight) || pxValue(style.fontSize) * 1.2;
  const rangeRepresentsPseudo = glyphRect.width > 0 && glyphRect.height >= pseudoLineHeight * 0.5;
  const glyphWidth = rangeRepresentsPseudo ? glyphRect.width : measureWidth(text.slice(span.start, span.end), fontSpecOf(style));
  const contentWidth = Number.isFinite(specifiedWidth) ? specifiedWidth : glyphWidth;
  const inlineExtras = pxValue(style.paddingLeft) + pxValue(style.paddingRight) + pxValue(style.borderLeftWidth) + pxValue(style.borderRightWidth);
  const borderBoxWidth = style.boxSizing === "border-box" && Number.isFinite(specifiedWidth) ? contentWidth : contentWidth + inlineExtras;
  const inlineSize = Math.max(0, borderBoxWidth + pxValue(style.marginLeft) + pxValue(style.marginRight));
  if (inlineSize <= 0) return null;
  const paragraphRect = p.getBoundingClientRect();
  const contentLeft = paragraphRect.left + pxValue(paragraphStyle.borderLeftWidth) + pxValue(paragraphStyle.paddingLeft);
  const contentRight = paragraphRect.right - pxValue(paragraphStyle.borderRightWidth) - pxValue(paragraphStyle.paddingRight);
  const contentTop = paragraphRect.top + pxValue(paragraphStyle.borderTopWidth) + pxValue(paragraphStyle.paddingTop);
  const paragraphLineHeight = parseFloat(paragraphStyle.lineHeight) || pxValue(paragraphStyle.fontSize) * 1.2;
  const tail = p.ownerDocument.createRange();
  tail.setStart(end.node, end.offset);
  const last = nodes[nodes.length - 1];
  tail.setEnd(last, last.data.length);
  const lines = visualLines([...tail.getClientRects()], paragraphLineHeight);
  let affected = 0;
  for (const line of lines) {
    const observed = floatSide === "left" ? line.left - contentLeft : contentRight - line.right;
    if (observed > inlineSize * 0.5) affected++;else break;
  }
  const specifiedHeight = parseFloat(style.height);
  const compactAutoBox = !Number.isFinite(specifiedHeight) && glyphRect.height > 0 && glyphRect.height <= pseudoLineHeight * 1.2;
  const contentHeight = Number.isFinite(specifiedHeight) ? specifiedHeight : compactAutoBox ? glyphRect.height : pseudoLineHeight;
  const blockExtras = pxValue(style.paddingTop) + pxValue(style.paddingBottom) + pxValue(style.borderTopWidth) + pxValue(style.borderBottomWidth);
  const borderBoxHeight = style.boxSizing === "border-box" && Number.isFinite(specifiedHeight) ? contentHeight : contentHeight + blockExtras;
  const floatBottom = compactAutoBox ? glyphRect.bottom + pxValue(style.paddingBottom) + pxValue(style.borderBottomWidth) + pxValue(style.marginBottom) : contentTop + pxValue(style.marginTop) + borderBoxHeight + pxValue(style.marginBottom);
  const firstTextTop = lines[0]?.top ?? contentTop;
  const geometricLines = Math.max(1, Math.ceil((floatBottom - firstTextTop) / paragraphLineHeight - 1e-6));
  affected = Math.max(affected, geometricLines);
  return {
    inlineSize,
    lines: affected,
    style: firstLetterStyle(style)
  };
}
function floatDetailsOf(p, text, paragraphStyle, fragmentCount) {
  const view = p.ownerDocument.defaultView;
  if (view === null) return null;
  let style;
  try {
    style = view.getComputedStyle(p, "::first-letter");
  } catch {
    return "could not inspect ::first-letter style";
  }
  if (style.float === "none") {
    return nonFloatedFirstLetterChangesLayout(p, paragraphStyle ?? view.getComputedStyle(p), style, text) ? "layout-changing non-floated ::first-letter" : null;
  }
  const cs = paragraphStyle ?? view.getComputedStyle(p);
  let liveFragmentCount = fragmentCount;
  if (liveFragmentCount === void 0) {
    const fragments = fragmentBoxesOf(p, cs);
    if (!fragments.ok) return fragments.reason;
    liveFragmentCount = fragments.rects.length;
  }
  if (liveFragmentCount > 1) {
    return "fragmented paragraph with floated ::first-letter";
  }
  const direction = cs.direction === "rtl" ? "rtl" : "ltr";
  const floatSide = physicalFloatSide(style.float, direction);
  if (floatSide === null) return `unsupported ::first-letter float: ${style.float}`;
  const span = firstLetterRange(text);
  if (span === null) return "could not locate floated ::first-letter text";
  const intrusion = floatedFirstLetter(p, cs, style, floatSide, text, span);
  return intrusion === null ? "could not measure floated ::first-letter" : {
    intrusion,
    span
  };
}
function floatIntrusionOf(p, text) {
  if (text === void 0) {
    text = p.textContent ?? "";
  }
  const details = floatDetailsOf(p, text);
  return typeof details === "object" && details !== null ? details.intrusion : null;
}
function floatInlineSizeOf(p) {
  const rendered = p.querySelector(":scope .justif-float-source");
  if (rendered !== null) {
    const rect = rendered.getBoundingClientRect();
    const style = rendered.ownerDocument.defaultView?.getComputedStyle(rendered);
    if (style === void 0) return rect.width > 0 ? rect.width : null;
    const size = rect.width + pxValue(style.marginLeft) + pxValue(style.marginRight);
    return size > 0 ? size : null;
  }
  return floatIntrusionOf(p)?.inlineSize ?? null;
}
function readParagraph(p) {
  const view = p.ownerDocument.defaultView;
  if (view === null) return "detached from its document";
  const cs = view.getComputedStyle(p);
  if (cs.display === "none") return "display: none";
  if (cs.whiteSpace !== "normal") return `white-space: ${cs.whiteSpace} on the paragraph`;
  if (cs.textTransform !== "none") return `text-transform: ${cs.textTransform}`;
  if (cs.writingMode !== "horizontal-tb") return `writing-mode: ${cs.writingMode}`;
  const direction = cs.direction === "rtl" ? "rtl" : "ltr";
  if (p.isContentEditable) return "content-editable";
  if (p.shadowRoot !== null) return "element hosts a shadow root";
  const specs = [];
  const keyToIndex = /* @__PURE__ */new Map();
  const indexSpec = style => {
    const spec = fontSpecOf(style);
    const existing = keyToIndex.get(spec.key);
    if (existing !== void 0) return existing;
    specs.push(spec);
    keyToIndex.set(spec.key, specs.length - 1);
    return specs.length - 1;
  };
  const baseSpec = indexSpec(cs);
  const runs = [];
  const hardBreaks = [];
  let skip = null;
  let nextAtomicKey = 0;
  const walk = (node, chain, spec, atomicKey, floatInnerStyle) => {
    let adjacentTextRun = null;
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (skip !== null) return;
      if (child.nodeType === 3) {
        const text2 = child.nodeValue ?? "";
        if (text2.length > 0) {
          if (adjacentTextRun === null) {
            adjacentTextRun = {
              text: text2,
              spec,
              ancestors: chain,
              atomicKey,
              floatInnerStyle: floatInnerStyle.length > 0 ? floatInnerStyle : void 0
            };
            runs.push(adjacentTextRun);
          } else {
            adjacentTextRun.text += text2;
          }
        }
      } else if (child.nodeType === 1) {
        adjacentTextRun = null;
        const el = child;
        const tag = el.tagName.toUpperCase();
        if (tag === "BR") {
          const elStyle2 = view.getComputedStyle(el);
          if (elStyle2.display === "none") continue;
          if (elStyle2.clear !== "none") {
            skip = `<br> with clear: ${elStyle2.clear}`;
            return;
          }
          if (elStyle2.display !== "inline" || elStyle2.float !== "none" || elStyle2.position !== "static" && elStyle2.position !== "relative") {
            skip = "non-inline-flow <br> (display/float/position)";
            return;
          }
          hardBreaks.push({
            source: el,
            ancestors: chain,
            afterRun: runs.length
          });
          continue;
        }
        if (REJECT_TAGS.has(tag)) {
          skip = `<${el.tagName.toLowerCase()}> content`;
          return;
        }
        const elStyle = view.getComputedStyle(el);
        if (elStyle.display !== "inline" || elStyle.float !== "none" || elStyle.position !== "static" && elStyle.position !== "relative") {
          skip = `non-inline-flow <${el.tagName.toLowerCase()}> (display/float/position)`;
          return;
        }
        if (MARGIN_PROPS.some(prop => (parseFloat(elStyle[prop]) || 0) !== 0)) {
          skip = `inline <${el.tagName.toLowerCase()}> has a horizontal margin`;
          return;
        }
        const padStart = (parseFloat(direction === "rtl" ? elStyle.paddingRight : elStyle.paddingLeft) || 0) + (parseFloat(direction === "rtl" ? elStyle.borderRightWidth : elStyle.borderLeftWidth) || 0);
        const padEnd = (parseFloat(direction === "rtl" ? elStyle.paddingLeft : elStyle.paddingRight) || 0) + (parseFloat(direction === "rtl" ? elStyle.borderLeftWidth : elStyle.borderRightWidth) || 0);
        const padded = padStart > 0 || padEnd > 0;
        const decorationBreak = elStyle.getPropertyValue("box-decoration-break") || elStyle.getPropertyValue("-webkit-box-decoration-break");
        if (padded && decorationBreak === "clone") {
          skip = `box-decoration-break: clone on padded <${el.tagName.toLowerCase()}>`;
          return;
        }
        if (elStyle.textTransform !== "none") {
          skip = `text-transform: ${elStyle.textTransform} on <${el.tagName.toLowerCase()}>`;
          return;
        }
        if (elStyle.direction !== cs.direction || elStyle.unicodeBidi !== "normal" && elStyle.unicodeBidi !== "isolate") {
          skip = `direction/unicode-bidi override on <${el.tagName.toLowerCase()}>`;
          return;
        }
        let childKey = atomicKey;
        if (elStyle.whiteSpace === "nowrap") {
          childKey = atomicKey ?? nextAtomicKey++;
        } else if (elStyle.whiteSpace !== "normal") {
          skip = `white-space: ${elStyle.whiteSpace} on <${el.tagName.toLowerCase()}>`;
          return;
        }
        const before = runs.length;
        const paintedHere = paintedInlineEdges(elStyle, direction);
        walk(el, [...chain, el], indexSpec(elStyle), childKey, firstLetterInnerStyle(elStyle, cs));
        if (skip !== null) return;
        const inspectEdges = padded || paintedHere.start || paintedHere.end;
        const inside = inspectEdges ? runs.slice(before) : [];
        let firstBoxAt = -1;
        let lastBoxAt = -1;
        for (let i = 0; i < inside.length; i++) {
          if (!textMakesBox(inside[i].text)) continue;
          if (firstBoxAt < 0) firstBoxAt = i;
          lastBoxAt = i;
        }
        if (padded) {
          if (firstBoxAt < 0) {
            skip = `padded <${el.tagName.toLowerCase()}> with no text content`;
            return;
          }
          const first = runs[before];
          const last = runs[runs.length - 1];
          first.padStartPx = (first.padStartPx ?? 0) + padStart;
          last.padEndPx = (last.padEndPx ?? 0) + padEnd;
          last.padEndOwner = el;
        }
        if ((paintedHere.start || paintedHere.end) && firstBoxAt >= 0) {
          if (paintedHere.start) {
            let startInset = 0;
            for (let i = 0; i <= firstBoxAt; i++) {
              startInset += inside[i].padStartPx ?? 0;
            }
            const firstBoxRun = inside[firstBoxAt];
            firstBoxRun.boxStartProtrusionPx = startInset;
            firstBoxRun.boxStartProtrusionOwner = el;
          }
          if (paintedHere.end) {
            let endInset = 0;
            for (let i = lastBoxAt; i < inside.length; i++) {
              endInset += inside[i].padEndPx ?? 0;
            }
            inside[inside.length - 1].boxEndProtrusionPx = endInset;
            inside[lastBoxAt].boxEndProtrusionOwner = el;
          }
        }
      }
    }
  };
  walk(p, [], baseSpec, void 0, []);
  if (skip !== null) return skip;
  if (runs.length === 0 && hardBreaks.length === 0) return "no text content";
  const text = runs.map(r => r.text).join("");
  if (text.length > 0 && !textSupported(text, direction)) {
    return "unsupported text (bidi controls, mixed direction, or a script without break support)";
  }
  const fragments = fragmentBoxesOf(p, cs);
  if (!fragments.ok) return fragments.reason;
  const floatDetails = floatDetailsOf(p, text, cs, fragments.rects.length);
  if (typeof floatDetails === "string") return floatDetails;
  const floatIntrusion = floatDetails?.intrusion ?? null;
  if (floatDetails !== null) {
    const firstSpan = floatDetails.span;
    let offset = 0;
    for (const run of runs) {
      const runEnd = offset + run.text.length;
      const start = Math.max(firstSpan.start, offset);
      const end = Math.min(firstSpan.end, runEnd);
      if (start < end) {
        run.flowExclusion = {
          start: start - offset,
          end: end - offset
        };
      }
      offset = runEnd;
    }
  }
  const contentWidth = fragments.contentWidth;
  let textIndent = parseFloat(cs.textIndent) || 0;
  const textIndentPct = cs.textIndent.endsWith("%") ? textIndent / 100 : null;
  if (textIndentPct !== null) textIndent = textIndentPct * contentWidth;
  const lineHeightPx = parseFloat(cs.lineHeight);
  const styles = cs;
  const cis = styles.containIntrinsicBlockSize ?? styles.containIntrinsicHeight ?? "";
  const pinIntrinsicSize = (styles.contentVisibility ?? "") === "auto" || cis !== "" && cis !== "none";
  return {
    runs,
    hardBreaks,
    specs,
    baseSpec,
    contentWidth,
    textIndent,
    textIndentPct,
    lineHeightPx: Number.isFinite(lineHeightPx) ? lineHeightPx : null,
    pinIntrinsicSize,
    justifyAll: cs.textAlign === "justify-all" || cs.textAlignLast === "justify",
    direction,
    floatIntrusion
  };
}
function contentWidthOf(p) {
  const view = p.ownerDocument.defaultView;
  if (view === null) return "zero content width";
  const cs = view.getComputedStyle(p);
  const fragments = fragmentBoxesOf(p, cs);
  return fragments.ok ? fragments.contentWidth : fragments.reason;
}

// src/dom/whitespace.ts
function leadingCollapsibleSpaces(text) {
  let count = 0;
  while (count < text.length && text.charCodeAt(count) === 32) count++;
  return count;
}
function trailingCollapsibleSpaces(text) {
  let count = 0;
  while (count < text.length && text.charCodeAt(text.length - count - 1) === 32) count++;
  return count;
}
function endWithoutCollapsibleSpaces(text) {
  return text.length - trailingCollapsibleSpaces(text);
}

// src/dom/write.ts
var WRAP_SAFETY_PAD_PX = 1.5;
var CORRECTION_WINDOW_PX = -3;
var FLOAT_WRAP_SPARE_PX = 0.25;
var STYLE_ID = "justif-style";
var px = v => `${Math.round(v * 1e3) / 1e3}px`;
var SHEET_TEXT =
// Emergency-break licences are neutralized on the paragraph too, but
// Firefox resolves them from the element AT the break point, so the
// paragraph reset alone leaves it breaking whenever an author rule grants
// one closer in — `!important`, or a nested inline the segments are cloned
// into (`a{overflow-wrap:break-word}`). This rule is what covers Firefox
// in those cases; Chromium consults the block container and ignores it.
'.justif-seg,.justif-hyphen,.justif-break{overflow-wrap:normal;word-break:normal;line-break:auto}.justif-seg{white-space:nowrap}[data-justif-dropcap]::first-letter{all:unset!important}.justif-hyphen{white-space:nowrap}.justif-hyphen::after{content:"-"}.justif-break::after{content:"\u200B"}@supports (content:"-" / ""){.justif-hyphen::after{content:"-" / ""}.justif-break::after{content:"\u200B" / ""}}';
function disableTextAutosizing(el) {
  el.style.setProperty("-webkit-text-size-adjust", "100%", "important");
  el.style.setProperty("text-size-adjust", "100%", "important");
}
var styledRoots = /* @__PURE__ */new WeakSet();
function ensureStylesheet(root) {
  if (styledRoots.has(root)) return;
  const isDoc = root.nodeType === 9;
  const doc = isDoc ? root : root.ownerDocument;
  const win = doc.defaultView;
  if (win !== null && "adoptedStyleSheets" in root) {
    try {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(SHEET_TEXT);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      styledRoots.add(root);
      return;
    } catch {}
  }
  if (isDoc && doc.getElementById(STYLE_ID) !== null) {
    styledRoots.add(root);
    return;
  }
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SHEET_TEXT;
  (isDoc ? doc.head : root).append(style);
  styledRoots.add(root);
}
function writeParagraph(p, contents, lineWidths, physicalFitLines) {
  if (physicalFitLines === void 0) {
    physicalFitLines = 0;
  }
  const doc = p.ownerDocument;
  const root = p.getRootNode();
  ensureStylesheet(root.nodeType === 9 || root.nodeType === 11 && "host" in root ? root : doc);
  const lineElements = [[]];
  const fragment = doc.createDocumentFragment();
  const stack = [];
  const containerAt = depth => depth === 0 ? fragment : stack[depth - 1].clone;
  const commonDepth = chain => {
    let i = 0;
    while (i < stack.length && i < chain.length && stack[i].src === chain[i]) i++;
    return i;
  };
  const containerFor = chain => {
    let depth = commonDepth(chain);
    stack.length = depth;
    for (; depth < chain.length; depth++) {
      const src = chain[depth];
      const clone = src.cloneNode(false);
      containerAt(depth).append(clone);
      stack.push({
        src,
        clone
      });
    }
    return containerAt(chain.length);
  };
  const cloneFor = (src, chain) => {
    if (src === void 0) return void 0;
    const depth = chain.indexOf(src);
    return depth < 0 ? void 0 : stack[depth]?.clone;
  };
  let prevContainer = fragment;
  let floatSource = null;
  const segments = contents.filter(content => !("kind" in content));
  const floatBaseStyle = new Map(segments.find(segment => segment.floatedStyle !== void 0)?.floatedStyle ?? []);
  const floatInnerProperties = new Set(segments.flatMap(segment => (segment.floatedInnerStyle ?? []).map(_ref4 => {
    let property = _ref4[0];
    return property;
  })));
  let lastWasHardBreak = false;
  for (const content of contents) {
    if ("kind" in content) {
      const container2 = containerFor(content.ancestors);
      container2.append(content.source.cloneNode(false));
      prevContainer = container2;
      lineElements.push([]);
      lastWasHardBreak = true;
      continue;
    }
    const segment = content;
    lastWasHardBreak = false;
    if (segment.joint === "hyphen") {
      const hyphen = doc.createElement("span");
      hyphen.className = "justif-hyphen";
      disableTextAutosizing(hyphen);
      const entries = lineElements[lineElements.length - 1];
      const prevEntry = entries[entries.length - 1];
      if (prevEntry !== void 0 && prevEntry.marginEndEl.style.marginInlineEnd !== "") {
        hyphen.style.marginInlineEnd = prevEntry.marginEndEl.style.marginInlineEnd;
        prevEntry.marginEndEl.style.marginInlineEnd = "";
      }
      if (prevEntry?.seg?.hyphenLetterSpacingPx !== void 0) {
        hyphen.style.letterSpacing = px(prevEntry.seg.hyphenLetterSpacingPx);
      }
      prevContainer.append(hyphen);
      entries.push({
        el: hyphen,
        seg: null,
        marginEndEl: hyphen
      });
    }
    if (segment.joint !== "none") {
      lineElements.push([]);
      const depth = Math.min(commonDepth(segment.ancestors), stack.length);
      stack.length = depth;
      const container2 = containerAt(depth);
      if (segment.joint === "space") container2.append(doc.createTextNode(" "));else {
        const brk = doc.createElement("span");
        brk.className = "justif-break";
        container2.append(brk);
      }
    }
    const container = containerFor(segment.ancestors);
    if (segment.floatedPrefix !== void 0) {
      if (floatSource === null) {
        floatSource = doc.createElement("span");
        floatSource.className = "justif-float-source";
        disableTextAutosizing(floatSource);
        for (const _ref5 of segment.floatedStyle ?? []) {
          const property = _ref5[0];
          const value = _ref5[1];
          floatSource.style.setProperty(property, value);
        }
        container.append(floatSource);
      }
      if (floatInnerProperties.size === 0) {
        floatSource.append(doc.createTextNode(segment.floatedPrefix));
      } else {
        const innerStyle = new Map(segment.floatedInnerStyle ?? []);
        const fragment2 = doc.createElement("span");
        fragment2.className = "justif-float-fragment";
        for (const property of floatInnerProperties) {
          const value = innerStyle.get(property) ?? floatBaseStyle.get(property);
          if (value !== void 0) fragment2.style.setProperty(property, value);
        }
        fragment2.append(doc.createTextNode(segment.floatedPrefix));
        floatSource.append(fragment2);
      }
    }
    if (segment.text.length === 0) {
      prevContainer = container;
      continue;
    }
    const el = doc.createElement("span");
    el.className = "justif-seg";
    disableTextAutosizing(el);
    el.style.wordSpacing = px(segment.wordSpacingPx);
    if (segment.letterSpacingPx !== null) {
      el.style.letterSpacing = px(segment.letterSpacingPx);
      if (segment.fontFeatureSettings !== void 0) {
        el.style.fontFeatureSettings = segment.fontFeatureSettings;
      }
    }
    if (segment.isolateShaping === true) el.style.unicodeBidi = "isolate";
    if (segment.fontStretchPct !== 100) {
      el.style.fontStretch = `${Math.round(segment.fontStretchPct * 100) / 100}%`;
    }
    const marginStartEl = cloneFor(segment.marginStartOwner, segment.ancestors) ?? el;
    const marginEndEl = cloneFor(segment.marginEndOwner, segment.ancestors) ?? el;
    const paintEndEl = cloneFor(segment.decorEndOwner, segment.ancestors);
    if (segment.marginStartPx !== 0) {
      marginStartEl.style.marginInlineStart = px(segment.marginStartPx);
    }
    if (segment.marginEndPx !== 0) marginEndEl.style.marginInlineEnd = px(segment.marginEndPx);
    if (segment.cjk === true) {
      el.style.fontKerning = "none";
      el.style.setProperty("text-spacing-trim", "space-all");
    }
    if (segment.physicalEndHangPx !== void 0 && segment.physicalEndHangPx > 0) {
      const clusters = graphemes(segment.text);
      let end = clusters.length - 1;
      while (end >= 0 && /^\s+$/u.test(clusters[end])) end--;
      const hanging = clusters[end];
      if (hanging === void 0) el.textContent = segment.text;else {
        const before = clusters.slice(0, end).join("");
        const after = clusters.slice(end + 1).join("");
        el.append(before);
        const span = doc.createElement("span");
        span.className = "justif-hanging-end";
        span.style.letterSpacing = px(segment.resolvedLetterSpacingPx - segment.physicalEndHangPx);
        span.textContent = hanging;
        el.append(span, after);
      }
    } else el.textContent = segment.text;
    container.append(el);
    prevContainer = container;
    lineElements[lineElements.length - 1].push({
      el,
      seg: segment,
      marginEndEl,
      paintEndEl
    });
  }
  if (lastWasHardBreak) lineElements.pop();
  p.replaceChildren(fragment);
  return {
    doc,
    paragraph: p,
    lineElements,
    lineWidths,
    physicalFitLines
  };
}
function fragmentForLine(rects, lineRect, rtl) {
  const x = rtl ? lineRect.right : lineRect.left;
  const y = lineRect.top + lineRect.height / 2;
  let best = rects[0];
  let bestDistance = Infinity;
  for (const rect of rects) {
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = rect;
      bestDistance = distance;
    }
  }
  return best;
}
function measureCorrections(pending) {
  const corrections = [];
  const hidden = [];
  const invalid = [];
  let range = null;
  for (let i = 0; i < pending.length; i++) {
    const _pending$i = pending[i],
      doc = _pending$i.doc,
      paragraph = _pending$i.paragraph,
      lineElements = _pending$i.lineElements,
      lineWidths = _pending$i.lineWidths,
      physicalFitLines = _pending$i.physicalFitLines;
    const firstEntry = lineElements.find(l => l.length > 0)?.[0];
    if (firstEntry === void 0 || !firstEntry.el.isConnected) continue;
    range ?? (range = doc.createRange());
    const paragraphStyle = doc.defaultView?.getComputedStyle(paragraph);
    const rtl = paragraphStyle?.direction === "rtl";
    const fragments = fragmentBoxesOf(paragraph, paragraphStyle);
    if (!fragments.ok) {
      if (fragments.reason === "zero content width") hidden.push(i);else invalid.push({
        index: i,
        reason: fragments.reason
      });
      continue;
    }
    let sawInk = false;
    const paraCorrections = [];
    for (let li = 0; li < lineElements.length; li++) {
      const entries = lineElements[li];
      if (entries.length === 0) continue;
      const mutated = entries.some(_ref6 => {
        let el = _ref6.el,
          seg = _ref6.seg;
        if (seg === null) return false;
        const singleText = el.childNodes.length === 1 && el.firstChild?.nodeType === 3 && el.firstChild.data === seg.text;
        if (!(seg.physicalEndHangPx !== void 0 && seg.physicalEndHangPx > 0)) {
          return !singleText;
        }
        const mid = el.childNodes[1];
        const hangShape = el.childNodes.length === 3 && el.firstChild?.nodeType === 3 && mid?.nodeType === 1 && mid.className === "justif-hanging-end" && el.lastChild?.nodeType === 3 && el.textContent === seg.text;
        return !(singleText || hangShape);
      });
      if (mutated) {
        if (!sawInk) {
          sawInk = entries.some(_ref7 => {
            let el = _ref7.el;
            return el.getBoundingClientRect().width > 0;
          });
        }
        continue;
      }
      const availableWidth = lineWidths[li] ?? lineWidths[lineWidths.length - 1] ?? 0;
      let rectPx = 0;
      let modelPx = 0;
      let ownMargins = 0;
      let lineRect = null;
      for (const _ref8 of entries) {
        const el = _ref8.el;
        const seg = _ref8.seg;
        const marginEndEl = _ref8.marginEndEl;
        let elRect;
        if (lineRect === null) {
          elRect = el.getBoundingClientRect();
          lineRect = elRect;
        }
        if (seg === null || seg.edgeTrim.lead === 0 && seg.edgeTrim.trail === 0) {
          rectPx += (elRect ?? el.getBoundingClientRect()).width;
        } else {
          const node = el.firstChild;
          range.setStart(node, seg.edgeTrim.lead);
          range.setEnd(node, seg.text.length - seg.edgeTrim.trail);
          rectPx += range.getBoundingClientRect().width;
          modelPx += seg.edgeTrim.modelPx;
        }
        if (seg !== null && seg.decorPx !== void 0) modelPx += seg.decorPx;
        modelPx += seg?.marginStartPx ?? 0;
        const me = parseFloat(marginEndEl.style.marginInlineEnd) || 0;
        modelPx += me;
        ownMargins += me;
      }
      if (rectPx !== 0) sawInk = true;
      const layout = rectPx + modelPx;
      const overflow = layout - availableWidth;
      if (overflow > CORRECTION_WINDOW_PX) {
        const textEntries = entries.filter(entry => entry.seg !== null);
        const endText = textEntries[textEntries.length - 1];
        const rightHang = endText?.seg.rightHangPx ?? 0;
        const physicalEndHang = (endText?.seg.physicalEndHangPx ?? 0) + (endText?.seg.hyphenEndHangPx ?? 0);
        const deliberateOverflow = endText?.seg.overflowPx ?? 0;
        const besideFloat = li < physicalFitLines;
        const physicalLayout = layout - ownMargins;
        let adjustmentPx;
        if (besideFloat) {
          adjustmentPx = physicalLayout - (availableWidth - FLOAT_WRAP_SPARE_PX + rightHang - physicalEndHang + deliberateOverflow);
        } else {
          const fragment = fragmentForLine(fragments.rects, lineRect, rtl === true);
          const contentEnd = rtl ? fragment.left + (parseFloat(paragraphStyle?.borderLeftWidth ?? "") || 0) + (parseFloat(paragraphStyle?.paddingLeft ?? "") || 0) : fragment.right - (parseFloat(paragraphStyle?.borderRightWidth ?? "") || 0) - (parseFloat(paragraphStyle?.paddingRight ?? "") || 0);
          const paintEndEntry = entries[entries.length - 1];
          let paintRect;
          if (paintEndEntry.paintEndEl !== void 0) {
            paintRect = paintEndEntry.paintEndEl.getBoundingClientRect();
          } else if (paintEndEntry.seg !== null && paintEndEntry.seg.marginEndOwner !== void 0 && paintEndEntry.marginEndEl !== paintEndEntry.el) {
            paintRect = paintEndEntry.marginEndEl.getBoundingClientRect();
          } else if (paintEndEntry.seg === null) {
            paintRect = paintEndEntry.el.getBoundingClientRect();
          } else {
            const node = endText?.el.firstChild;
            const end = endText === void 0 ? 0 : endWithoutCollapsibleSpaces(endText.seg.text);
            if (node?.nodeType === 3 && end > 0) {
              range.setStart(node, 0);
              range.setEnd(node, end);
              paintRect = range.getBoundingClientRect();
            } else paintRect = paintEndEntry.el.getBoundingClientRect();
          }
          let paintedEnd = rtl ? -paintRect.left : paintRect.right;
          if (paintEndEntry.paintEndEl !== void 0 && paintEndEntry.marginEndEl !== paintEndEntry.paintEndEl && paintEndEntry.paintEndEl.contains(paintEndEntry.marginEndEl)) {
            paintedEnd -= parseFloat(paintEndEntry.marginEndEl.style.marginInlineEnd) || 0;
          }
          if (paintEndEntry.seg === null && endText !== void 0) {
            const textRect = endText.el.getBoundingClientRect();
            if (Math.abs(paintRect.top - textRect.top) > 0.5 || fragmentForLine(fragments.rects, paintRect, rtl === true) !== fragment) {
              continue;
            }
          }
          const desiredEnd = (rtl ? -contentEnd : contentEnd) + rightHang + deliberateOverflow;
          adjustmentPx = paintedEnd - desiredEnd;
        }
        const correctionTexts = textEntries.map((entry, entryIndex) => entry.seg.text.slice(entryIndex === 0 ? entry.seg.edgeTrim.lead : 0));
        const spaceCounts = textEntries.map((entry, entryIndex) => Math.max(0, entry.seg.adjustableSpaceCount - (entryIndex === 0 ? entry.seg.edgeTrim.lead : 0)));
        const spaces = spaceCounts.reduce((sum, count) => sum + count, 0);
        const spacing = [];
        if (Math.abs(adjustmentPx) > 1e-3 && spaces > 0) {
          const delta = adjustmentPx / spaces;
          for (let entryIndex = 0; entryIndex < textEntries.length; entryIndex++) {
            if (spaceCounts[entryIndex] === 0) continue;
            const entry = textEntries[entryIndex];
            spacing.push({
              el: entry.el,
              property: "word-spacing",
              px: (parseFloat(entry.el.style.wordSpacing) || 0) - delta
            });
          }
        } else if (Math.abs(adjustmentPx) > 1e-3) {
          const charCounts = correctionTexts.map((text, entryIndex) => textEntries[entryIndex].seg.allowLetterCorrection ? Array.from(text).length : 0);
          const chars = charCounts.reduce((sum, count) => sum + count, 0);
          if (chars > 0) {
            const delta = adjustmentPx / chars;
            for (let entryIndex = 0; entryIndex < textEntries.length; entryIndex++) {
              if (charCounts[entryIndex] === 0) continue;
              const entry = textEntries[entryIndex];
              const computed = entry.el.ownerDocument.defaultView?.getComputedStyle(entry.el);
              spacing.push({
                el: entry.el,
                property: "letter-spacing",
                px: (parseFloat(computed?.letterSpacing ?? "") || 0) - delta
              });
            }
          }
        }
        if (Math.abs(adjustmentPx) > 1e-3 && spacing.length === 0) continue;
        const lineEndEntry = entries[entries.length - 1];
        paraCorrections.push({
          el: lineEndEntry.el,
          marginEl: lineEndEntry.marginEndEl,
          // Spacing now puts the measured painted edge at the requested
          // optical position. Its matching layout exclusion is therefore
          // exactly the intentional hang/overfull amount; deriving this
          // margin again from summed DOM widths lets engine-specific inline
          // rounding leak back in (notably Firefox's persistent 1.5px).
          marginPx: -(rightHang - (besideFloat ? physicalEndHang : 0) + deliberateOverflow),
          spacing: spacing.length > 0 ? spacing : void 0
        });
      }
    }
    if (!sawInk) hidden.push(i);else corrections.push(...paraCorrections);
  }
  return {
    corrections,
    hidden,
    invalid
  };
}
function applyCorrections(corrections) {
  for (const c of corrections) {
    for (const spacing of c.spacing ?? []) {
      spacing.el.style.setProperty(spacing.property, px(spacing.px));
    }
    let target = c.el;
    for (let parent = target.parentElement; parent !== null && !parent.hasAttribute("data-justif") && parent.lastChild === target; parent = target.parentElement) {
      target = parent;
    }
    if (c.marginEl !== target) c.marginEl.style.marginInlineEnd = "0px";
    target.style.marginInlineEnd = px(c.marginPx);
  }
}

// src/dom/segments.ts
var AUTHOR_NO_BREAK_SPACE = /[\u00A0\u202F]/;
var DASH_JUNCTION = /[\u002D\u2010-\u2015]/;
function trackingFeatureSettings(spec, active) {
  if (!active || spec.letterSpacingPx !== 0) return void 0;
  if (spec.ligatures === "none" || /\bno-common-ligatures\b/.test(spec.ligatures)) {
    return void 0;
  }
  const settings = spec.featureSettings === "normal" ? [] : [spec.featureSettings];
  const explicitlyOff = tag => new RegExp(`["']${tag}["']\\s*(?:0|off)\\b`, "i").test(spec.featureSettings);
  if (!explicitlyOff("liga")) settings.push('"liga" 1');
  if (!explicitlyOff("clig")) settings.push('"clig" 1');
  return settings.length > 0 ? settings.join(", ") : void 0;
}
function spaceWidthIn(spec, runText) {
  if (spec.direction === "rtl") {
    const probe = /\p{Script=Arabic}/u.test(runText) ? "\u0644" : /\p{Script=Hebrew}/u.test(runText) ? "\u05D0" : null;
    if (probe !== null) {
      return measureWidth(`${probe} ${probe}`, spec) - 2 * measureWidth(probe, spec);
    }
  }
  if (requiresDomMeasurement(spec) && spec.variantPosition === "normal") {
    const letter = /\p{L}/u.exec(runText)?.[0] ?? "n";
    return measureWidth(`${letter} ${letter}`, spec) - 2 * measureWidth(letter, spec);
  }
  return measureWidth(" ", spec);
}
function measureFor(specByKey) {
  return {
    width: (text, run) => measureWidth(text, specByKey.get(run.fontKey)),
    charAdvance: (ch, run) => measureWidth(ch, specByKey.get(run.fontKey)),
    inkBearings: (ch, run) => measureInkBearings(ch, specByKey.get(run.fontKey))
  };
}
function runTexts(scan) {
  return scan.runs.map((r, i) => ({
    text: r.text,
    run: i,
    flowExclusion: r.flowExclusion,
    boxStartProtrusionPx: r.boxStartProtrusionPx,
    boxEndProtrusionPx: r.boxEndProtrusionPx,
    padStartPx: r.padStartPx,
    padEndPx: r.padEndPx,
    atomicKey: r.atomicKey
  }));
}
function buildRunMetrics(scan, expansion, spacing, protrusion) {
  const paragraphText = scan.runs.map(r => r.text).join(" ");
  const baseSpaceWidth = spaceWidthIn(scan.specs[scan.baseSpec], paragraphText);
  const pull = spacing.pull ?? 0.7;
  const samplePcts = [];
  if (expansion !== false && expansion.step > 0) {
    const stepPct = 100 * expansion.step;
    for (let q = stepPct; q <= 100 * expansion.max + 1e-9; q += stepPct) {
      samplePcts.push(Math.round((100 + q) * 1e3) / 1e3);
    }
    for (let q = stepPct; q <= 100 * expansion.shrink + 1e-9; q += stepPct) {
      samplePcts.push(Math.round((100 - q) * 1e3) / 1e3);
    }
  }
  return scan.runs.map(run => {
    const spec = scan.specs[run.spec];
    let perFont;
    let perFontFirst;
    if (protrusion !== void 0 && protrusion.enabled) {
      const matched = fontProtrusion(spec.family);
      if (matched !== void 0) {
        const composed = composeProtrusion({
          ...latinProtrusion,
          ...matched
        }, protrusion.user, protrusion.hang);
        perFont = composed.rest;
        if (composed.first !== composed.rest) perFontFirst = composed.first;
      }
    }
    const naturalSpace = spaceWidthIn(spec, run.text);
    const spaceWidth = naturalSpace > baseSpaceWidth ? naturalSpace + (baseSpaceWidth - naturalSpace) * pull : naturalSpace;
    const flexWidth = naturalSpace + (Math.min(naturalSpace, baseSpaceWidth) - naturalSpace) * pull;
    const calibration = expansion === false ? NO_EXPANSION : calibrateStretch(spec, 100 + 100 * expansion.max, 100 - 100 * expansion.shrink, samplePcts, run.text);
    return {
      fontKey: spec.key,
      space: {
        width: spaceWidth,
        stretch: flexWidth * spacing.stretch,
        shrink: flexWidth * spacing.shrink
      },
      hyphenWidth: measureWidth("-", spec),
      ratioAtMax: calibration.ratioAtMax,
      ratioAtMin: calibration.ratioAtMin,
      expansionRatios: calibration.ratios,
      // RTL paragraphs never hyphenate: Arabic cursive joining makes the
      // prefix-incremental fragment measurement in buildItems invalid
      // (splitting changes the glyphs on both sides of the cut), and
      // Hebrew convention breaks without hyphens if at all. noHyphens
      // also strips soft hyphens and keeps the hyphenate callback from
      // ever being called for these runs.
      noHyphens: spec.hyphens === "none" || scan.direction === "rtl",
      // Word spaces between different font FAMILIES lose their shrink
      // (BuildOptions.boundaryShrink): chips and pills live at those
      // boundaries. Style/weight/size changes within a family (<em>,
      // <strong>) are not boundaries.
      familyKey: spec.family,
      // Monospace cells carry huge side bearings; advance-relative protrusion
      // codes would hang the ink visibly past the margin — but only when the
      // mono run sits INSIDE another font's prose (inline code), where the
      // hang reads as overflow against the base font's margin rhythm. A
      // paragraph set in a mono font owns its margin: it protrudes like any
      // other font (full cell hangs under hangingPunctuation — the
      // typewriter-tradition grid behavior).
      protrudeInkOnly: isMonospace(spec) && spec.key !== scan.specs[scan.baseSpec].key,
      protrusion: perFont,
      protrusionFirst: perFontFirst
    };
  });
}
function buildRenderSegments(scan, runsMetrics, para, lines, lineOffset) {
  if (lineOffset === void 0) {
    lineOffset = 0;
  }
  const segments = [];
  let pendingJoint = "none";
  const decorStartSeen = /* @__PURE__ */new Set();
  const lastSegForRun = /* @__PURE__ */new Map();
  let floatStyleEmitted = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const desired = (runIndex, flexOf) => {
      const metrics = runsMetrics[runIndex];
      const spec = scan.specs[scan.runs[runIndex].spec];
      const widthOffset = metrics.space.width - spaceWidthIn(spec, scan.runs[runIndex].text);
      const pool = flexOf ?? metrics.space;
      const flex = line.glueRatio >= 0 ? pool.stretch : pool.shrink;
      return spec.wordSpacingPx + widthOffset + line.glueRatio * flex;
    };
    let joint = pendingJoint;
    let first = true;
    let text = "";
    let run = -1;
    let trackY = 0;
    let trackZ = 0;
    let cjkY = 0;
    let cjkZ = 0;
    let hasCJK = false;
    let boxChars = 0;
    let adjustableSpaceCount = 0;
    let fixedNoBreakBox = false;
    let fixedBoundary;
    let flowExclusion;
    let rigidFlex = null;
    const flush = () => {
      if (run < 0 || text.length === 0) return;
      const floatedPrefix = flowExclusion === void 0 ? void 0 : text.slice(0, flowExclusion.end);
      const flowText = flowExclusion === void 0 ? text : text.slice(flowExclusion.end);
      const trackFlex = line.trackRatio >= 0 ? trackY : trackZ;
      const cjkFlex = line.glueRatio >= 0 ? cjkY : cjkZ;
      const extraPx = (trackFlex > 0 ? line.trackRatio * trackFlex : 0) + (cjkFlex > 0 ? line.glueRatio * cjkFlex : 0);
      const ls = boxChars > 0 && extraPx !== 0 ? extraPx / boxChars : 0;
      const lead = leadingCollapsibleSpaces(flowText);
      const trail = lead < flowText.length ? trailingCollapsibleSpaces(flowText) : 0;
      const spec = scan.specs[scan.runs[run].spec];
      const table = runsMetrics[run].expansionRatios;
      const key = Math.round(line.fontStretch * 1e3) / 1e3;
      const ratio = table?.get(key) ?? 1;
      const wordSpacing = fixedNoBreakBox ? spec.wordSpacingPx : desired(run, rigidFlex ?? void 0);
      const spacePx = spaceWidthIn(spec, scan.runs[run].text) * ratio + wordSpacing;
      const srcRun = scan.runs[run];
      let decorPx;
      if (srcRun.padStartPx !== void 0 && !decorStartSeen.has(run)) {
        decorStartSeen.add(run);
        decorPx = srcRun.padStartPx;
      }
      segments.push({
        text: flowText,
        floatedPrefix,
        floatedStyle: floatedPrefix !== void 0 && !floatStyleEmitted ? scan.floatIntrusion?.style : void 0,
        floatedInnerStyle: floatedPrefix !== void 0 ? srcRun.floatInnerStyle : void 0,
        ancestors: srcRun.ancestors,
        wordSpacingPx: fixedNoBreakBox ? wordSpacing : wordSpacing - ls,
        adjustableSpaceCount,
        allowLetterCorrection: !fixedNoBreakBox,
        letterSpacingPx: ls !== 0 ? spec.letterSpacingPx + ls : null,
        resolvedLetterSpacingPx: spec.letterSpacingPx + ls,
        fontFeatureSettings: trackingFeatureSettings(spec, ls !== 0),
        isolateShaping: spec.variantPosition !== "normal",
        fontStretchPct: line.fontStretch,
        marginStartPx: first ? -line.leftHang : 0,
        marginEndPx: 0,
        // the line's last segment is patched after the loop
        edgeTrim: {
          lead,
          trail,
          modelPx: (lead + trail) * spacePx
        },
        decorPx,
        cjk: hasCJK,
        joint,
        marginStartOwner: first && line.leftHang > 0 ? srcRun.boxStartProtrusionOwner : void 0,
        // Assigned only to the line's actual final segment below. Pointing
        // multiple entries at one clone would make correction measurement
        // count the clone's single margin more than once.
        marginEndOwner: void 0
      });
      if (floatedPrefix !== void 0) floatStyleEmitted = true;
      if (srcRun.padEndPx !== void 0) lastSegForRun.set(run, segments.length - 1);
      if (flowText.length > 0) {
        joint = "none";
        first = false;
      }
      text = "";
      run = -1;
      trackY = 0;
      trackZ = 0;
      cjkY = 0;
      cjkZ = 0;
      hasCJK = false;
      boxChars = 0;
      adjustableSpaceCount = 0;
      fixedNoBreakBox = false;
      flowExclusion = void 0;
    };
    for (let i = line.start; i < line.end; i++) {
      const it = para.items[i];
      if (it.type === ItemType.Box) {
        const ownFixedSegment = AUTHOR_NO_BREAK_SPACE.test(it.text);
        const firstChar = it.text[0] ?? "";
        if (fixedBoundary !== void 0) {
          const junction = fixedBoundary.lastChar + firstChar;
          if (fixedBoundary.run !== it.run && DASH_JUNCTION.test(junction)) {
            text = "\u2060";
          }
          fixedBoundary = void 0;
        }
        if (ownFixedSegment && run !== -1) {
          const junction = text.slice(-1) + firstChar;
          const protect = run !== it.run && DASH_JUNCTION.test(junction);
          flush();
          if (protect) text = "\u2060";
        }
        if (run !== -1 && run !== it.run) {
          const junction = text.slice(-1) + firstChar;
          const risky = DASH_JUNCTION.test(junction);
          flush();
          text = risky ? "\u2060" : "";
        }
        run = it.run;
        const textOffset = text.length;
        text += it.text;
        if (it.flowExclusion !== void 0) {
          const shifted = {
            start: textOffset + it.flowExclusion.start,
            end: textOffset + it.flowExclusion.end
          };
          if (flowExclusion === void 0) flowExclusion = shifted;else flowExclusion.end = shifted.end;
        }
        trackY += it.trackStretch;
        trackZ += it.trackShrink;
        boxChars += it.flowChars ?? Array.from(it.text).length;
        if (!hasCJK && CJK_CHAR.test(it.text)) hasCJK = true;
        if (ownFixedSegment) {
          const boundary = {
            lastChar: it.text.slice(-1),
            run: it.run
          };
          fixedNoBreakBox = true;
          flush();
          fixedBoundary = boundary;
        }
      } else if (it.type === ItemType.Glue) {
        fixedBoundary = void 0;
        if (it.cjk === true) {
          cjkY += it.stretch;
          cjkZ += it.shrink;
          continue;
        }
        const glueSpec = scan.specs[scan.runs[it.run].spec];
        if (glueSpec.variantPosition !== "normal") {
          flush();
          run = it.run;
          text = " ";
          adjustableSpaceCount = 1;
          flush();
          continue;
        }
        if (it.rigid === true && line.glueRatio < 0) {
          flush();
          run = it.run;
          text = "\xA0";
          adjustableSpaceCount = 1;
          rigidFlex = {
            stretch: it.stretch,
            shrink: it.shrink
          };
          flush();
          rigidFlex = null;
          continue;
        }
        if (run === -1 || run === it.run) {
          run = it.run;
          text += " ";
          adjustableSpaceCount++;
        } else {
          flush();
          run = it.run;
          text = "\xA0";
          adjustableSpaceCount = 1;
        }
      }
    }
    flush();
    const last = segments[segments.length - 1];
    if (last !== void 0) {
      let endBox;
      for (let i = line.end - 1; i >= line.start; i--) {
        const candidate = para.items[i];
        if (candidate.type === ItemType.Box) {
          endBox = candidate;
          break;
        }
      }
      const besideFloat = lineOffset + lineIndex < (scan.floatIntrusion?.lines ?? 0);
      const physicalEndHang = besideFloat && !line.hyphenated && endBox?.paintedEnd !== true && line.rightHang > 0 && endWithoutCollapsibleSpaces(last.text) > 0 ? line.rightHang : 0;
      if (physicalEndHang > 0) last.physicalEndHangPx = physicalEndHang;
      const hyphenEndHang = besideFloat && line.hyphenated && line.rightHang > 0 && endBox !== void 0 ? line.rightHang : 0;
      if (hyphenEndHang > 0) {
        last.hyphenEndHangPx = hyphenEndHang;
        const endSpec = scan.specs[scan.runs[endBox.run].spec];
        last.hyphenLetterSpacingPx = endSpec.letterSpacingPx - hyphenEndHang;
      }
      last.marginEndPx = -(line.rightHang - physicalEndHang - hyphenEndHang + line.overflowPx + WRAP_SAFETY_PAD_PX);
      last.rightHangPx = line.rightHang;
      last.overflowPx = line.overflowPx;
      if (endBox?.type === ItemType.Box && endBox.paintedEnd === true) {
        last.marginEndOwner = scan.runs[endBox.run]?.boxEndProtrusionOwner;
      }
    }
    const brk = para.items[line.end];
    if (line.hyphenated) pendingJoint = "hyphen";else if (brk !== void 0 && brk.type === ItemType.Glue) pendingJoint = "space";else if (brk !== void 0 && brk.type === ItemType.Penalty && brk.width === 0 && !brk.flagged) {
      pendingJoint = brk.cjk === true ? "wbr" : "space";
    } else pendingJoint = "wbr";
  }
  for (const _ref9 of lastSegForRun) {
    const runIndex = _ref9[0];
    const segIndex = _ref9[1];
    const seg = segments[segIndex];
    seg.decorPx = (seg.decorPx ?? 0) + scan.runs[runIndex].padEndPx;
    seg.decorEndOwner = scan.runs[runIndex].padEndOwner;
  }
  return segments;
}

// src/index.ts
var states = /* @__PURE__ */new WeakMap();
function restoreStyleAttribute(el, style) {
  if (style === null) {
    el.setAttribute("style", "");
    el.removeAttribute("style");
  } else {
    el.setAttribute("style", style);
  }
}
function restoreManagedOutput(p, state) {
  if (!state.enhanced) return false;
  p.replaceChildren(state.original);
  restoreStyleAttribute(p, state.originalStyleAttr);
  p.removeAttribute("data-justif");
  p.removeAttribute("data-justif-dropcap");
  state.lastPatch = "";
  state.enhanced = false;
  return true;
}
var DEFAULT_EXPANSION = {
  max: 0.02,
  shrink: 0.02,
  step: 5e-3
};
var DEFAULT_SPACING = {
  stretch: 0.5,
  shrink: 1 / 3,
  pull: 0.7,
  boundaryShrink: 0
};
var DEFAULT_TRACKING = {
  max: 0.03,
  shrink: 0.03
};
var MIN_FLOAT_LINE_WIDTH_PX = 1;
function noopController() {
  return {
    ready: Promise.resolve(),
    refresh() {},
    destroy() {},
    paragraphs: []
  };
}
function withOverrides(defaults, overrides) {
  const merged = {
    ...defaults
  };
  for (const key of Object.keys(defaults)) {
    const value = overrides[key];
    if (value !== void 0) merged[key] = value;
  }
  return merged;
}
function justify(targets, options) {
  if (options === void 0) {
    options = {};
  }
  if (typeof document === "undefined" || typeof window === "undefined") {
    return noopController();
  }
  const paragraphs = [];
  for (const el of targets instanceof Element ? [targets] : targets) {
    if (el instanceof HTMLElement) paragraphs.push(el);
  }
  const owner = /* @__PURE__ */Symbol("justif-controller");
  const bailed = /* @__PURE__ */new WeakSet();
  let destroyed = false;
  const breakOpts = withOverrides(defaultBreakOptions, options);
  const lastLineMinWidth = Math.max(0, Math.min(1, options.lastLineMinWidth ?? 0.33));
  breakOpts.lastLineMinWidth = lastLineMinWidth;
  const protrusionUser = typeof options.protrusion === "object" ? options.protrusion : null;
  const hangMode = options.hangingPunctuation === false ? false : options.hangingPunctuation === true || options.hangingPunctuation === void 0 ? "first-line" : options.hangingPunctuation;
  const composed = options.protrusion === false ? null : composeProtrusion(latinProtrusion, protrusionUser, hangMode);
  const protrusion = composed === null ? false : composed.rest;
  const protrusionFirst = composed !== null && composed.first !== composed.rest ? composed.first : void 0;
  const protrusionCtx = {
    enabled: composed !== null,
    user: protrusionUser,
    hang: hangMode
  };
  const expansion = options.expansion === void 0 ? DEFAULT_EXPANSION : options.expansion;
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const tracking = options.tracking === false ? false : options.tracking === true || options.tracking === void 0 ? DEFAULT_TRACKING : {
    ...DEFAULT_TRACKING,
    ...options.tracking
  };
  let hyphenate = options.hyphenate;
  if (hyphenate !== void 0) {
    const inner = hyphenate;
    const cache2 = /* @__PURE__ */new Map();
    hyphenate = word => {
      let pieces = cache2.get(word);
      if (pieces === void 0) {
        pieces = inner(word);
        cache2.set(word, pieces);
      }
      return pieces;
    };
  }
  const buildOpts = {
    ...defaultBuildOptions,
    hyphenate,
    lastLineFit: Math.max(0, Math.min(1, options.lastLineFit ?? 0)),
    lastLineMinWidth,
    hyphenPenalty: options.hyphenPenalty ?? defaultBuildOptions.hyphenPenalty,
    exHyphenPenalty: options.exHyphenPenalty ?? defaultBuildOptions.exHyphenPenalty,
    protrusion,
    protrusionFirst,
    expansion,
    tracking,
    boundaryShrink: spacing.boundaryShrink ?? defaultBuildOptions.boundaryShrink
  };
  const disableTextAutosizingForScan = () => {
    const saved = [];
    const seen = /* @__PURE__ */new WeakSet();
    const disable = el => {
      if (seen.has(el)) return;
      seen.add(el);
      saved.push({
        el,
        style: el.getAttribute("style")
      });
      disableTextAutosizing(el);
    };
    for (const p of paragraphs) {
      if (states.get(p)?.enhanced) continue;
      disable(p);
      for (const el of p.querySelectorAll("*")) {
        if (el instanceof HTMLElement) disable(el);
      }
    }
    return () => {
      for (const _ref0 of saved) {
        const el = _ref0.el;
        const style = _ref0.style;
        restoreStyleAttribute(el, style);
      }
    };
  };
  const scanned = /* @__PURE__ */new Map();
  const pendingSkips = [];
  const scanParagraph = p => {
    if (states.get(p)?.enhanced) return true;
    if (bailed.has(p)) return false;
    if (scanned.has(p)) return true;
    let scan;
    try {
      scan = readParagraph(p);
      if (typeof scan !== "string") {
        const bad = scan.specs.find(sp => !supportsSpec(sp));
        if (bad !== void 0) {
          scan = bad.stretch !== "100%" && bad.stretch !== "normal" ? `author font-stretch: ${bad.stretch} on a run` : "font-variation-settings on a run";
        }
      }
    } catch (error) {
      scan = `threw while scanning: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (typeof scan === "string") {
      bailed.add(p);
      pendingSkips.push({
        p,
        reason: scan
      });
      return false;
    }
    scanned.set(p, scan);
    return true;
  };
  const buildParts = (scan, runsMetrics, specByKey) => {
    const opts = scan.direction === "rtl" ? {
      ...buildOpts,
      tracking: false
    } : buildOpts;
    const texts = runTexts(scan);
    const measure = measureFor(specByKey);
    const parts = [];
    let startRun = 0;
    const append = (endRun, breakAfter) => {
      const para = buildItems(texts.slice(startRun, endRun), runsMetrics, opts, measure);
      if (parts.length > 0) {
        for (const item of para.items) {
          if (item.type === ItemType.Box) item.lpFirst = item.lp;
        }
      }
      parts.push({
        para,
        breakAfter
      });
      startRun = endRun;
    };
    for (const hardBreak of scan.hardBreaks) {
      append(hardBreak.afterRun, hardBreak);
    }
    append(texts.length, null);
    return parts;
  };
  const prepare = p => {
    if (states.get(p)?.enhanced) {
      scanned.delete(p);
      return true;
    }
    const scan = scanned.get(p);
    if (scan === void 0) return false;
    scanned.delete(p);
    try {
      const specByKey = /* @__PURE__ */new Map();
      for (const spec of scan.specs) specByKey.set(spec.key, spec);
      const runsMetrics = buildRunMetrics(scan, expansion, spacing, protrusionCtx);
      states.set(p, {
        owner,
        original: document.createDocumentFragment(),
        originalStyleAttr: p.getAttribute("style"),
        scan,
        runsMetrics,
        specByKey,
        parts: buildParts(scan, runsMetrics, specByKey),
        width: scan.contentWidth,
        lastPatch: "",
        enhanced: false
      });
    } catch (error) {
      bailed.add(p);
      emitSkip(p, `threw while measuring: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    return true;
  };
  const safePatch = p => {
    try {
      return patchOne(p);
    } catch (error) {
      const changed = states.get(p)?.enhanced === true;
      restore(p);
      bailed.add(p);
      emitSkip(p, `threw while rendering: ${error instanceof Error ? error.message : String(error)}`);
      return {
        changed,
        pending: null
      };
    }
  };
  const emitSkip = (p, reason) => {
    try {
      options.onSkip?.(p, reason);
    } catch (err) {
      console.error("justif: onSkip callback threw", err);
    }
  };
  const emitRelayout = p => {
    try {
      options.onRelayout?.(p);
    } catch (err) {
      console.error("justif: onRelayout callback threw", err);
    }
  };
  const patchOne = p => {
    const state = states.get(p);
    if (state === void 0 || state.owner !== owner) return {
      changed: false,
      pending: null
    };
    const indentPx = state.scan.textIndentPct !== null ? state.scan.textIndentPct * state.width : state.scan.textIndent;
    const intrusion = state.scan.floatIntrusion;
    const varyingLines = Math.max(indentPx !== 0 ? 1 : 0, intrusion?.lines ?? 0);
    const rawWidths = varyingLines > 0 ? Array.from({
      length: varyingLines + 1
    }, (_, line) => state.width - (line === 0 ? indentPx : 0) - (intrusion !== null && line < intrusion.lines ? intrusion.inlineSize : 0)) : state.width;
    if (intrusion !== null && Array.isArray(rawWidths) && rawWidths.slice(0, intrusion.lines).some(width => width < MIN_FLOAT_LINE_WIDTH_PX)) {
      pendingWidths.delete(p);
      pendingCorrections.delete(p);
      hiddenCorrections.delete(p);
      return {
        changed: restoreManagedOutput(p, state),
        pending: null
      };
    }
    const widths = Array.isArray(rawWidths) ? rawWidths.map(width => Math.max(0, width)) : rawWidths;
    const paragraphMinWidth = state.scan.justifyAll ? 1 : lastLineMinWidth;
    const paragraphBreakOpts = paragraphMinWidth === lastLineMinWidth ? breakOpts : {
      ...breakOpts,
      lastLineMinWidth: paragraphMinWidth
    };
    const paragraphBuildOpts = paragraphMinWidth === lastLineMinWidth ? buildOpts : {
      ...buildOpts,
      lastLineMinWidth: paragraphMinWidth
    };
    const widthAt = line => typeof widths === "number" ? widths : widths[Math.min(line, widths.length - 1)] ?? 0;
    const widthsFrom = line => typeof widths === "number" ? widths : widths.slice(Math.min(line, widths.length - 1));
    const rendered = [];
    const lineWidths = [];
    const fingerprintParts = [];
    const priorLastLineFit = {
      sum: 0,
      count: 0
    };
    let visualLineCount = 0;
    let modeledLineCount = 0;
    let onlyLine = null;
    let onlyResult = null;
    for (let partIndex = 0; partIndex < state.parts.length; partIndex++) {
      const part = state.parts[partIndex];
      const partLineOffset = visualLineCount;
      const partWidths = widthsFrom(partLineOffset);
      const isFinal = part.breakAfter === null;
      let result = null;
      let lines = [];
      if (part.para.firstBoxAfter[0] !== part.para.items.length) {
        const partBuildOpts = !isFinal && paragraphBuildOpts.lastLineFit !== 0 ? {
          ...paragraphBuildOpts,
          lastLineFit: 0
        } : paragraphBuildOpts;
        result = breakParagraph(part.para, partWidths, paragraphBreakOpts);
        lines = layoutLines(part.para, result, partWidths, partBuildOpts, isFinal ? priorLastLineFit : void 0);
        rendered.push(...buildRenderSegments(state.scan, state.runsMetrics, part.para, lines, partLineOffset));
        for (const line of lines) lineWidths.push(line.width);
        visualLineCount += lines.length;
        modeledLineCount += lines.length;
        if (modeledLineCount === 1) {
          onlyLine = lines[0] ?? null;
          onlyResult = result;
        } else {
          onlyLine = null;
          onlyResult = null;
        }
        for (let i = 0; i + 1 < lines.length; i++) {
          priorLastLineFit.sum += lines[i].glueRatio;
          priorLastLineFit.count++;
        }
        fingerprintParts.push(`${partIndex}:${result.breakpoints.join(",")}:${result.endingMinWidth ?? ""}:${lines.map(line => `${line.glueRatio.toFixed(4)}:${line.trackRatio.toFixed(4)}:${line.fontStretch}`).join(",")}`);
      } else {
        fingerprintParts.push(`${partIndex}:empty`);
      }
      if (part.breakAfter !== null) {
        if (lines.length === 0) {
          lineWidths.push(widthAt(visualLineCount));
          visualLineCount++;
        }
        rendered.push({
          kind: "hard-break",
          source: part.breakAfter.source,
          ancestors: part.breakAfter.ancestors
        });
      }
    }
    if (visualLineCount === 1 && state.scan.hardBreaks.length === 0 && onlyLine !== null && onlyResult !== null) {
      const adjusted = Math.abs(onlyLine.glueRatio) > 1e-9 || Math.abs(onlyLine.trackRatio) > 1e-9 || Math.abs(onlyLine.fontStretch - 100) > 1e-9;
      const reachedFullWidth = paragraphMinWidth === 1 && (onlyResult.endingMinWidth ?? paragraphMinWidth) >= 1 - 1e-9 && onlyLine.overfull !== true && adjusted;
      if (!reachedFullWidth) {
        pendingWidths.delete(p);
        pendingCorrections.delete(p);
        hiddenCorrections.delete(p);
        return {
          changed: restoreManagedOutput(p, state),
          pending: null
        };
      }
    }
    const fingerprint = fingerprintParts.join("|");
    if (fingerprint === state.lastPatch) return {
      changed: false,
      pending: null
    };
    state.lastPatch = fingerprint;
    if (!state.enhanced) {
      state.original.append(...p.childNodes);
      state.enhanced = true;
      p.setAttribute("data-justif", "");
      if (state.scan.floatIntrusion !== null) p.setAttribute("data-justif-dropcap", "");
      disableTextAutosizing(p);
      p.style.textAlign = state.scan.direction === "rtl" ? "right" : "left";
      if (state.scan.justifyAll) {
        p.style.textAlignLast = state.scan.direction === "rtl" ? "right" : "left";
      }
      p.style.setProperty("hanging-punctuation", "none");
      p.style.setProperty("overflow-wrap", "normal");
      p.style.setProperty("word-break", "normal");
      p.style.setProperty("line-break", "auto");
      if (state.scan.specs[state.scan.baseSpec].hyphens === "auto") {
        p.style.setProperty("hyphens", "manual");
        p.style.setProperty("-webkit-hyphens", "manual");
      }
    }
    if (state.scan.pinIntrinsicSize && state.scan.lineHeightPx !== null) {
      p.style.containIntrinsicBlockSize = `auto ${Math.round(visualLineCount * state.scan.lineHeightPx * 1e3) / 1e3}px`;
    }
    pendingCorrections.delete(p);
    hiddenCorrections.delete(p);
    return {
      changed: true,
      pending: writeParagraph(p, rendered, lineWidths, intrusion?.lines ?? 0)
    };
  };
  const flushPatches = batch => {
    if (batch.length === 0) return;
    const measure = [];
    for (const e of batch) {
      if (viewObserver === null || nearViewport.has(e.p)) measure.push(e);else if (e.p.isConnected) hiddenCorrections.set(e.p, e.pending);
    }
    if (measure.length > 0) {
      const _measureCorrections = measureCorrections(measure.map(e => e.pending)),
        corrections = _measureCorrections.corrections,
        hidden = _measureCorrections.hidden,
        invalid = _measureCorrections.invalid;
      applyCorrections(corrections);
      for (const i of hidden) {
        const e = measure[i];
        hiddenCorrections.set(e.p, e.pending);
      }
      for (const _ref1 of invalid) {
        const index = _ref1.index;
        const reason = _ref1.reason;
        const e = measure[index];
        const state = states.get(e.p);
        if (state === void 0 || state.owner !== owner) continue;
        pendingWidths.delete(e.p);
        pendingCorrections.delete(e.p);
        hiddenCorrections.delete(e.p);
        const changed = state.enhanced;
        restore(e.p);
        bailed.add(e.p);
        emitSkip(e.p, reason);
        if (changed) emitRelayout(e.p);
      }
    }
  };
  const commit = scannable2 => {
    collectDomMeasurements(() => {
      for (const p of scannable2) {
        const scan = scanned.get(p);
        if (scan === void 0) continue;
        if (!scan.specs.some(requiresDomMeasurement)) continue;
        try {
          const specByKey = new Map(scan.specs.map(spec => [spec.key, spec]));
          const runsMetrics = buildRunMetrics(scan, expansion, spacing, protrusionCtx);
          buildParts(scan, runsMetrics, specByKey);
        } catch {}
      }
    });
    const batch = [];
    const changed = [];
    for (const p of scannable2) {
      if (!prepare(p)) continue;
      const outcome = safePatch(p);
      if (outcome.pending !== null) batch.push({
        p,
        pending: outcome.pending
      });
      if (outcome.changed) changed.push(p);
    }
    flushPatches(batch);
    for (const p of changed) emitRelayout(p);
  };
  let fontProbes = [];
  let fontsConverged = false;
  const reprobeBaselines = () => {
    for (const f of fontProbes) {
      f.baseline = probeAdvance(f.font, f.sample);
      f.kernBaseline = probeAdvance(f.font, f.kernSample);
    }
  };
  const probesChanged = () => fontProbes.some(f => Math.abs(probeAdvance(f.font, f.sample) - f.baseline) > 0.01 || Math.abs(probeAdvance(f.font, f.kernSample) - f.kernBaseline) > 0.01);
  const refreshFloatIntrusions = () => {
    let changed = false;
    for (const p of paragraphs) {
      const state = states.get(p);
      if (state === void 0 || state.owner !== owner || state.scan.floatIntrusion === null) {
        continue;
      }
      const nextInlineSize = floatInlineSizeOf(p);
      if (nextInlineSize === null) continue;
      if (Math.abs(nextInlineSize - state.scan.floatIntrusion.inlineSize) > 0.05) {
        state.scan.floatIntrusion = {
          inlineSize: nextInlineSize,
          lines: state.scan.floatIntrusion.lines,
          style: state.scan.floatIntrusion.style
        };
        changed = true;
      }
    }
    return changed;
  };
  const refreshNativeFloatIntrusions = () => {
    if (destroyed) return false;
    const candidates = paragraphs.flatMap(p => {
      const state = states.get(p);
      return state !== void 0 && state.owner === owner && state.scan.floatIntrusion !== null ? [{
        p,
        state
      }] : [];
    });
    let changed = false;
    for (const _ref10 of candidates) {
      const p = _ref10.p;
      const state = _ref10.state;
      pendingWidths.delete(p);
      pendingCorrections.delete(p);
      hiddenCorrections.delete(p);
      if (restoreManagedOutput(p, state)) changed = true;
    }
    for (const _ref11 of candidates) {
      const p = _ref11.p;
      const state = _ref11.state;
      const next = floatIntrusionOf(p, state.scan.runs.map(run => run.text).join(""));
      if (next === null) {
        states.delete(p);
        bailed.add(p);
        emitSkip(p, "could not remeasure floated ::first-letter after font change");
        emitRelayout(p);
        continue;
      }
      if (Math.abs(next.inlineSize - state.scan.floatIntrusion.inlineSize) > 0.05 || next.lines !== state.scan.floatIntrusion.lines) {
        changed = true;
      }
      state.scan.floatIntrusion = next;
    }
    return changed;
  };
  const remeasureAll = function (floatGeometryFresh) {
    if (floatGeometryFresh === void 0) {
      floatGeometryFresh = false;
    }
    if (destroyed) return;
    if (!floatGeometryFresh) refreshFloatIntrusions();
    clearMeasureCache();
    clearCalibrationCache();
    reprobeBaselines();
    const mine = paragraphs.filter(p => states.get(p)?.owner === owner);
    const widths = new Map(mine.map(p => [p, contentWidthOf(p)]));
    collectDomMeasurements(() => {
      for (const p of mine) {
        const state = states.get(p);
        if (!state.scan.specs.some(requiresDomMeasurement)) continue;
        try {
          const runsMetrics = buildRunMetrics(state.scan, expansion, spacing, protrusionCtx);
          buildParts(state.scan, runsMetrics, state.specByKey);
        } catch {}
      }
    });
    const batch = [];
    const changed = [];
    for (const p of mine) {
      const state = states.get(p);
      const width = widths.get(p);
      if (typeof width === "string") {
        pendingWidths.delete(p);
        pendingCorrections.delete(p);
        hiddenCorrections.delete(p);
        const wasEnhanced = state.enhanced;
        restore(p);
        bailed.add(p);
        emitSkip(p, width);
        if (wasEnhanced) changed.push(p);
        continue;
      }
      state.runsMetrics = buildRunMetrics(state.scan, expansion, spacing, protrusionCtx);
      state.parts = buildParts(state.scan, state.runsMetrics, state.specByKey);
      state.width = width;
      state.lastPatch = "";
      const outcome = safePatch(p);
      if (outcome.pending !== null) batch.push({
        p,
        pending: outcome.pending
      });
      if (outcome.changed) changed.push(p);
    }
    flushPatches(batch);
    for (const p of changed) emitRelayout(p);
  };
  const pendingWidths = /* @__PURE__ */new Map();
  const pendingCorrections = /* @__PURE__ */new Map();
  const hiddenCorrections = /* @__PURE__ */new Map();
  let pendingOrder = [];
  let pendingCursor = 0;
  let sliceQueued = false;
  const SLICE_BUDGET_MS = 10;
  const CORRECTION_CHUNK = 100;
  const nearViewport = /* @__PURE__ */new Set();
  const viewObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    let promoted = false;
    for (const e of entries) {
      if (e.isIntersecting) {
        nearViewport.add(e.target);
        if (promoteParked(e.target)) promoted = true;
      } else {
        nearViewport.delete(e.target);
        if (!e.target.isConnected) {
          const t = e.target;
          hiddenCorrections.delete(t);
          pendingCorrections.delete(t);
          pendingWidths.delete(t);
        }
      }
    }
    if (promoted) scheduleSlice();
  }, {
    rootMargin: "50%"
  });
  const revealObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    let revealed = false;
    for (const e of entries) {
      if (e.isIntersecting && promoteParked(e.target)) revealed = true;
    }
    if (revealed) scheduleSlice();
  });
  const promoteParked = el => {
    const parked = hiddenCorrections.get(el);
    if (parked === void 0) return false;
    hiddenCorrections.delete(el);
    const s = states.get(el);
    if (s === void 0 || s.owner !== owner || !s.enhanced) return false;
    pendingCorrections.set(el, parked);
    return true;
  };
  const scheduleSlice = () => {
    if (sliceQueued) return;
    sliceQueued = true;
    requestAnimationFrame(drainPending);
  };
  const visibleFirst = els => {
    if (els.length > 1 && viewObserver !== null) {
      els.sort((a, b) => Number(!nearViewport.has(a)) - Number(!nearViewport.has(b)));
    }
    return els;
  };
  const drainPending = () => {
    sliceQueued = false;
    if (destroyed) {
      pendingWidths.clear();
      pendingCorrections.clear();
      hiddenCorrections.clear();
      pendingOrder = [];
      return;
    }
    const start = performance.now();
    let anchor = null;
    let anchorTop = 0;
    if (pendingCursor < pendingOrder.length) {
      let above = null;
      let below = null;
      for (const p of paragraphs) {
        if (!nearViewport.has(p)) continue;
        const top = p.getBoundingClientRect().top;
        if (top >= 0 && top < window.innerHeight) {
          anchor = p;
          anchorTop = top;
          break;
        }
        if (top < 0) above = p;else below ?? (below = p);
      }
      if (anchor === null) {
        anchor = above ?? below;
        if (anchor !== null) anchorTop = anchor.getBoundingClientRect().top;
      }
    }
    let wrote = false;
    while (pendingCursor < pendingOrder.length) {
      if (wrote && performance.now() - start > SLICE_BUDGET_MS) break;
      const el = pendingOrder[pendingCursor++];
      const width = pendingWidths.get(el);
      if (width === void 0) continue;
      pendingWidths.delete(el);
      const state = states.get(el);
      if (state === void 0 || state.owner !== owner) continue;
      if (Math.abs(width - state.width) < 0.05) continue;
      state.width = width;
      const outcome = safePatch(el);
      if (outcome.changed) {
        if (outcome.pending !== null) pendingCorrections.set(el, outcome.pending);
        wrote = true;
        emitRelayout(el);
        if (destroyed) return;
      }
    }
    if (wrote && anchor !== null) {
      const delta = anchor.getBoundingClientRect().top - anchorTop;
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
    }
    if (pendingCursor < pendingOrder.length) {
      scheduleSlice();
      return;
    }
    if (!wrote && pendingCorrections.size > 0) {
      const els = visibleFirst([...pendingCorrections.keys()]);
      const batch = [];
      for (const el of els.slice(0, CORRECTION_CHUNK)) {
        batch.push({
          p: el,
          pending: pendingCorrections.get(el)
        });
        pendingCorrections.delete(el);
      }
      flushPatches(batch);
    }
    if (pendingCorrections.size > 0 || pendingWidths.size > 0) scheduleSlice();
  };
  const onCopy = e => {
    if (e.clipboardData === null) return;
    const sel = document.getSelection();
    if (sel === null || sel.rangeCount === 0 || sel.isCollapsed) return;
    let touches = false;
    let authorNbsp = false;
    for (const p of paragraphs) {
      const state = states.get(p);
      if (state === void 0 || state.owner !== owner || !state.enhanced) continue;
      if (!sel.containsNode(p, true)) continue;
      touches = true;
      if (state.scan.runs.some(r => /[\u00A0\u202F]/.test(r.text))) authorNbsp = true;
    }
    if (!touches) return;
    const clean = v => {
      const noWj = v.replace(/\u2060/g, "");
      return authorNbsp ? noWj : noWj.replace(/\u00A0/g, " ");
    };
    const BLOCKY = /^(?:P|DIV|LI|UL|OL|BLOCKQUOTE|H[1-6]|PRE|TABLE|TR|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|FIGCAPTION)$/;
    const plainOf = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
      let out = "";
      for (let c = node.firstChild; c !== null; c = c.nextSibling) out += plainOf(c);
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === "BR") out += "\n";else if (BLOCKY.test(tag)) out += "\n\n";
      }
      return out;
    };
    const html = document.createElement("div");
    let plain = "";
    for (let i = 0; i < sel.rangeCount; i++) {
      const frag = sel.getRangeAt(i).cloneContents();
      const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        n.nodeValue = clean(n.nodeValue ?? "");
      }
      plain += plainOf(frag);
      html.append(frag);
    }
    e.clipboardData.setData("text/plain", plain.replace(/\n+$/, ""));
    e.clipboardData.setData("text/html", html.innerHTML);
    e.preventDefault();
  };
  if (options.cleanClipboard !== false) document.addEventListener("copy", onCopy);
  let observer = null;
  const onFontsLoaded = () => {
    const metricsChanged = probesChanged();
    const floatChanged = metricsChanged ? refreshNativeFloatIntrusions() : refreshFloatIntrusions();
    if (metricsChanged || floatChanged) remeasureAll(true);
  };
  const attachObservers = () => {
    for (const p of paragraphs) {
      const s = states.get(p);
      if (s !== void 0 && s.owner === owner) {
        viewObserver?.observe(p);
        revealObserver?.observe(p);
      }
    }
    if (options.observeResize !== false) {
      observer = createWidthObserver(widths => {
        for (const _ref12 of widths) {
          const el = _ref12[0];
          const width = _ref12[1];
          const state = states.get(el);
          if (state === void 0 || state.owner !== owner) continue;
          if (Math.abs(width - state.width) < 0.05) {
            pendingWidths.delete(el);
            continue;
          }
          pendingWidths.set(el, width);
        }
        if (pendingWidths.size > 0) {
          pendingOrder = visibleFirst([...pendingWidths.keys()]);
          pendingCursor = 0;
          if (!sliceQueued) drainPending();
        }
      });
      for (const p of paragraphs) {
        const s = states.get(p);
        if (s !== void 0 && s.owner === owner) observer.observe(p);
      }
    }
    document.fonts.addEventListener("loadingdone", onFontsLoaded);
  };
  const restoreScanStyles = disableTextAutosizingForScan();
  let scannable;
  try {
    scannable = paragraphs.filter(scanParagraph);
  } finally {
    restoreScanStyles();
  }
  for (const _ref13 of pendingSkips) {
    const p = _ref13.p;
    const reason = _ref13.reason;
    emitSkip(p, reason);
  }
  const KERN_SAMPLE_MAX = 256;
  const fontSample = /* @__PURE__ */new Map();
  for (const p of scannable) {
    const scan = scanned.get(p);
    if (scan === void 0) continue;
    for (const spec of scan.specs) {
      const font = ctxFontOf(spec);
      if (!fontSample.has(font)) fontSample.set(font, {
        chars: /* @__PURE__ */new Set(),
        kern: ""
      });
    }
    for (const run of scan.runs) {
      const s = fontSample.get(ctxFontOf(scan.specs[run.spec]));
      for (const ch of run.text) s.chars.add(ch);
      if (s.kern.length < KERN_SAMPLE_MAX) {
        s.kern += run.text.slice(0, KERN_SAMPLE_MAX - s.kern.length);
      }
      if (hyphenate !== void 0 || run.text.includes("\xAD")) s.chars.add("-");
    }
  }
  fontProbes = [...fontSample].map(_ref14 => {
    let font = _ref14[0],
      s = _ref14[1];
    return {
      font,
      sample: s.chars.size === 0 ? " " : [...s.chars].join(""),
      kernSample: s.kern,
      baseline: 0,
      kernBaseline: 0
    };
  });
  let ready;
  try {
    commit(scannable);
    reprobeBaselines();
    attachObservers();
    if (fontProbes.length === 0) {
      fontsConverged = true;
      ready = Promise.resolve();
    } else {
      ready = Promise.all(fontProbes.map(f => document.fonts.load(f.font, f.sample + f.kernSample).catch(() => {}))).then(() => {
        fontsConverged = true;
        if (!destroyed) onFontsLoaded();
      });
    }
  } catch (error) {
    ready = Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  ready.catch(() => {});
  return {
    ready,
    paragraphs,
    refresh() {
      refreshNativeFloatIntrusions();
      remeasureAll(true);
    },
    destroy() {
      destroyed = true;
      if (!fontsConverged) {
        clearMeasureCache();
        clearCalibrationCache();
      }
      pendingWidths.clear();
      pendingCorrections.clear();
      hiddenCorrections.clear();
      pendingOrder = [];
      document.removeEventListener("copy", onCopy);
      document.fonts.removeEventListener("loadingdone", onFontsLoaded);
      viewObserver?.disconnect();
      revealObserver?.disconnect();
      observer?.disconnect();
      observer = null;
      for (const p of paragraphs) {
        if (states.get(p)?.owner === owner) restore(p);
      }
    }
  };
}
function unjustify(targets) {
  for (const el of targets instanceof Element ? [targets] : targets) {
    if (el instanceof HTMLElement) restore(el);
  }
}
function restore(p) {
  const state = states.get(p);
  if (state === void 0) return;
  restoreManagedOutput(p, state);
  states.delete(p);
}
export { justify, unjustify };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map
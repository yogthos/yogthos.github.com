// src/hyphenation/liang.ts
function createHyphenator(data) {
  const leftmin = data.leftmin ?? 2;
  const rightmin = data.rightmin ?? 3;
  let root = null;
  let exceptionMap = null;
  function compile() {
    root = {
      children: /* @__PURE__ */new Map(),
      points: null
    };
    for (const pattern of data.patterns.split(/\s+/)) {
      if (pattern.length === 0) continue;
      const chars = [];
      const points = [0];
      for (const ch of pattern) {
        if (ch >= "0" && ch <= "9") points[points.length - 1] = ch.charCodeAt(0) - 48;else {
          chars.push(ch);
          points.push(0);
        }
      }
      let node = root;
      for (const ch of chars) {
        node.children ?? (node.children = /* @__PURE__ */new Map());
        let next = node.children.get(ch);
        if (next === void 0) {
          next = {
            children: null,
            points: null
          };
          node.children.set(ch, next);
        }
        node = next;
      }
      node.points = points;
    }
    exceptionMap = /* @__PURE__ */new Map();
    if (data.exceptions !== void 0) {
      for (const exception of data.exceptions.split(/\s+/)) {
        if (exception.length === 0) continue;
        exceptionMap.set(exception.replace(/-/g, ""), exception.split("-"));
      }
    }
  }
  return function hyphenate(word) {
    if (word.length < leftmin + rightmin) return [word];
    if (root === null) compile();
    const exception = exceptionMap.get(word);
    if (exception !== void 0) return exception.slice();
    const w = "." + word + ".";
    const n = w.length;
    const points = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let node = root;
      for (let j = i; j < n; j++) {
        node = node.children?.get(w[j]);
        if (node === void 0) break;
        const pts = node.points;
        if (pts !== null) {
          for (let k = 0; k < pts.length; k++) {
            if (pts[k] > points[i + k]) points[i + k] = pts[k];
          }
        }
      }
    }
    const pieces = [];
    let startC = 0;
    for (let c = leftmin; c <= word.length - rightmin; c++) {
      if (points[c + 1] % 2 === 1) {
        pieces.push(word.slice(startC, c));
        startC = c;
      }
    }
    pieces.push(word.slice(startC));
    return pieces;
  };
}
export { createHyphenator };
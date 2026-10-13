// Gibson Les Paul style guitar controller, drawn as inline SVG.
// Every control can be lit up live (pressed), marked as mapped, or focused (dashed ring).
const NS = 'http://www.w3.org/2000/svg';
const COLORS = { green: '#22c55e', red: '#ef4444', yellow: '#facc15', blue: '#3b82f6', orange: '#fb923c' };
const FRET_NAMES = ['green', 'red', 'yellow', 'blue', 'orange'];
let uidCounter = 0;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function mix(hex, to, t) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const T = to === 'white' ? 255 : 0;
  return '#' + c.map((v) => Math.round(v + (T - v) * t).toString(16).padStart(2, '0')).join('');
}

function grad(defs, id, kind, attrs, stops) {
  const g = el(kind, { id, ...attrs }, defs);
  for (const [o, c, op] of stops) el('stop', { offset: o, 'stop-color': c, ...(op != null ? { 'stop-opacity': op } : {}) }, g);
  return g;
}

export function createGuitar() {
  const u = ++uidCounter;
  const id = (n) => `g${u}-${n}`;
  const url = (n) => `url(#${id(n)})`;

  const svg = el('svg', { viewBox: '0 0 960 340', class: 'guitar', role: 'img', 'aria-label': 'Les Paul style guitar controller' });
  const defs = el('defs', {}, svg);

  // ---- gradients / filters
  grad(defs, id('sun'), 'radialGradient', { cx: 250, cy: 176, r: 240, gradientUnits: 'userSpaceOnUse' },
    [[0, '#f7b53a'], [0.28, '#e0721d'], [0.62, '#a3220f'], [0.88, '#5a0f08'], [1, '#2c0604']]);
  grad(defs, id('gloss'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fff', 0.28], [0.42, '#fff', 0.04], [0.5, '#fff', 0], [1, '#000', 0.22]]);
  grad(defs, id('chrome'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fbfcfe'], [0.45, '#b9c0cf'], [0.55, '#8d95a8'], [1, '#d7dce6']]);
  grad(defs, id('chromeH'), 'linearGradient', { x1: 0, y1: 0, x2: 1, y2: 0 },
    [[0, '#e8ebf2'], [0.35, '#fbfcfe'], [0.65, '#a9b1c3'], [1, '#d3d8e3']]);
  grad(defs, id('gold'), 'radialGradient', { cx: 0.38, cy: 0.35, r: 0.8 },
    [[0, '#fff1b8'], [0.45, '#d9a93a'], [1, '#7d5612']]);
  grad(defs, id('cream'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fbf3dc'], [1, '#d9c9a0']]);
  grad(defs, id('rose'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#3b2218'], [0.5, '#2a160f'], [1, '#1d0f0a']]);
  grad(defs, id('maple'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#f0dcae'], [1, '#c8aa6c']]);
  grad(defs, id('head'), 'linearGradient', { x1: 0, y1: 0, x2: 1, y2: 1 },
    [[0, '#2a2220'], [1, '#0e0b0a']]);
  grad(defs, id('rubber'), 'radialGradient', { cx: 0.4, cy: 0.35, r: 0.8 },
    [[0, '#3a3f4d'], [1, '#0c0e14']]);
  grad(defs, id('dial'), 'radialGradient', { cx: 0.5, cy: 0.4, r: 0.8 },
    [[0, '#202638'], [1, '#0a0d15']]);
  for (const n of FRET_NAMES) {
    const c = COLORS[n];
    grad(defs, id('cap-' + n), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
      [[0, mix(c, 'white', 0.35)], [0.5, c], [1, mix(c, 'black', 0.3)]]);
  }
  const sh = el('filter', { id: id('shadow'), x: '-10%', y: '-10%', width: '125%', height: '135%' }, defs);
  el('feDropShadow', { dx: 0, dy: 10, stdDeviation: 9, 'flood-color': '#000', 'flood-opacity': 0.5 }, sh);
  const sh2 = el('filter', { id: id('shadowS'), x: '-30%', y: '-30%', width: '170%', height: '170%' }, defs);
  el('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2, 'flood-color': '#000', 'flood-opacity': 0.55 }, sh2);

  const parts = {};
  const part = (name, color) => {
    const g = el('g', { class: 'part', style: `--c:${color}` }, svg);
    parts[name] = g;
    return g;
  };
  const ring = (g, x, y, w, h, rx) => el('rect', { class: 'focus-ring', x: x - 5, y: y - 5, width: w + 10, height: h + 10, rx: rx + 4 }, g);

  // ---- neck (drawn first; the body overlaps its root)
  const neck = el('g', {}, svg);
  el('path', { d: 'M836,142 L896,133 Q944,126 950,152 L950,188 Q944,214 896,207 L836,198 Z', fill: url('head'), stroke: '#efe3c4', 'stroke-width': 3, 'stroke-linejoin': 'round', filter: `url(#${id('shadowS')})` }, neck);
  const t = el('text', { x: 898, y: 177, class: 'g-logo', 'text-anchor': 'middle' }, neck);
  t.textContent = 'YACC';
  for (const [x, y, d] of [[868, 128, -1], [896, 125, -1], [924, 126, -1], [868, 212, 1], [896, 215, 1], [924, 214, 1]]) {
    el('line', { x1: x, y1: y, x2: x, y2: y + d * 9, stroke: '#9aa3b5', 'stroke-width': 3, 'stroke-linecap': 'round' }, neck);
    el('circle', { cx: x, cy: y, r: 7, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1 }, neck);
    el('circle', { cx: x, cy: y, r: 2.6, fill: '#58617a' }, neck);
  }
  el('rect', { x: 372, y: 134, width: 470, height: 72, rx: 8, fill: url('maple'), stroke: '#a68d56', 'stroke-width': 1.5, filter: `url(#${id('shadowS')})` }, neck);
  el('rect', { x: 372, y: 141, width: 466, height: 58, fill: url('rose') }, neck);
  el('rect', { x: 372, y: 141, width: 466, height: 6, fill: '#000', opacity: 0.35 }, neck);
  el('rect', { x: 832, y: 141, width: 7, height: 58, fill: url('cream') }, neck);
  for (let x = 436, i = 0; x < 826; x += 36, i++) {
    el('line', { x1: x, y1: 141, x2: x, y2: 199, stroke: '#c9ced9', 'stroke-width': 2.2 }, neck);
    el('line', { x1: x + 1.5, y1: 141, x2: x + 1.5, y2: 199, stroke: '#fff', 'stroke-width': 0.7, opacity: 0.45 }, neck);
  }
  // trapezoid inlays, clear of the fret buttons
  for (const x of [452, 776, 812]) el('path', { d: `M${x - 8},163 L${x + 8},165 L${x + 8},175 L${x - 8},177 Z`, fill: '#f3ead0', opacity: 0.9 }, neck);

  // ---- body
  const body = 'M66,176 C54,112 98,58 172,50 C222,45 252,64 290,72 C326,80 356,62 384,48 C396,43 410,52 412,66 L414,138 L414,202 C412,236 396,262 360,282 C310,306 230,308 170,296 C100,282 72,236 66,176 Z';
  const b = el('g', { filter: url('shadow') }, svg);
  el('path', { d: body, fill: url('sun'), stroke: '#f1e6c8', 'stroke-width': 7, 'stroke-linejoin': 'round' }, b);
  el('path', { d: body, fill: 'none', stroke: '#2b0f08', 'stroke-width': 1, opacity: 0.8 }, b);
  el('path', { d: body, fill: url('gloss') }, b);
  // flame-ish figuring
  const fig = el('g', { opacity: 0.1, stroke: '#fff', fill: 'none', 'stroke-width': 1.2 }, b);
  for (let i = 0; i < 9; i++) el('path', { d: `M${90 + i * 32},${70 + (i % 3) * 12} C${120 + i * 32},150 ${70 + i * 32},210 ${110 + i * 32},290` }, fig);
  // neck joint highlight
  el('rect', { x: 408, y: 138, width: 6, height: 64, fill: '#f1e6c8' }, svg);

  // ---- humbuckers
  const pickup = (x, y0, y1) => {
    const g = el('g', { filter: url('shadowS') }, svg);
    el('rect', { x, y: y0, width: 26, height: y1 - y0, rx: 5, fill: url('cream'), stroke: '#a4936a', 'stroke-width': 1 }, g);
    for (const cx of [x + 8, x + 18]) {
      el('rect', { x: cx - 3.5, y: y0 + 6, width: 7, height: y1 - y0 - 12, rx: 3, fill: '#120d0a' }, g);
      const n = 6;
      for (let i = 0; i < n; i++) el('circle', { cx, cy: y0 + 14 + (i * (y1 - y0 - 28)) / (n - 1), r: 2.1, fill: '#c9b27a' }, g);
    }
  };
  pickup(362, 126, 214);
  pickup(320, 124, 216);

  // toggle switch on the horn
  const tg = el('g', { filter: url('shadowS') }, svg);
  el('circle', { cx: 376, cy: 100, r: 8, fill: url('chrome'), stroke: '#6a7287', 'stroke-width': 1 }, tg);
  el('rect', { x: 373, y: 84, width: 6, height: 18, rx: 3, fill: url('chrome'), stroke: '#6a7287', 'stroke-width': 0.8 }, tg);
  el('circle', { cx: 376, cy: 83, r: 4.2, fill: '#f6edd1', stroke: '#b3a375', 'stroke-width': 0.8 }, tg);

  // gold control knobs
  [[236, 262], [272, 270], [308, 272], [344, 264]].forEach(([x, y], i) => {
    const g = el('g', { filter: url('shadowS') }, svg);
    el('circle', { cx: x, cy: y, r: 14, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1.2 }, g);
    el('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: '#5f420e', 'stroke-width': 0.8, opacity: 0.6 }, g);
    const a = (-60 + i * 25) * Math.PI / 180;
    el('line', { x1: x + Math.cos(a) * 3, y1: y + Math.sin(a) * 3, x2: x + Math.cos(a) * 12, y2: y + Math.sin(a) * 12, stroke: '#3a2808', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
  });

  // ---- strum bar (up / down halves) in a black bezel
  el('rect', { x: 246, y: 112, width: 64, height: 112, rx: 14, fill: '#0e0f14', stroke: '#2a2d3a', 'stroke-width': 1.5, filter: url('shadowS') }, svg);
  const strum = (name, x, glyph) => {
    const g = part(name, '#7c8cff');
    el('rect', { class: 'plate', x, y: 118, width: 26, height: 100, rx: 8, fill: url('chromeH'), stroke: '#5b6477', 'stroke-width': 1 }, g);
    for (const yy of [132, 142, 194, 204]) el('line', { x1: x + 5, y1: yy, x2: x + 21, y2: yy, stroke: '#7d8599', 'stroke-width': 1.1, opacity: 0.7 }, g);
    el('rect', { class: 'litcap', x, y: 118, width: 26, height: 100, rx: 8 }, g);
    el('path', { class: 'glyph', d: glyph }, g);
    ring(g, x, 118, 26, 100, 8);
  };
  strum('strumDown', 250, 'M263,159 L255,168 L263,177');
  strum('strumUp', 280, 'M289,159 L297,168 L289,177');

  // ---- star power & plus: black buttons in chrome rings
  const round = (name, cx, cy, color, glyphEl) => {
    const g = part(name, color);
    el('circle', { cx, cy, r: 21, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1, filter: url('shadowS') }, g);
    el('circle', { cx, cy, r: 16, fill: url('rubber'), stroke: '#05070b', 'stroke-width': 1.5 }, g);
    el('circle', { class: 'litcap', cx, cy, r: 16 }, g);
    glyphEl(g);
    el('circle', { class: 'focus-ring', cx, cy, r: 27 }, g);
  };
  round('star', 190, 126, '#facc15', (g) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.8 : 10;
      pts.push((190 + r * Math.cos(a)).toFixed(1) + ',' + (126 + r * Math.sin(a)).toFixed(1));
    }
    el('polygon', { class: 'glyph light fill', points: pts.join(' ') }, g);
  });
  round('plus', 190, 214, '#38e1c6', (g) => el('path', { class: 'glyph light', d: 'M182,214 H198 M190,206 V222' }, g));

  // ---- fret buttons (green nearest the headstock, like the real thing)
  FRET_NAMES.forEach((n, i) => {
    const cx = 722 - i * 46, x = cx - 17, y = 147, w = 34, h = 46;
    const g = part(n, COLORS[n]);
    el('rect', { x: cx - 21, y: y - 3, width: 42, height: h + 6, rx: 12, fill: '#0b0c10', stroke: '#2a2d3a', 'stroke-width': 1.2 }, g);
    el('rect', { class: 'fretcap', x, y, width: w, height: h, rx: 9, fill: url('cap-' + n) }, g);
    el('rect', { x: x + 3, y: y + 3, width: w - 6, height: 12, rx: 6, fill: '#fff', opacity: 0.28 }, g);
    for (const yy of [y + 21, y + 26, y + 31]) el('line', { x1: x + 8, y1: yy, x2: x + w - 8, y2: yy, stroke: '#000', 'stroke-width': 1.2, opacity: 0.22, 'stroke-linecap': 'round' }, g);
    ring(g, cx - 21, y - 3, 42, h + 6, 12);
  });

  // ---- tilt dial
  const tilt = part('tilt', '#38e1c6');
  const tx = 630, ty = 72;
  el('circle', { cx: tx, cy: ty, r: 26, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1, filter: url('shadowS') }, tilt);
  el('circle', { cx: tx, cy: ty, r: 21, fill: url('dial') }, tilt);
  el('circle', { class: 'litcap', cx: tx, cy: ty, r: 21, opacity: 0 }, tilt);
  for (let a = -60; a <= 60; a += 20) {
    const r = (a - 90) * Math.PI / 180;
    el('line', { x1: tx + Math.cos(r) * 15, y1: ty + Math.sin(r) * 15, x2: tx + Math.cos(r) * 19, y2: ty + Math.sin(r) * 19, stroke: '#6b7694', 'stroke-width': 1.2 }, tilt);
  }
  const needleBase = el('g', { transform: `translate(${tx} ${ty})` }, tilt);
  const needle = el('g', { class: 'needle' }, needleBase);
  el('line', { x1: 0, y1: 3, x2: 0, y2: -17, stroke: '#38e1c6', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, needle);
  el('circle', { cx: tx, cy: ty, r: 3.5, fill: '#e8ebf2' }, tilt);
  el('circle', { class: 'focus-ring', cx: tx, cy: ty, r: 33 }, tilt);

  // ---- whammy bar: pivots at the bottom-left of the body
  const px = 140, py = 258, rest = 112, sweep = 48;
  const wh = el('g', {}, svg);
  parts.whammy = wh;
  el('path', { class: 'wh-track', d: 'M128.8,285.8 A30,30 0 0 1 111.8,268.3', pathLength: 100 }, wh);
  const fill = el('path', { class: 'wh-fill', d: 'M128.8,285.8 A30,30 0 0 1 111.8,268.3', pathLength: 100, 'stroke-dasharray': '0 100' }, wh);
  const arm = el('g', { transform: `translate(${px} ${py}) rotate(${rest})` }, wh);
  el('rect', { x: 0, y: -4.5, width: 72, height: 9, rx: 4.5, fill: url('chromeH'), stroke: '#5b6477', 'stroke-width': 1, filter: url('shadowS') }, arm);
  el('circle', { cx: 74, cy: 0, r: 8, fill: url('rubber'), stroke: '#b9c0cf', 'stroke-width': 2 }, arm);
  el('circle', { cx: px, cy: py, r: 13, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1, filter: url('shadowS') }, wh);
  el('circle', { cx: px, cy: py, r: 5, fill: '#59627a' }, wh);
  el('circle', { class: 'focus-ring', cx: px, cy: py, r: 44 }, wh);

  // ---- labels
  const label = (x, y, txt, cls = 'g-label') => { const e = el('text', { class: cls, x, y }, svg); e.textContent = txt; };
  label(190, 160, 'Star power', 'g-label body'); label(190, 252, 'Plus', 'g-label body');
  label(278, 104, 'Strum', 'g-label body'); label(140, 232, 'Whammy', 'g-label body');
  label(630, 112, 'Tilt'); label(630, 232, 'Frets');

  const needleSet = (on) => { needle.style.transform = on ? 'rotate(-38deg)' : 'rotate(0deg)'; };

  return {
    el: svg,
    setPressed(name, on) { parts[name]?.classList.toggle('on', !!on); },
    setMapped(name, on) { parts[name]?.classList.toggle('mapped', !!on); },
    setFocus(names) { for (const [k, g] of Object.entries(parts)) g.classList.toggle('focus', names.includes(k)); },
    setWhammy(v) {
      const x = Math.min(1, Math.max(0, +v || 0));
      arm.setAttribute('transform', `translate(${px} ${py}) rotate(${(rest + sweep * x).toFixed(1)})`);
      fill.setAttribute('stroke-dasharray', `${(x * 100).toFixed(1)} 100`);
    },
    setTilt(on) { needleSet(!!on); parts.tilt.classList.toggle('on', !!on); },
  };
}

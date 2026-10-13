// Gibson Les Paul style Guitar Hero controller, drawn as inline SVG (neck to the right).
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

  const svg = el('svg', { viewBox: '0 0 1100 340', class: 'guitar', role: 'img', 'aria-label': 'Les Paul style guitar controller' });
  const defs = el('defs', {}, svg);

  // ---- gradients / filters
  grad(defs, id('sun'), 'radialGradient', { cx: 240, cy: 176, r: 250, gradientUnits: 'userSpaceOnUse' },
    [[0, '#7fb2ff'], [0.26, '#3d63ff'], [0.58, '#4a22b8'], [0.86, '#1b0c66'], [1, '#090530']]);
  grad(defs, id('gloss'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fff', 0.26], [0.4, '#fff', 0.04], [0.5, '#fff', 0], [1, '#000', 0.24]]);
  grad(defs, id('chrome'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fbfcfe'], [0.45, '#b9c0cf'], [0.55, '#8d95a8'], [1, '#d7dce6']]);
  grad(defs, id('cream'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fbf5e2'], [1, '#dccfa8']]);
  grad(defs, id('gold'), 'radialGradient', { cx: 0.38, cy: 0.35, r: 0.8 },
    [[0, '#fff1b8'], [0.45, '#d9a93a'], [1, '#7d5612']]);
  grad(defs, id('neck'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#2a2b33'], [0.12, '#1b1c22'], [0.88, '#131418'], [1, '#0b0b0e']]);
  grad(defs, id('head'), 'linearGradient', { x1: 0, y1: 0, x2: 1, y2: 1 },
    [[0, '#2b2c34'], [1, '#101116']]);
  grad(defs, id('rubber'), 'radialGradient', { cx: 0.4, cy: 0.35, r: 0.8 },
    [[0, '#3a3f4d'], [1, '#0c0e14']]);
  grad(defs, id('dial'), 'radialGradient', { cx: 0.5, cy: 0.4, r: 0.8 },
    [[0, '#202638'], [1, '#0a0d15']]);
  const capGrads = {};
  for (const n of FRET_NAMES) {
    const c = COLORS[n];
    capGrads[n] = grad(defs, id('cap-' + n), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
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
  const shadowS = `url(#${id('shadowS')})`;

  // ================= neck + headstock (drawn first; the body overlaps its root)
  const neck = el('g', {}, svg);
  el('path', { d: 'M958,146 L1012,138 Q1062,128 1076,158 L1076,182 Q1062,212 1012,202 L958,194 Z', fill: url('head'), stroke: '#08080b', 'stroke-width': 2, 'stroke-linejoin': 'round', filter: shadowS }, neck);
  el('path', { d: 'M966,150 L1012,143 Q1052,135 1066,160', fill: 'none', stroke: '#fff', 'stroke-width': 1, opacity: 0.12 }, neck);
  const lg = el('text', { x: 1040, y: 177, class: 'g-logo', 'text-anchor': 'middle' }, neck);
  lg.textContent = 'YACC';
  for (const [x, y, d] of [[1002, 128, -1], [1028, 124, -1], [1054, 126, -1], [1002, 212, 1], [1028, 216, 1], [1054, 214, 1]]) {
    el('line', { x1: x, y1: y, x2: x, y2: y + d * 9, stroke: '#b99434', 'stroke-width': 3, 'stroke-linecap': 'round' }, neck);
    el('circle', { cx: x, cy: y, r: 7, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1 }, neck);
    el('circle', { cx: x, cy: y, r: 2.4, fill: '#6b4b10' }, neck);
  }
  // black neck with ridges between the body and the buttons
  el('rect', { x: 380, y: 136, width: 584, height: 68, rx: 6, fill: url('neck'), stroke: '#07070a', 'stroke-width': 1.5, filter: shadowS }, neck);
  el('rect', { x: 380, y: 138, width: 584, height: 3, fill: '#fff', opacity: 0.1 }, neck);
  for (let x = 452; x < 700; x += 26) {
    el('line', { x1: x, y1: 142, x2: x, y2: 198, stroke: '#000', 'stroke-width': 2.2, opacity: 0.75 }, neck);
    el('line', { x1: x + 2, y1: 142, x2: x + 2, y2: 198, stroke: '#fff', 'stroke-width': 0.8, opacity: 0.1 }, neck);
  }
  el('rect', { x: 950, y: 140, width: 10, height: 60, fill: '#0a0a0d' }, neck);

  // ================= body
  const body = 'M66,176 C54,112 98,58 172,50 C222,45 252,64 290,72 C326,80 356,62 384,48 C396,43 410,52 412,66 L414,138 L414,202 C412,236 396,262 360,282 C310,306 230,308 170,296 C100,282 72,236 66,176 Z';
  const b = el('g', { filter: url('shadow') }, svg);
  el('path', { d: body, fill: url('sun'), stroke: '#f3ead0', 'stroke-width': 7, 'stroke-linejoin': 'round' }, b);
  el('path', { d: body, fill: 'none', stroke: '#1a1030', 'stroke-width': 1, opacity: 0.8 }, b);
  el('path', { d: body, fill: url('gloss') }, b);
  const fig = el('g', { opacity: 0.1, stroke: '#fff', fill: 'none', 'stroke-width': 1.2 }, b);
  for (let i = 0; i < 9; i++) el('path', { d: `M${90 + i * 32},${70 + (i % 3) * 12} C${120 + i * 32},150 ${70 + i * 32},210 ${110 + i * 32},290` }, fig);

  // neck plate screwed onto the body
  const plate = el('g', { filter: shadowS }, svg);
  el('rect', { x: 384, y: 128, width: 46, height: 84, rx: 5, fill: '#16171c', stroke: '#050507', 'stroke-width': 1.5 }, plate);
  for (const [x, y] of [[394, 138], [394, 202], [420, 138], [420, 202]]) {
    el('circle', { cx: x, cy: y, r: 3.6, fill: url('chrome'), stroke: '#555d70', 'stroke-width': 0.8 }, plate);
    el('line', { x1: x - 2, y1: y, x2: x + 2, y2: y, stroke: '#4a5166', 'stroke-width': 0.9 }, plate);
  }

  // cream pickup plate that frames the strum slot
  const pp = el('g', { filter: shadowS }, svg);
  el('rect', { x: 184, y: 132, width: 170, height: 76, rx: 10, fill: url('cream'), stroke: '#a89a70', 'stroke-width': 1.2 }, pp);
  for (const [x, y] of [[196, 142], [196, 198], [342, 142], [342, 198]]) el('circle', { cx: x, cy: y, r: 3, fill: '#b9a97a' }, pp);
  el('rect', { x: 198, y: 150, width: 142, height: 40, rx: 14, fill: '#0c0d12', stroke: '#8e8160', 'stroke-width': 1.2 }, pp);

  // toggle switch on the horn
  const tg = el('g', { filter: shadowS }, svg);
  el('circle', { cx: 372, cy: 98, r: 9, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1 }, tg);
  el('rect', { x: 369, y: 82, width: 6, height: 18, rx: 3, fill: url('chrome'), stroke: '#6a7287', 'stroke-width': 0.8 }, tg);
  el('circle', { cx: 372, cy: 81, r: 4.2, fill: '#f6edd1', stroke: '#b3a375', 'stroke-width': 0.8 }, tg);

  // bridge block at the butt end
  const br = el('g', { filter: shadowS }, svg);
  el('rect', { x: 84, y: 138, width: 30, height: 64, rx: 5, fill: url('cream'), stroke: '#a89a70', 'stroke-width': 1 }, br);
  for (let i = 0; i < 6; i++) el('circle', { cx: 99, cy: 148 + i * 10.4, r: 3.3, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 0.6 }, br);

  // gold control knobs on the lower bout
  [[330, 268], [366, 258]].forEach(([x, y], i) => {
    const g = el('g', { filter: shadowS }, svg);
    el('circle', { cx: x, cy: y, r: 14, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1.2 }, g);
    el('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: '#5f420e', 'stroke-width': 0.8, opacity: 0.6 }, g);
    const a = (-50 + i * 40) * Math.PI / 180;
    el('line', { x1: x + Math.cos(a) * 3, y1: y + Math.sin(a) * 3, x2: x + Math.cos(a) * 12, y2: y + Math.sin(a) * 12, stroke: '#3a2808', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
  });

  // ================= strum bar: one long bar in the slot, split in a down (butt) and an up (neck) half
  const strum = (name, x, glyph) => {
    const g = part(name, '#7c8cff');
    el('rect', { class: 'plate', x, y: 153, width: 68, height: 34, rx: 13, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1 }, g);
    for (const xx of [x + 10, x + 16, x + 52, x + 58]) el('line', { x1: xx, y1: 160, x2: xx, y2: 180, stroke: '#7d8599', 'stroke-width': 1.1, opacity: 0.65 }, g);
    el('rect', { class: 'litcap', x, y: 153, width: 68, height: 34, rx: 13 }, g);
    el('path', { class: 'glyph', d: glyph }, g);
    ring(g, x, 153, 68, 34, 13);
  };
  strum('strumDown', 202, 'M242,162 L233,170 L242,178');   // points toward the butt
  strum('strumUp', 272, 'M302,162 L311,170 L302,178');      // points toward the neck

  // ================= star power & plus: gold-ringed buttons
  const round = (name, cx, cy, color, glyphEl) => {
    const g = part(name, color);
    el('circle', { cx, cy, r: 21, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1, filter: shadowS }, g);
    el('circle', { cx, cy, r: 16, fill: url('rubber'), stroke: '#05070b', 'stroke-width': 1.5 }, g);
    el('circle', { class: 'litcap', cx, cy, r: 16 }, g);
    glyphEl(g);
    el('circle', { class: 'focus-ring', cx, cy, r: 27 }, g);
  };
  round('star', 148, 104, '#facc15', (g) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.8 : 10;
      pts.push((148 + r * Math.cos(a)).toFixed(1) + ',' + (104 + r * Math.sin(a)).toFixed(1));
    }
    el('polygon', { class: 'glyph light fill', points: pts.join(' ') }, g);
  });
  round('plus', 148, 238, '#38e1c6', (g) => el('path', { class: 'glyph light', d: 'M140,238 H156 M148,230 V246' }, g));

  // ================= fret buttons, up near the headstock; green is nearest the headstock
  FRET_NAMES.forEach((n, i) => {
    const cx = 912 - i * 44, w = 30, h = 46, x = cx - 15, y = 147;
    const g = part(n, COLORS[n]);
    el('rect', { x: cx - 19, y: y - 4, width: 38, height: h + 8, rx: 10, fill: '#050507', opacity: 0.85 }, g);
    // flat on the body side, rounded on the headstock side (D shape, like the real buttons)
    const d = `M${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + w - 15},${y} Q${x + w},${y} ${x + w},${y + 15} L${x + w},${y + h - 15} Q${x + w},${y + h} ${x + w - 15},${y + h} L${x + 4},${y + h} Q${x},${y + h} ${x},${y + h - 4} Z`;
    el('path', { class: 'fretcap', d, fill: url('cap-' + n) }, g);
    el('path', { d: `M${x + 3},${y + 5} L${x + w - 14},${y + 5} Q${x + w - 6},${y + 5} ${x + w - 5},${y + 14} L${x + w - 5},${y + 18} L${x + 3},${y + 18} Z`, fill: '#fff', opacity: 0.22 }, g);
    ring(g, cx - 19, y - 4, 38, h + 8, 10);
  });

  // ================= tilt dial
  const tilt = part('tilt', '#38e1c6');
  const tx = 810, ty = 76;
  el('circle', { cx: tx, cy: ty, r: 26, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1, filter: shadowS }, tilt);
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

  // ================= whammy arm: own base plate on the lower bout, arm points toward the neck
  const px = 196, py = 262, rest = -6, sweep = -26, len = 86;
  const wh = el('g', {}, svg);
  parts.whammy = wh;
  el('rect', { x: 172, y: 244, width: 48, height: 36, rx: 6, fill: '#101116', stroke: '#050507', 'stroke-width': 1.2, filter: shadowS }, wh);
  const arcA = rest * Math.PI / 180, arcB = (rest + sweep) * Math.PI / 180, ar = 48;
  const arc = `M${(px + ar * Math.cos(arcA)).toFixed(1)},${(py + ar * Math.sin(arcA)).toFixed(1)} A${ar},${ar} 0 0 0 ${(px + ar * Math.cos(arcB)).toFixed(1)},${(py + ar * Math.sin(arcB)).toFixed(1)}`;
  el('path', { class: 'wh-track', d: arc, pathLength: 100 }, wh);
  const fill = el('path', { class: 'wh-fill', d: arc, pathLength: 100, 'stroke-dasharray': '0 100' }, wh);
  const arm = el('g', { transform: `translate(${px} ${py}) rotate(${rest})` }, wh);
  el('rect', { x: 0, y: -3.5, width: len, height: 7, rx: 3.5, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1, filter: shadowS }, arm);
  el('circle', { cx: len + 2, cy: 0, r: 8, fill: url('rubber'), stroke: '#b9c0cf', 'stroke-width': 2 }, arm);
  el('circle', { cx: px, cy: py, r: 11, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1, filter: shadowS }, wh);
  el('circle', { cx: px, cy: py, r: 4, fill: '#4a3410' }, wh);
  el('circle', { class: 'focus-ring', cx: px + 40, cy: py - 16, r: 64 }, wh);

  // ================= labels
  const label = (x, y, txt, cls = 'g-label') => { const e = el('text', { class: cls, x, y }, svg); e.textContent = txt; };
  label(148, 136, 'Star power', 'g-label body'); label(148, 270, 'Plus', 'g-label body');
  label(269, 124, 'Strum', 'g-label body'); label(196, 296, 'Whammy', 'g-label body');
  label(810, 116, 'Tilt'); label(826, 232, 'Frets');

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
    setFretColors(cols) {
      FRET_NAMES.forEach((n, i) => {
        const c = cols[i] || COLORS[n];
        const st = capGrads[n].children;
        st[0].setAttribute('stop-color', mix(c, 'white', 0.35));
        st[1].setAttribute('stop-color', c);
        st[2].setAttribute('stop-color', mix(c, 'black', 0.3));
        parts[n].style.setProperty('--c', c);
      });
    },
    setTilt(on) { needleSet(!!on); parts.tilt.classList.toggle('on', !!on); },
  };
}

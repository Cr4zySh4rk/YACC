// Gibson Les Paul style Guitar Hero controller, drawn as inline SVG, standing upright (neck up).
// The artwork is authored lying down (neck pointing +x) and rotated into place, so every
// coordinate below is in that "local" space; labels live outside the rotation.
// Every control can be lit up live (pressed), marked as mapped, or focused (dashed ring).
const NS = 'http://www.w3.org/2000/svg';
const COLORS = { green: '#22c55e', red: '#ef4444', yellow: '#facc15', blue: '#3b82f6', orange: '#fb923c' };
const FRET_NAMES = ['green', 'red', 'yellow', 'blue', 'orange'];
const VIEW_W = 480, VIEW_H = 1000;
const OX = 70, OY = 1030;
const NECK_SHIFT = -60;                          // pulls the neck closer so body and neck are balanced                       // device X = OX + y, device Y = OY - x
const P = (x, y) => [OX + y, OY - x];
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

  const svg = el('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, class: 'guitar', role: 'img', 'aria-label': 'Les Paul style guitar controller' });
  const defs = el('defs', {}, svg);

  // ---- gradients / filters (local space: +x = towards the headstock = up on screen)
  grad(defs, id('sun'), 'radialGradient', { cx: 200, cy: 170, r: 260, gradientUnits: 'userSpaceOnUse' },
    [[0, '#4f7dff'], [0.35, '#2f54e6'], [0.7, '#2036a8'], [1, '#121c66']]);
  grad(defs, id('gloss'), 'linearGradient', { x1: 1, y1: 0, x2: 0, y2: 0 },
    [[0, '#fff', 0.2], [0.3, '#fff', 0.03], [0.5, '#fff', 0], [1, '#000', 0.22]]);
  grad(defs, id('chrome'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fbfcfe'], [0.45, '#b9c0cf'], [0.55, '#8d95a8'], [1, '#d7dce6']]);
  grad(defs, id('cream'), 'linearGradient', { x1: 1, y1: 0, x2: 0, y2: 0 },
    [[0, '#fbf5e2'], [1, '#d9cca4']]);
  grad(defs, id('gold'), 'radialGradient', { cx: 0.38, cy: 0.35, r: 0.8 },
    [[0, '#fff1b8'], [0.45, '#d9a93a'], [1, '#7d5612']]);
  grad(defs, id('neck'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#2a2b33'], [0.12, '#1b1c22'], [0.88, '#131418'], [1, '#0b0b0e']]);
  grad(defs, id('head'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#2b2c34'], [1, '#101116']]);
  grad(defs, id('rubber'), 'radialGradient', { cx: 0.4, cy: 0.35, r: 0.8 },
    [[0, '#3a3f4d'], [1, '#0c0e14']]);
  grad(defs, id('dial'), 'radialGradient', { cx: 0.5, cy: 0.4, r: 0.8 },
    [[0, '#202638'], [1, '#0a0d15']]);
  const capGrads = {};
  for (const n of FRET_NAMES) {
    const c = COLORS[n];
    capGrads[n] = grad(defs, id('cap-' + n), 'linearGradient', { x1: 1, y1: 0, x2: 0, y2: 0 },
      [[0, mix(c, 'white', 0.35)], [0.5, c], [1, mix(c, 'black', 0.3)]]);
  }
  const sh = el('filter', { id: id('shadow'), x: '-15%', y: '-10%', width: '135%', height: '125%' }, defs);
  el('feDropShadow', { dx: -12, dy: 4, stdDeviation: 9, 'flood-color': '#000', 'flood-opacity': 0.5 }, sh);
  const sh2 = el('filter', { id: id('shadowS'), x: '-30%', y: '-30%', width: '170%', height: '170%' }, defs);
  el('feDropShadow', { dx: -2.5, dy: 0, stdDeviation: 2, 'flood-color': '#000', 'flood-opacity': 0.55 }, sh2);
  // fine metallic sparkle like the printed tops in the reference photos
  const gr = el('filter', { id: id('grain'), x: 0, y: 0, width: '100%', height: '100%' }, defs);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.85, numOctaves: 2, seed: 7, result: 'n' }, gr);
  el('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.2 -1.15' }, gr);
  const clip = el('clipPath', { id: id('bodyClip') }, defs);

  const parts = {};
  const root = el('g', { transform: `translate(${OX} ${OY}) rotate(-90)` }, svg);   // local (x,y) -> screen (OX+y, OY-x)
  const part = (name, color) => {
    const g = el('g', { class: 'part', style: `--c:${color}` }, root);
    parts[name] = g;
    return g;
  };
  const ring = (g, x, y, w, h, rx) => el('rect', { class: 'focus-ring', x: x - 5, y: y - 5, width: w + 10, height: h + 10, rx: rx + 4 }, g);
  const shadowS = `url(#${id('shadowS')})`;

  // ================= neck + headstock (drawn first; the body overlaps its root)
  const neck = el('g', { transform: `translate(${NECK_SHIFT} 0)` }, root);
  el('path', { d: 'M958,146 L1012,138 Q1062,128 1076,158 L1076,182 Q1062,212 1012,202 L958,194 Z', fill: url('head'), stroke: '#08080b', 'stroke-width': 2, 'stroke-linejoin': 'round', filter: shadowS }, neck);
  el('path', { d: 'M966,150 L1012,143 Q1052,135 1066,160', fill: 'none', stroke: '#fff', 'stroke-width': 1, opacity: 0.12 }, neck);
  for (const [x, y, d] of [[1002, 128, -1], [1028, 124, -1], [1054, 126, -1], [1002, 212, 1], [1028, 216, 1], [1054, 214, 1]]) {
    el('line', { x1: x, y1: y, x2: x, y2: y + d * 9, stroke: '#b99434', 'stroke-width': 3, 'stroke-linecap': 'round' }, neck);
    el('circle', { cx: x, cy: y, r: 7, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1 }, neck);
    el('circle', { cx: x, cy: y, r: 2.4, fill: '#6b4b10' }, neck);
  }
  el('rect', { x: 380, y: 136, width: 584, height: 68, rx: 6, fill: url('neck'), stroke: '#07070a', 'stroke-width': 1.5, filter: shadowS }, neck);
  el('rect', { x: 380, y: 138, width: 584, height: 3, fill: '#fff', opacity: 0.1 }, neck);
  for (let x = 452; x < 700; x += 26) {
    el('line', { x1: x, y1: 142, x2: x, y2: 198, stroke: '#000', 'stroke-width': 2.2, opacity: 0.75 }, neck);
    el('line', { x1: x + 2, y1: 142, x2: x + 2, y2: 198, stroke: '#fff', 'stroke-width': 0.8, opacity: 0.1 }, neck);
  }
  el('rect', { x: 950, y: 140, width: 10, height: 60, fill: '#0a0a0d' }, neck);

  // ================= body: single-cutaway Les Paul (horn on the right-hand side when upright)
  const body = 'M416,138 C414,112 400,86 370,72 C340,58 300,92 262,92 C224,92 200,38 150,38 C90,38 52,100 52,170 C52,240 90,302 150,302 C200,302 224,248 262,248 C304,248 350,292 410,282 C430,278 446,262 440,244 C434,228 424,214 416,202 Z';
  el('path', { d: body }, clip);
  const b = el('g', { filter: url('shadow') }, root);
  el('path', { d: body, fill: url('sun'), stroke: '#f3ead0', 'stroke-width': 7, 'stroke-linejoin': 'round' }, b);
  el('path', { d: body, fill: 'none', stroke: '#0c1240', 'stroke-width': 1, opacity: 0.8 }, b);
  const tex = el('g', { 'clip-path': url('bodyClip') }, root);
  el('rect', { x: 40, y: 30, width: 420, height: 280, fill: '#fff', filter: url('grain'), opacity: 0.35 }, tex);
  el('path', { d: body, fill: url('gloss') }, tex);
  // the S-shaped seam between the two halves of the printed top
  el('path', { d: 'M330,296 C292,262 340,222 292,190 C250,160 292,130 236,96 C210,80 214,56 232,40', fill: 'none', stroke: '#0a1050', 'stroke-width': 1.4, opacity: 0.5 }, tex);
  el('path', { d: body, fill: 'none', stroke: '#fff', 'stroke-width': 1, opacity: 0.12, transform: 'translate(-1.5 0)' }, tex);

  // neck plate screwed onto the body
  const plate = el('g', { filter: shadowS }, root);
  el('rect', { x: 384, y: 128, width: 46, height: 84, rx: 5, fill: '#16171c', stroke: '#050507', 'stroke-width': 1.5 }, plate);
  for (const [x, y] of [[394, 138], [394, 202], [420, 138], [420, 202]]) {
    el('circle', { cx: x, cy: y, r: 3.6, fill: url('chrome'), stroke: '#555d70', 'stroke-width': 0.8 }, plate);
    el('line', { x1: x - 2, y1: y, x2: x + 2, y2: y, stroke: '#4a5166', 'stroke-width': 0.9 }, plate);
  }

  // strum slot with a cream bezel, offset to the bass side like the real thing
  const pp = el('g', { filter: shadowS }, root);
  el('rect', { x: 222, y: 116, width: 156, height: 62, rx: 16, fill: url('cream'), stroke: '#a89a70', 'stroke-width': 1.2 }, pp);
  el('rect', { x: 232, y: 126, width: 136, height: 42, rx: 12, fill: '#0b0c11', stroke: '#8e8160', 'stroke-width': 1.2 }, pp);

  // ================= strum bar: one bar in the slot, split in a down (butt) and an up (neck) half
  const strum = (name, x, glyph) => {
    const g = part(name, '#7c8cff');
    el('rect', { class: 'plate', x, y: 130, width: 64, height: 34, rx: 13, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1 }, g);
    for (const xx of [x + 10, x + 16, x + 48, x + 54]) el('line', { x1: xx, y1: 137, x2: xx, y2: 157, stroke: '#7d8599', 'stroke-width': 1.1, opacity: 0.65 }, g);
    el('rect', { class: 'litcap', x, y: 130, width: 64, height: 34, rx: 13 }, g);
    el('path', { class: 'glyph', d: glyph }, g);
    ring(g, x, 130, 64, 34, 13);
  };
  strum('strumDown', 236, 'M274,139 L265,147 L274,155');   // points towards the butt
  strum('strumUp', 302, 'M334,139 L343,147 L334,155');     // points towards the neck

  // ================= whammy arm: base plate beside the slot, arm points towards the neck
  const px = 298, py = 226, rest = 5, sweep = -26, len = 112;
  const wh = el('g', {}, root);
  parts.whammy = wh;
  el('rect', { x: 270, y: 208, width: 58, height: 38, rx: 7, fill: '#0e0f14', stroke: '#050507', 'stroke-width': 1.2, filter: shadowS }, wh);
  el('rect', { x: 276, y: 214, width: 46, height: 26, rx: 5, fill: '#07080b' }, wh);
  const arcA = rest * Math.PI / 180, arcB = (rest + sweep) * Math.PI / 180, ar = 52;
  const arc = `M${(px + ar * Math.cos(arcA)).toFixed(1)},${(py + ar * Math.sin(arcA)).toFixed(1)} A${ar},${ar} 0 0 0 ${(px + ar * Math.cos(arcB)).toFixed(1)},${(py + ar * Math.sin(arcB)).toFixed(1)}`;
  el('path', { class: 'wh-track', d: arc, pathLength: 100 }, wh);
  const fill = el('path', { class: 'wh-fill', d: arc, pathLength: 100, 'stroke-dasharray': '0 100' }, wh);
  const arm = el('g', { transform: `translate(${px} ${py}) rotate(${rest})` }, wh);
  el('rect', { x: 0, y: -3, width: len, height: 6, rx: 3, fill: '#15161b', stroke: '#050507', 'stroke-width': 1, filter: shadowS }, arm);
  el('rect', { x: 0, y: -2.5, width: len, height: 1.6, rx: 0.8, fill: '#fff', opacity: 0.18 }, arm);
  el('circle', { cx: len + 2, cy: 0, r: 7, fill: url('rubber'), stroke: '#2b2e3a', 'stroke-width': 2 }, arm);
  el('circle', { cx: px, cy: py, r: 8, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1, filter: shadowS }, wh);
  el('circle', { class: 'focus-ring', cx: px + 50, cy: py - 14, r: 70 }, wh);

  // ================= star power & plus: side by side near the butt
  const round = (name, cx, cy, color, glyphEl) => {
    const g = part(name, color);
    el('circle', { cx, cy, r: 22, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1, filter: shadowS }, g);
    el('circle', { cx, cy, r: 17, fill: url('rubber'), stroke: '#05070b', 'stroke-width': 1.5 }, g);
    el('circle', { class: 'litcap', cx, cy, r: 17 }, g);
    glyphEl(g);
    el('circle', { class: 'focus-ring', cx, cy, r: 28 }, g);
  };
  round('star', 170, 214, '#facc15', (g) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5, r = i % 2 ? 4.8 : 10;     // first point towards +x = up on screen
      pts.push((170 + r * Math.cos(a)).toFixed(1) + ',' + (214 + r * Math.sin(a)).toFixed(1));
    }
    el('polygon', { class: 'glyph light fill', points: pts.join(' ') }, g);
  });
  round('plus', 170, 268, '#38e1c6', (g) => el('path', { class: 'glyph light', d: 'M162,268 H178 M170,260 V276' }, g));

  // ================= fret buttons, stacked up the neck near the headstock; green is nearest the headstock
  FRET_NAMES.forEach((n, i) => {
    const cx = 912 - i * 44, w = 30, h = 46, x = cx - 15, y = 147;
    const g = part(n, COLORS[n]);
    el('rect', { x: cx - 19, y: y - 4, width: 38, height: h + 8, rx: 10, fill: '#050507', opacity: 0.85 }, g);
    // flat on the body side, rounded towards the headstock (D shape, like the real buttons)
    const d = `M${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + w - 15},${y} Q${x + w},${y} ${x + w},${y + 15} L${x + w},${y + h - 15} Q${x + w},${y + h} ${x + w - 15},${y + h} L${x + 4},${y + h} Q${x},${y + h} ${x},${y + h - 4} Z`;
    el('path', { class: 'fretcap', d, fill: url('cap-' + n) }, g);
    el('path', { d: `M${x + w - 4},${y + 14} Q${x + w - 4},${y + 5} ${x + w - 15},${y + 5} L${x + 6},${y + 5}`, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.28 }, g);
    ring(g, cx - 19, y - 4, 38, h + 8, 10);
    g.setAttribute('transform', `translate(${NECK_SHIFT} 0)`);
  });

  // ================= tilt dial, beside the neck
  const tilt = part('tilt', '#38e1c6');
  tilt.setAttribute('transform', `translate(${NECK_SHIFT} 0)`);
  const tx = 760, ty = 76;
  el('circle', { cx: tx, cy: ty, r: 26, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1, filter: shadowS }, tilt);
  el('circle', { cx: tx, cy: ty, r: 21, fill: url('dial') }, tilt);
  el('circle', { class: 'litcap', cx: tx, cy: ty, r: 21, opacity: 0 }, tilt);
  for (let a = -60; a <= 60; a += 20) {
    const r = a * Math.PI / 180;
    el('line', { x1: tx + Math.cos(r) * 15, y1: ty + Math.sin(r) * 15, x2: tx + Math.cos(r) * 19, y2: ty + Math.sin(r) * 19, stroke: '#6b7694', 'stroke-width': 1.2 }, tilt);
  }
  const needleBase = el('g', { transform: `translate(${tx} ${ty})` }, tilt);
  const needle = el('g', { class: 'needle' }, needleBase);
  el('line', { x1: -3, y1: 0, x2: 17, y2: 0, stroke: '#38e1c6', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, needle);
  el('circle', { cx: tx, cy: ty, r: 3.5, fill: '#e8ebf2' }, tilt);
  el('circle', { class: 'focus-ring', cx: tx, cy: ty, r: 33 }, tilt);

  // ================= upright text (outside the rotation)
  const text = (x, y, txt, cls, extra = {}) => { const e = el('text', { x, y, class: cls, ...extra }, svg); e.textContent = txt; return e; };
  const [lx, ly] = P(1030 + NECK_SHIFT, 170);
  text(lx, ly + 5, 'YACC', 'g-logo up', { 'text-anchor': 'middle' });
  let [x0, y0] = P(170, 214); text(x0, y0 + 40, 'Star', 'g-label body');
  [x0, y0] = P(170, 268); text(x0, y0 + 40, 'Plus', 'g-label body');
  [x0, y0] = P(300, 147); text(x0 - 62, y0 + 4, 'Strum', 'g-label body');
  [x0, y0] = P(298, 226); text(x0 + 6, y0 + 44, 'Whammy', 'g-label body');
  [x0, y0] = P(760 + NECK_SHIFT, 76); text(x0, y0 + 46, 'Tilt', 'g-label');
  [x0, y0] = P(824 + NECK_SHIFT, 232); text(x0, y0, 'Frets', 'g-label');

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

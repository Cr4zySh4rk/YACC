// Gibson Les Paul style Guitar Hero controller, drawn as inline SVG: lying horizontally,
// body on the left, neck and headstock to the right (like a product shot).
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
  grad(defs, id('sun'), 'radialGradient', { cx: 200, cy: 170, r: 270, gradientUnits: 'userSpaceOnUse' },
    [[0, '#4f7dff'], [0.35, '#2f54e6'], [0.7, '#2036a8'], [1, '#121c66']]);
  grad(defs, id('gloss'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fff', 0.2], [0.3, '#fff', 0.03], [0.5, '#fff', 0], [1, '#000', 0.22]]);
  grad(defs, id('chrome'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fbfcfe'], [0.45, '#b9c0cf'], [0.55, '#8d95a8'], [1, '#d7dce6']]);
  grad(defs, id('cream'), 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 },
    [[0, '#fbf5e2'], [1, '#d9cca4']]);
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
      [[0, mix(c, 'white', 0.35)], [0.45, c], [1, mix(c, 'black', 0.3)]]);
  }
  const sh = el('filter', { id: id('shadow'), x: '-10%', y: '-10%', width: '125%', height: '135%' }, defs);
  el('feDropShadow', { dx: 0, dy: 10, stdDeviation: 9, 'flood-color': '#000', 'flood-opacity': 0.5 }, sh);
  const sh2 = el('filter', { id: id('shadowS'), x: '-30%', y: '-30%', width: '170%', height: '170%' }, defs);
  el('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2, 'flood-color': '#000', 'flood-opacity': 0.55 }, sh2);
  // fine metallic sparkle like the printed tops in the reference photos
  const gr = el('filter', { id: id('grain'), x: 0, y: 0, width: '100%', height: '100%' }, defs);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.85, numOctaves: 2, seed: 7, result: 'n' }, gr);
  el('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.2 -1.15' }, gr);
  const clip = el('clipPath', { id: id('bodyClip') }, defs);

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
  el('path', { d: 'M958,144 L1006,136 Q1030,124 1056,128 L1074,126 Q1084,170 1074,214 L1056,212 Q1030,216 1006,204 L958,196 Z', fill: url('head'), stroke: '#08080b', 'stroke-width': 2, 'stroke-linejoin': 'round', filter: shadowS }, neck);
  el('path', { d: 'M966,148 L1006,141 Q1030,130 1056,133', fill: 'none', stroke: '#fff', 'stroke-width': 1, opacity: 0.12 }, neck);
  for (const x of [1000, 1028, 1056]) {
    for (const y of [148, 192]) {
      el('circle', { cx: x, cy: y, r: 6.5, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1 }, neck);
      el('circle', { cx: x - 1.5, cy: y - 1.5, r: 2, fill: '#fff', opacity: 0.6 }, neck);
    }
  }
  el('rect', { x: 380, y: 136, width: 584, height: 68, rx: 6, fill: url('neck'), stroke: '#07070a', 'stroke-width': 1.5, filter: shadowS }, neck);
  el('rect', { x: 380, y: 138, width: 584, height: 3, fill: '#fff', opacity: 0.1 }, neck);
  for (let x = 452; x < 712; x += 26) {
    el('line', { x1: x, y1: 142, x2: x, y2: 198, stroke: '#000', 'stroke-width': 2.2, opacity: 0.75 }, neck);
    el('line', { x1: x + 2, y1: 142, x2: x + 2, y2: 198, stroke: '#fff', 'stroke-width': 0.8, opacity: 0.1 }, neck);
  }
  // recessed fret plate the buttons sit in
  el('rect', { x: 722, y: 139, width: 214, height: 62, rx: 6, fill: '#09090c', stroke: '#26272f', 'stroke-width': 1 }, neck);
  el('rect', { x: 950, y: 140, width: 10, height: 60, fill: '#0a0a0d' }, neck);

  // ================= body: single-cutaway Les Paul, horn under the neck
  // Two overlapping circles (big lower bout, smaller upper bout) blended at the waist, with the
  // single cutaway carved under the neck leaving a horn that points at the headstock.
  const body = 'M438,136 A104,104 0 0 0 296,75.7 C277.9,84.5 247.3,59 230,49 A140,140 0 1 0 230,291 C247.3,281 277.9,255.8 296,264.3 A104,104 0 0 0 392,260 C420,262 446,262 456,250 C446,236 424,232 420,216 C418,206 428,204 438,204 Z';
  el('path', { d: body }, clip);
  const b = el('g', { filter: url('shadow') }, svg);
  el('path', { d: body, fill: url('sun'), stroke: '#f3ead0', 'stroke-width': 7, 'stroke-linejoin': 'round' }, b);
  el('path', { d: body, fill: 'none', stroke: '#0c1240', 'stroke-width': 1, opacity: 0.8 }, b);
  const tex = el('g', { 'clip-path': url('bodyClip') }, svg);
  el('rect', { x: 40, y: 12, width: 420, height: 316, fill: '#fff', filter: url('grain'), opacity: 0.35 }, tex);
  el('path', { d: body, fill: url('gloss') }, tex);
  // the S-shaped seam between the two halves of the printed top
  el('path', { d: 'M262,60 C244,84 250,104 270,116 C312,140 262,170 300,200 C336,228 310,262 330,300', fill: 'none', stroke: '#0a1050', 'stroke-width': 1.4, opacity: 0.5 }, tex);

  // neck plate screwed onto the body
  const plate = el('g', { filter: shadowS }, svg);
  el('rect', { x: 384, y: 128, width: 46, height: 84, rx: 5, fill: '#16171c', stroke: '#050507', 'stroke-width': 1.5 }, plate);
  for (const [x, y] of [[394, 138], [394, 202], [420, 138], [420, 202]]) {
    el('circle', { cx: x, cy: y, r: 3.6, fill: url('chrome'), stroke: '#555d70', 'stroke-width': 0.8 }, plate);
    el('line', { x1: x - 2, y1: y, x2: x + 2, y2: y, stroke: '#4a5166', 'stroke-width': 0.9 }, plate);
  }

  // strum slot through the middle of the body, with a cream bezel
  const pp = el('g', { filter: shadowS }, svg);
  el('rect', { x: 222, y: 130, width: 156, height: 62, rx: 16, fill: url('cream'), stroke: '#a89a70', 'stroke-width': 1.2 }, pp);
  el('rect', { x: 232, y: 140, width: 136, height: 42, rx: 12, fill: '#0b0c11', stroke: '#8e8160', 'stroke-width': 1.2 }, pp);

  // ================= strum bar: one bar along the slot, split in a down (body side) and an up (neck side) half
  const strum = (name, x, glyph) => {
    const g = part(name, '#7c8cff');
    el('rect', { class: 'plate', x, y: 144, width: 64, height: 34, rx: 13, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1 }, g);
    for (const xx of [x + 10, x + 16, x + 48, x + 54]) el('line', { x1: xx, y1: 151, x2: xx, y2: 171, stroke: '#7d8599', 'stroke-width': 1.1, opacity: 0.65 }, g);
    el('rect', { class: 'litcap', x, y: 144, width: 64, height: 34, rx: 13 }, g);
    el('path', { class: 'glyph', d: glyph }, g);
    ring(g, x, 144, 64, 34, 13);
  };
  strum('strumDown', 236, 'M274,153 L265,161 L274,169');
  strum('strumUp', 302, 'M334,153 L343,161 L334,169');

  // ================= star power & plus, lower left like the reference
  const round = (name, cx, cy, color, glyphEl) => {
    const g = part(name, color);
    el('circle', { cx, cy, r: 21, fill: url('gold'), stroke: '#5f420e', 'stroke-width': 1, filter: shadowS }, g);
    el('circle', { cx, cy, r: 16, fill: url('rubber'), stroke: '#05070b', 'stroke-width': 1.5 }, g);
    el('circle', { class: 'litcap', cx, cy, r: 16 }, g);
    glyphEl(g);
    el('circle', { class: 'focus-ring', cx, cy, r: 27 }, g);
  };
  round('star', 152, 196, '#facc15', (g) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.6 : 10;
      pts.push((152 + r * Math.cos(a)).toFixed(1) + ',' + (196 + r * Math.sin(a)).toFixed(1));
    }
    el('polygon', { class: 'glyph light fill', points: pts.join(' ') }, g);
  });
  round('plus', 98, 230, '#38e1c6', (g) => el('path', { class: 'glyph light', d: 'M90,230 H106 M98,222 V238' }, g));

  // ================= whammy: base plate below the buttons, arm sweeps out past the lower edge
  const px = 200, py = 238, rest = 34, sweep = -22, len = 104;
  const wh = el('g', {}, svg);
  parts.whammy = wh;
  el('rect', { x: 178, y: 222, width: 46, height: 32, rx: 6, fill: '#f3ead0', stroke: '#a89a70', 'stroke-width': 1, filter: shadowS }, wh);
  el('rect', { x: 184, y: 228, width: 34, height: 20, rx: 4, fill: '#0b0c11' }, wh);
  const arcA = rest * Math.PI / 180, arcB = (rest + sweep) * Math.PI / 180, ar = 56;
  const arc = `M${(px + ar * Math.cos(arcA)).toFixed(1)},${(py + ar * Math.sin(arcA)).toFixed(1)} A${ar},${ar} 0 0 0 ${(px + ar * Math.cos(arcB)).toFixed(1)},${(py + ar * Math.sin(arcB)).toFixed(1)}`;
  el('path', { class: 'wh-track', d: arc, pathLength: 100 }, wh);
  const fill = el('path', { class: 'wh-fill', d: arc, pathLength: 100, 'stroke-dasharray': '0 100' }, wh);
  const arm = el('g', { transform: `translate(${px} ${py}) rotate(${rest})` }, wh);
  el('rect', { x: 0, y: -2.5, width: len, height: 5, rx: 2.5, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 0.8, filter: shadowS }, arm);
  el('ellipse', { cx: len + 8, cy: 0, rx: 13, ry: 6, fill: url('cream'), stroke: '#a89a70', 'stroke-width': 1 }, arm);
  el('circle', { cx: px, cy: py, r: 6, fill: url('chrome'), stroke: '#5b6477', 'stroke-width': 1 }, wh);
  el('circle', { class: 'focus-ring', cx: px + 46, cy: py + 24, r: 66 }, wh);

  // ================= fret buttons: tall pads across the neck, flat edge on top, rounded end at the bottom
  FRET_NAMES.forEach((n, i) => {
    const cx = 912 - i * 42, w = 32, h = 54, x = cx - w / 2, y = 143;
    const g = part(n, COLORS[n]);
    const d = `M${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + w - 4},${y} Q${x + w},${y} ${x + w},${y + 4} L${x + w},${y + h - 15} Q${x + w},${y + h} ${x + w - 15},${y + h} L${x + 15},${y + h} Q${x},${y + h} ${x},${y + h - 15} Z`;
    el('path', { d, fill: '#000', opacity: 0.5, transform: 'translate(0 2)' }, g);
    el('path', { class: 'fretcap', d, fill: url('cap-' + n) }, g);
    el('rect', { x: x + 4, y: y + 4, width: w - 8, height: 12, rx: 3, fill: '#fff', opacity: 0.25 }, g);
    ring(g, x, y, w, h, 8);
  });

  // ================= tilt dial above the neck
  const tilt = part('tilt', '#38e1c6');
  const tx = 600, ty = 72;
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

  // ================= labels
  const label = (x, y, txt, cls = 'g-label') => { const e = el('text', { class: cls, x, y }, svg); e.textContent = txt; };
  const logo = el('text', { x: 1030, y: 176, class: 'g-logo', 'text-anchor': 'middle' }, svg);
  logo.textContent = 'YAGCC';
  label(152, 166, 'Star power', 'g-label body'); label(98, 266, 'Plus', 'g-label body');
  label(300, 122, 'Strum', 'g-label body'); label(176, 276, 'Whammy', 'g-label body');
  label(600, 114, 'Tilt'); label(828, 222, 'Frets');

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

// Stylised top-down guitar drawn as inline SVG; every control can be lit up live.
const NS = 'http://www.w3.org/2000/svg';
const COLORS = { green: '#22c55e', red: '#ef4444', yellow: '#facc15', blue: '#3b82f6', orange: '#fb923c' };
const FRET_NAMES = ['green', 'red', 'yellow', 'blue', 'orange'];

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function createGuitar() {
  const svg = el('svg', { viewBox: '0 0 780 320', class: 'guitar', role: 'img', 'aria-label': 'Guitar controller' });
  const defs = el('defs', {}, svg);
  const g1 = el('linearGradient', { id: 'gBody', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#232b42' }, g1);
  el('stop', { offset: 1, 'stop-color': '#121725' }, g1);
  const g2 = el('linearGradient', { id: 'gWhammy', x1: 0, y1: 1, x2: 0, y2: 0 }, defs);
  el('stop', { offset: 0, 'stop-color': '#7c8cff' }, g2);
  el('stop', { offset: 1, 'stop-color': '#38e1c6' }, g2);

  // body, neck, headstock
  el('path', { class: 'g-body', d: 'M40,160 C34,70 130,34 232,66 C292,86 322,118 342,140 L342,180 C322,202 292,234 232,254 C130,286 34,250 40,160Z' }, svg);
  el('rect', { class: 'g-neck', x: 340, y: 132, width: 372, height: 56, rx: 6 }, svg);
  el('path', { class: 'g-neck', d: 'M708,128 L762,118 L766,202 L708,192Z' }, svg);
  for (let i = 0; i < 12; i++) el('line', { class: 'g-line', x1: 372 + i * 30, y1: 134, x2: 372 + i * 30, y2: 186 }, svg);

  const parts = {};
  const group = (name, color, build) => {
    const g = el('g', { class: 'part', style: `--c:${color}` }, svg);
    build(g);
    el('circle', { class: 'focus-ring', cx: g.__cx, cy: g.__cy, r: g.__r + 9 }, g);
    parts[name] = g;
    return g;
  };

  // frets
  FRET_NAMES.forEach((n, i) => {
    const cx = 404 + i * 60, cy = 160;
    group(n, COLORS[n], (g) => {
      g.__cx = cx; g.__cy = cy; g.__r = 20;
      el('circle', { class: 'fret-ring', cx, cy, r: 24 }, g);
      el('circle', { class: 'fret', cx, cy, r: 18 }, g);
    });
  });

  // strum bar (up / down halves)
  const strum = (name, y, up) => group(name, '#7c8cff', (g) => {
    g.__cx = 232; g.__cy = y + 28; g.__r = 36;
    el('rect', { class: 'plate', x: 196, y, width: 72, height: 56, rx: 14 }, g);
    const p = up ? 'M212,' + (y + 36) + ' L232,' + (y + 18) + ' L252,' + (y + 36) : 'M212,' + (y + 20) + ' L232,' + (y + 38) + ' L252,' + (y + 20);
    el('path', { class: 'glyph', d: p }, g);
  });
  strum('strumUp', 92, true);
  strum('strumDown', 152, false);
  // the focus ring on halves is a bit wide; fine.

  // star power
  group('star', '#facc15', (g) => {
    g.__cx = 92; g.__cy = 96; g.__r = 24;
    el('circle', { class: 'plate', cx: 92, cy: 96, r: 22 }, g);
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 7 : 15;
      pts.push((92 + r * Math.cos(a)).toFixed(1) + ',' + (96 + r * Math.sin(a)).toFixed(1));
    }
    el('polygon', { class: 'glyph fill', points: pts.join(' ') }, g);
  });

  // plus / start
  group('plus', '#38e1c6', (g) => {
    g.__cx = 92; g.__cy = 224; g.__r = 24;
    el('circle', { class: 'plate', cx: 92, cy: 224, r: 22 }, g);
    el('path', { class: 'glyph', d: 'M80,224 H104 M92,212 V236' }, g);
  });

  // whammy track
  const wg = el('g', {}, svg);
  el('rect', { class: 'whammy-track', x: 146, y: 96, width: 18, height: 130, rx: 9 }, wg);
  const wf = el('rect', { class: 'whammy-fill', x: 146, y: 226, width: 18, height: 0, rx: 9 }, wg);
  parts.whammy = wg;

  // tilt indicator
  const tg = el('g', { class: 'part', style: '--c:#38e1c6' }, svg);
  const tilt = el('g', { id: 'tiltIcon' }, tg);
  el('rect', { x: 392, y: 34, width: 140, height: 14, rx: 7, fill: '#cfd6ee' }, tilt);
  el('circle', { cx: 392, cy: 41, r: 14, fill: '#cfd6ee' }, tilt);
  parts.tilt = tg;

  // labels
  const label = (x, y, t) => { const e = el('text', { class: 'g-label', x, y }, svg); e.textContent = t; };
  label(92, 136, 'Star power'); label(92, 270, 'Plus'); label(155, 86, 'Whammy');
  label(232, 232, 'Strum'); label(462, 112, 'Frets'); label(462, 62, 'Tilt');

  return {
    el: svg,
    setPressed(name, on) { parts[name]?.classList.toggle('on', !!on); },
    setMapped(name, on) { parts[name]?.classList.toggle('mapped', !!on); },
    setFocus(names) { for (const [k, g] of Object.entries(parts)) g.classList.toggle('focus', names.includes(k)); },
    setWhammy(v) {
      const h = Math.round(130 * Math.min(1, Math.max(0, v)));
      wf.setAttribute('height', h); wf.setAttribute('y', 226 - h);
    },
    setTilt(on) { tilt.style.transform = on ? 'rotate(-24deg)' : 'none'; parts.tilt.classList.toggle('on', !!on); },
  };
}

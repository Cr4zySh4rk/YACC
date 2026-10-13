import assert from 'node:assert/strict';
import { PinDetector, WhammyCalibrator } from '../web/js/detect.js';

const mk = (t, over = {}) => { const counts = Array(23).fill(0); for (const [p, v] of Object.entries(over)) counts[p] = v; return { t, counts }; };

// double press on GP7 within a second
{
  const d = new PinDetector({ windowMs: 1000, minPresses: 2 });
  assert.equal(d.feed(mk(0)), null);
  assert.equal(d.feed(mk(200, { 7: 1 })), null);
  assert.deepEqual(d.feed(mk(500, { 7: 2 })), { pin: 7 });
}
// presses too far apart are ignored
{
  const d = new PinDetector({ windowMs: 1000, minPresses: 2 });
  d.feed(mk(0)); d.feed(mk(100, { 3: 1 }));
  assert.equal(d.feed(mk(1500, { 3: 2 })), null);
}
// counter wrap-around
{
  const d = new PinDetector();
  d.feed({ t: 0, counts: Array(23).fill(0).map((_, i) => (i === 4 ? 255 : 0)) });
  const s = { t: 300, counts: Array(23).fill(0).map((_, i) => (i === 4 ? 1 : 0)) };
  assert.deepEqual(d.feed(s), { pin: 4 });
}
// excluded pin reported as used, two pins reported as ambiguous
{
  const d = new PinDetector({ exclude: [7] });
  d.feed(mk(0));
  assert.deepEqual(d.feed(mk(100, { 7: 2 })), { used: [7] });
  const d2 = new PinDetector();
  d2.feed(mk(0));
  assert.deepEqual(d2.feed(mk(100, { 1: 2, 2: 2 })), { ambiguous: [1, 2] });
}
// tilt: two presses inside 5 s
{
  const d = new PinDetector({ windowMs: 5000 });
  d.feed(mk(0)); d.feed(mk(1000, { 9: 1 }));
  assert.deepEqual(d.feed(mk(4000, { 9: 2 })), { pin: 9 });
}
// whammy: two full sweeps on channel 1
{
  const w = new WhammyCalibrator();
  let t = 0, last;
  const sweep = (from, to) => { for (let i = 0; i <= 20; i++) { last = w.feed({ t: (t += 20), adc: [2048, from + ((to - from) * i) / 20, 100] }); } };
  for (let i = 0; i < 25; i++) w.feed({ t: (t += 20), adc: [2048, 600, 100] });
  sweep(600, 3300); sweep(3300, 600); sweep(600, 3300); sweep(3300, 600);
  assert.ok(last.done, JSON.stringify(last));
  const r = w.result();
  assert.equal(r.channel, 1);
  assert.equal(r.invert, false);
  assert.ok(r.min >= 600 && r.max <= 3300 && r.max - r.min > 2500);
}
// whammy resting at the high end -> inverted
{
  const w = new WhammyCalibrator();
  let t = 0, last;
  const sweep = (from, to) => { for (let i = 0; i <= 20; i++) last = w.feed({ t: (t += 20), adc: [100, 100, from + ((to - from) * i) / 20] }); };
  for (let i = 0; i < 25; i++) w.feed({ t: (t += 20), adc: [100, 100, 3500] });
  sweep(3500, 900); sweep(900, 3500); sweep(3500, 900); sweep(900, 3500);
  assert.ok(last.done);
  assert.equal(w.result().invert, true);
}
// a floating neighbour that mirrors the whammy (ADC cross-talk) must not break the calibration
{
  const w = new WhammyCalibrator();
  let t = 0, last, k = 0;
  const noise = () => ((k++ * 7919) % 41) - 20;
  const sweep = (from, to) => { for (let i = 0; i <= 20; i++) { const v = from + ((to - from) * i) / 20; last = w.feed({ t: (t += 20), adc: [v + noise(), v + noise() * 3, 50] }); } };
  for (let i = 0; i < 25; i++) w.feed({ t: (t += 20), adc: [500, 500, 50] });
  sweep(500, 3000); sweep(3000, 500); sweep(500, 3000); sweep(3000, 500);
  assert.ok(last.done, JSON.stringify(last));
  assert.ok(w.result().max - w.result().min > 2000);
}
// small-range sensor (about 0.6 V swing) still calibrates
{
  const w = new WhammyCalibrator();
  let t = 0, last;
  const sweep = (from, to) => { for (let i = 0; i <= 20; i++) last = w.feed({ t: (t += 20), adc: [100, 1500 + ((to - from) * i) / 20 + from - 1500, 100] }); };
  for (let i = 0; i < 25; i++) w.feed({ t: (t += 20), adc: [100, 1500, 100] });
  sweep(1500, 2000); sweep(2000, 1500); sweep(1500, 2000); sweep(2000, 1500);
  assert.ok(last.done, JSON.stringify(last));
}
// very small swing (about 150 counts, like a whammy sensor with a short travel) on GP28
{
  const w = new WhammyCalibrator();
  let t = 0, last, k = 0;
  const noise = () => ((k++ * 7919) % 7) - 3;
  const sweep = (from, to) => { for (let i = 0; i <= 20; i++) last = w.feed({ t: (t += 20), adc: [2048 + noise(), 900 + noise(), from + ((to - from) * i) / 20 + noise()] }); };
  for (let i = 0; i < 25; i++) w.feed({ t: (t += 20), adc: [2048, 900, 1800 + noise()] });
  sweep(1800, 1960); sweep(1960, 1800); sweep(1800, 1960); sweep(1960, 1800);
  assert.ok(last.done, JSON.stringify(last));
  assert.equal(w.result().channel, 2);
}
console.log('detect tests passed');

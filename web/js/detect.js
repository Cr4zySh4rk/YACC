// Pure detection logic (no DOM / USB) so it can be unit tested in Node.
import { NUM_DIGITAL_PINS } from './protocol.js?v=dev';

const diff8 = (a, b) => (a - b + 256) & 0xff;

/**
 * Finds the one GPIO that was pressed `minPresses` times within `windowMs`.
 * Feed it status samples ({t, counts}). Returns:
 *   null                       nothing yet
 *   {pin}                      success
 *   {ambiguous:[pins]}         several pins toggled together - caller should retry
 */
export class PinDetector {
  constructor({ windowMs = 1000, minPresses = 2, exclude = [] } = {}) {
    this.windowMs = windowMs;
    this.minPresses = minPresses;
    this.exclude = new Set(exclude);
    this.hist = [];
  }

  reset() { this.hist = []; }

  feed(sample) {
    this.hist.push({ t: sample.t, counts: sample.counts.slice() });
    while (this.hist.length > 2 && sample.t - this.hist[1].t >= this.windowMs) this.hist.shift();
    const base = this.hist[0];
    const hits = [];
    for (let p = 0; p < NUM_DIGITAL_PINS; p++) {
      const d = diff8(sample.counts[p], base.counts[p]);
      if (d >= this.minPresses) hits.push({ p, d });
    }
    if (!hits.length) return null;
    const free = hits.filter((h) => !this.exclude.has(h.p));
    if (!free.length) { this.hist = [this.hist[this.hist.length - 1]]; return { used: hits.map((h) => h.p) }; }
    if (free.length > 1) { this.hist = [this.hist[this.hist.length - 1]]; return { ambiguous: free.map((h) => h.p) }; }
    return { pin: free[0].p };
  }
}

/**
 * Whammy calibration: watches the 3 ADC channels, finds the one that swings the most and
 * counts how many times it travelled between its low and high zone.
 * Two full sweeps (rest -> far -> rest -> far -> rest) = 4 zone changes.
 *
 * Every channel keeps its own zone/switch counter so noise on an unused (floating) pin can never
 * reset the progress of the real one, and the "winning" channel only changes when another one
 * clearly out-swings it.
 */
export class WhammyCalibrator {
  constructor({ minRange = 90, neededSwitches = 4 } = {}) {
    this.minRange = minRange;
    this.needed = neededSwitches;
    this.reset();
  }

  reset() {
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
    this.first = null;
    this.restSamples = [[], [], []];
    this.zones = [null, null, null];
    this.switchesBy = [0, 0, 0];
    this.ch = -1;
    this.locked = false;
    this.n = 0;
    this.last = [0, 0, 0];
  }

  get switches() { return this.ch >= 0 ? this.switchesBy[this.ch] : 0; }

  get ranges() { return [0, 1, 2].map((c) => (this.max[c] > this.min[c] ? this.max[c] - this.min[c] : 0)); }

  feed(sample) {
    const a = sample.adc;
    if (!this.first) this.first = sample.t;
    this.n++;
    this.last = a.slice(0, 3);
    for (let c = 0; c < 3; c++) {
      this.min[c] = Math.min(this.min[c], a[c]);
      this.max[c] = Math.max(this.max[c], a[c]);
      if (sample.t - this.first < 400) this.restSamples[c].push(a[c]);
    }
    const ranges = this.ranges;
    for (let c = 0; c < 3; c++) {
      const lo = this.min[c], hi = this.max[c], r = ranges[c];
      // a channel the user picked by hand is trusted with a much smaller swing
      if (r < (this.locked && c === this.ch ? 12 : this.minRange)) continue;
      if (this.zones[c] === null && this.restSamples[c].length) {
        // the starting zone is wherever the bar rested before it started moving
        const rest = this.restSamples[c].reduce((x, y) => x + y, 0) / this.restSamples[c].length;
        this.zones[c] = rest - lo < hi - rest ? 'low' : 'high';
      }
      let z = null;
      if (a[c] <= lo + r * 0.25) z = 'low';
      else if (a[c] >= hi - r * 0.25) z = 'high';
      if (z && z !== this.zones[c]) {
        if (this.zones[c] !== null) this.switchesBy[c]++;
        this.zones[c] = z;
      }
    }
    // the channel with the biggest swing is the whammy (sticky: needs to win by 25 % to take over)
    let best = -1, bestRange = 0;
    for (let c = 0; c < 3; c++) if (ranges[c] > bestRange) { bestRange = ranges[c]; best = c; }
    if (!this.locked && best >= 0 && bestRange >= this.minRange) {
      if (this.ch < 0 || (best !== this.ch && bestRange > ranges[this.ch] * 1.25)) this.ch = best;
    }
    return this.progress(this.ch >= 0 ? ranges[this.ch] : 0);
  }

  progress(range) {
    const sw = this.switches;
    return {
      channel: this.ch, range, switches: sw, ranges: this.ranges, raw: this.last,
      fraction: Math.min(1, sw / this.needed),
      done: this.ch >= 0 && sw >= this.needed,
    };
  }

  /** Force a channel (manual pick): the calibration then only watches that one. */
  select(c) { this.ch = c; this.locked = true; this.switchesBy[c] = 0; this.zones[c] = null; this.min[c] = Infinity; this.max[c] = -Infinity; this.restSamples[c] = []; this.first = null; }

  result() {
    const c = this.ch;
    const lo = this.min[c], hi = this.max[c], r = hi - lo;
    const rest = this.restSamples[c].length
      ? this.restSamples[c].reduce((s, x) => s + x, 0) / this.restSamples[c].length : lo;
    const invert = Math.abs(rest - hi) < Math.abs(rest - lo);   // rest position is the high end
    const trim = Math.round(r * 0.02);
    return { channel: c, min: Math.max(0, lo + trim), max: Math.min(4095, hi - trim), invert };
  }
}

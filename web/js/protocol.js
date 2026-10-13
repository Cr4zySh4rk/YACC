// YACC wire protocol - mirrors firmware/src/config.h and usb_common.h
export const VID = 0x1209;
export const PIDS = [0x0001, 0x0002];

export const VREQ = {
  INFO: 0x30, STATUS: 0x31, GETCFG: 0x32, SETCFG: 0x33,
  SAVE: 0x34, DEFAULTS: 0x35, REBOOT: 0x36, SETMODE: 0x37, LEDTEST: 0x38,
};

export const FUNCS = ['green', 'red', 'yellow', 'blue', 'orange', 'strumUp', 'strumDown', 'star', 'plus'];
export const FUNC_LABEL = {
  green: 'Green', red: 'Red', yellow: 'Yellow', blue: 'Blue', orange: 'Orange',
  strumUp: 'Strum up', strumDown: 'Strum down', star: 'Star power', plus: 'Plus / Start',
};
export const NUM_FRETS = 5;
export const PIN_NONE = 0xff;
export const NUM_DIGITAL_PINS = 23;
export const MODE_NONE = 0xff;

export const MODES = [
  { id: 0, name: 'XInput', short: 'XInput', desc: 'Xbox 360 guitar. Plug-and-play on Windows (Clone Hero, YARG, Fortnite Festival).' },
  { id: 1, name: 'PS3 Guitar Hero', short: 'PS3', desc: 'Identifies as a RedOctane PS3 Guitar Hero guitar (0x12BA:0x0100). No web config in this mode.' },
  { id: 2, name: 'HID Gamepad', short: 'HID', desc: 'Generic HID gamepad for Linux, macOS, Android and emulators.' },
];

export const BOARDS = {
  0: 'Raspberry Pi Pico', 1: 'Raspberry Pi Pico W', 2: 'Raspberry Pi Pico 2',
  3: 'Raspberry Pi Pico 2 W', 4: 'Pico-compatible clone', 255: 'Unknown board',
};

export const DEBOUNCE_MODES = [
  { id: 0, name: 'Hold release', desc: 'Presses register instantly; a release is held for the debounce time. Lowest latency.' },
  { id: 1, name: 'Delay press', desc: 'A press registers only after being held for the debounce time; releases are instant.' },
  { id: 2, name: 'Classic', desc: 'Any change must be stable for the debounce time (adds latency both ways).' },
];

export const NUM_LEDS = 5;
export const FRET_DEFAULT_COLORS = ['#22c55e', '#ef4444', '#facc15', '#3b82f6', '#fb923c'];
export const EFFECTS = [
  { id: 0, name: 'Static', desc: 'Always full colour. Does not react.' },
  { id: 1, name: 'Dim on press', desc: 'Full colour at rest, dims while the fret is held.' },
  { id: 2, name: 'Off on press', desc: 'Full colour at rest, goes dark while the fret is held.' },
  { id: 3, name: 'Brighten on press', desc: 'Soft glow at rest, lights up fully while held.' },
  { id: 4, name: 'Flash & fade', desc: 'Flashes on press, then fades back to a soft glow. Speed sets the fade time.' },
  { id: 5, name: 'Breathing', desc: 'Idle LEDs breathe slowly, a press snaps to full. Speed sets the pace.' },
  { id: 6, name: 'Rainbow', desc: 'Idle LEDs cycle through colours; a press shows the fret colour.' },
];
export const RGB_PRESETS = [
  { name: 'Guitar Hero', colors: FRET_DEFAULT_COLORS },
  { name: 'Neon', colors: ['#00ffa3', '#ff2e63', '#fff200', '#00b4ff', '#ff7a00'] },
  { name: 'Ice', colors: ['#a5f3fc', '#67e8f9', '#38bdf8', '#818cf8', '#c4b5fd'] },
  { name: 'Fire', colors: ['#fde047', '#fbbf24', '#fb923c', '#ef4444', '#b91c1c'] },
  { name: 'Mono white', colors: ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'] },
];

const hex2 = (n) => n.toString(16).padStart(2, '0');
export const rgbToHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

export function defaultConfig() {
  return {
    pins: Array(FUNCS.length).fill(PIN_NONE),
    whammyCh: PIN_NONE, whammyInvert: false, whammyMin: 0, whammyMax: 4095,
    tiltPin: PIN_NONE,
    btEnabled: false, tiltEnabled: false, combinedStrum: false,
    usbMode: 0, debounceMode: 0, debounce100us: 50,
    whammySmooth: 2, whammyDeadzone: 3,
    bootModes: [0, MODE_NONE, 2, 1, MODE_NONE],
    rgbEnabled: false, rgbBootFlash: true, rgbPin: PIN_NONE, rgbBrightness: 40, rgbEffect: 3, rgbSpeed: 5,
    ledMap: [0, 1, 2, 3, 4], colors: FRET_DEFAULT_COLORS.slice(),
  };
}

export const CFG_SIZE = 64;
export const CFG_VERSION = 3;

export function parseConfig(dv) {
  if (dv.getUint32(0, true) !== 0x43434159) throw new Error('Bad config magic');
  const flags = dv.getUint8(21);
  const pins = [];
  for (let i = 0; i < FUNCS.length; i++) pins.push(dv.getUint8(5 + i));
  const bootModes = [];
  for (let i = 0; i < NUM_FRETS; i++) bootModes.push(dv.getUint8(28 + i));
  return {
    pins,
    whammyCh: dv.getUint8(14), whammyInvert: !!dv.getUint8(15),
    whammyMin: dv.getUint16(16, true), whammyMax: dv.getUint16(18, true),
    tiltPin: dv.getUint8(20),
    btEnabled: !!(flags & 1), tiltEnabled: !!(flags & 2), combinedStrum: !!(flags & 4),
    usbMode: dv.getUint8(22), debounceMode: dv.getUint8(23), debounce100us: dv.getUint16(24, true),
    whammySmooth: dv.getUint8(26), whammyDeadzone: dv.getUint8(27),
    bootModes,
    rgbEnabled: !!(flags & 8), rgbBootFlash: !!(flags & 16),
    rgbPin: dv.getUint8(33), rgbBrightness: dv.getUint8(34), rgbEffect: dv.getUint8(35), rgbSpeed: dv.getUint8(36),
    ledMap: [0, 1, 2, 3, 4].map((i) => dv.getUint8(37 + i)),
    colors: [0, 1, 2, 3, 4].map((i) => rgbToHex(dv.getUint8(42 + i * 3), dv.getUint8(43 + i * 3), dv.getUint8(44 + i * 3))),
  };
}

export function serializeConfig(c) {
  const buf = new ArrayBuffer(CFG_SIZE);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x43434159, true);
  dv.setUint8(4, CFG_VERSION);
  c.pins.forEach((p, i) => dv.setUint8(5 + i, p));
  dv.setUint8(14, c.whammyCh);
  dv.setUint8(15, c.whammyInvert ? 1 : 0);
  dv.setUint16(16, c.whammyMin, true);
  dv.setUint16(18, c.whammyMax, true);
  dv.setUint8(20, c.tiltPin);
  dv.setUint8(21, (c.btEnabled ? 1 : 0) | (c.tiltEnabled ? 2 : 0) | (c.combinedStrum ? 4 : 0) | (c.rgbEnabled ? 8 : 0) | (c.rgbBootFlash ? 16 : 0));
  dv.setUint8(22, c.usbMode);
  dv.setUint8(23, c.debounceMode);
  dv.setUint16(24, c.debounce100us, true);
  dv.setUint8(26, c.whammySmooth);
  dv.setUint8(27, c.whammyDeadzone);
  c.bootModes.forEach((m, i) => dv.setUint8(28 + i, m));
  dv.setUint8(33, c.rgbPin);
  dv.setUint8(34, Math.max(0, Math.min(100, c.rgbBrightness)));
  dv.setUint8(35, c.rgbEffect);
  dv.setUint8(36, Math.max(1, Math.min(10, c.rgbSpeed)));
  c.ledMap.forEach((m, i) => dv.setUint8(37 + i, m));
  c.colors.forEach((col, i) => { const [r, g, b] = hexToRgb(col); dv.setUint8(42 + i * 3, r); dv.setUint8(43 + i * 3, g); dv.setUint8(44 + i * 3, b); });
  dv.setUint32(60, crc32(new Uint8Array(buf, 0, 60)), true);
  return buf;
}

export function parseInfo(dv) {
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'YACC') throw new Error('Not a YACC device');
  return {
    major: dv.getUint8(4), minor: dv.getUint8(5), board: dv.getUint8(6),
    btSupported: !!(dv.getUint8(7) & 1), rgbSupported: !!(dv.getUint8(7) & 2),
    digitalPins: dv.getUint8(8), adcChannels: dv.getUint8(9), funcs: dv.getUint8(10),
    mode: dv.byteLength > 11 ? dv.getUint8(11) : 0,
  };
}

export function parseStatus(dv) {
  const mask = dv.getUint32(0, true);
  const adc = [dv.getUint16(4, true), dv.getUint16(6, true), dv.getUint16(8, true)];
  const counts = [];
  for (let i = 0; i < NUM_DIGITAL_PINS; i++) counts.push(dv.getUint8(10 + i));
  const flags = dv.getUint8(10 + NUM_DIGITAL_PINS);
  return { t: performance.now(), mask, adc, counts, btState: flags & 3, saveOk: !!(flags & 4), savePending: !!(flags & 8) };
}

// Same maths as firmware input_whammy(): returns 0..1
export function whammyValue(raw, cfg) {
  const range = cfg.whammyMax - cfg.whammyMin;
  if (range < 100) return 0;
  let v = Math.min(Math.max(raw - cfg.whammyMin, 0), range) / range;
  if (cfg.whammyInvert) v = 1 - v;
  return v < cfg.whammyDeadzone / 100 ? 0 : v;
}

export const isPressed = (status, pin) => pin !== PIN_NONE && pin < NUM_DIGITAL_PINS && !((status.mask >>> pin) & 1);

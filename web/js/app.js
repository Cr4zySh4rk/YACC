import {
  FUNCS, FUNC_LABEL, PIN_NONE, NUM_DIGITAL_PINS, NUM_FRETS, MODES, MODE_NONE, BOARDS,
  DEBOUNCE_MODES, defaultConfig, whammyValue, isPressed,
} from './protocol.js';
import { YaccDevice, webusbSupported } from './usb.js';
import { PinDetector, WhammyCalibrator } from './detect.js';
import { createGuitar } from './guitar.js';

const $ = (s, r = document) => r.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRET_COLORS = ['#22c55e', '#ef4444', '#facc15', '#3b82f6', '#fb923c'];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = { dev: null, info: null, cfg: null, status: null, step: 0, view: 'flash', connecting: false };

// ------------------------------------------------------------------ helpers
function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function showView(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach((e) => e.classList.toggle('active', e.id === 'view-' + v));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'setup') renderStep();
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.view); });

const funcName = (i) => FUNC_LABEL[FUNCS[i]];
const assignedPins = () => [...state.cfg.pins, state.cfg.tiltPin].filter((p) => p !== PIN_NONE);
const isConfigured = (cfg) => cfg.pins.some((p) => p !== PIN_NONE);

let pushTimer = 0;
function pushCfg() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { await state.dev?.setConfig(state.cfg); } catch (e) { toast('Could not send settings: ' + e.message, 'bad'); }
  }, 80);
}

// ------------------------------------------------------------------ live guitar viewers
const viewers = [];
function makeViewer(container, withPins = false) {
  const g = createGuitar();
  container.appendChild(g.el);
  let pinsEl = null;
  if (withPins) {
    pinsEl = document.createElement('div');
    pinsEl.className = 'pins';
    for (let p = 0; p < NUM_DIGITAL_PINS; p++) { const d = document.createElement('div'); d.textContent = 'GP' + p; pinsEl.appendChild(d); }
    container.appendChild(pinsEl);
  }
  const v = { g, pinsEl, container };
  viewers.push(v);
  return v;
}

function updateViewer(v, s) {
  const cfg = state.cfg;
  if (!cfg || !s) return;
  FUNCS.forEach((name, i) => {
    v.g.setMapped(name, cfg.pins[i] !== PIN_NONE);
    v.g.setPressed(name, isPressed(s, cfg.pins[i]));
  });
  v.g.setWhammy(cfg.whammyCh !== PIN_NONE ? whammyValue(s.adc[cfg.whammyCh], cfg) : 0);
  v.g.setTilt(cfg.tiltEnabled && isPressed(s, cfg.tiltPin));
  if (v.pinsEl) {
    const used = new Set(assignedPins());
    [...v.pinsEl.children].forEach((d, p) => {
      d.classList.toggle('low', isPressed(s, p));
      d.classList.toggle('used', used.has(p));
    });
  }
}

// ------------------------------------------------------------------ connection
function updatePill() {
  const pill = $('#connPill');
  if (state.dev && state.info) {
    pill.classList.add('on');
    const m = MODES.find((x) => x.id === state.info.mode);
    $('#connText').textContent = `${BOARDS[state.info.board] ?? 'Board'} · ${m ? m.short : '?'} · fw ${state.info.major}.${state.info.minor}`;
  } else {
    pill.classList.remove('on');
    $('#connText').textContent = state.connecting ? 'Connecting…' : 'Not connected';
  }
  const on = !!state.dev;
  $('#setupGate').style.display = on ? 'none' : '';
  $('#setupMain').style.display = on ? '' : 'none';
  $('#tuneGate').style.display = on ? 'none' : '';
  $('#tuneMain').style.display = on ? '' : 'none';
  $('#modesGate').style.display = on ? 'none' : '';
  $('#modesMain').style.display = on ? '' : 'none';
}

async function connect(device, { navigate = false } = {}) {
  if (state.connecting || state.dev) return;
  state.connecting = true; updatePill();
  try {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      try { state.info = await device.open(); lastErr = null; break; } catch (e) { lastErr = e; await sleep(400); try { await device.close(); } catch { /* */ } }
    }
    if (lastErr) throw lastErr;
    state.cfg = await device.getConfig();
    state.dev = device;
    state.step = isConfigured(state.cfg) ? STEPS.length - 1 : 0;
    device.addEventListener('status', (e) => onStatus(e.detail));
    device.addEventListener('lost', onLost);
    device.startPolling();
    buildUi();
    updatePill();
    toast('Controller connected', 'ok');
    if (navigate) showView('setup');
  } catch (e) {
    state.dev = null;
    toast('Could not open the controller: ' + e.message + (navigator.userAgent.includes('Windows') ? ' (on Windows the WinUSB driver may still be installing — unplug, replug and retry)' : ''), 'bad');
  } finally {
    state.connecting = false; updatePill();
  }
}

function onLost() {
  state.dev = null; state.info = null;
  updatePill();
  toast('Controller disconnected');
}

async function pickAndConnect() {
  try {
    const d = await YaccDevice.pick();
    await connect(d, { navigate: true });
  } catch (e) {
    if (e.name !== 'NotFoundError') toast('Connection failed: ' + e.message, 'bad');
  }
}

async function autoConnect(navigate) {
  if (!webusbSupported() || state.dev || state.connecting) return;
  const list = await YaccDevice.authorised();
  if (list.length) await connect(list[0], { navigate });
}

// ------------------------------------------------------------------ status stream
function onStatus(s) {
  state.status = s;
  for (const v of viewers) if (v.container.offsetParent !== null) updateViewer(v, s);
  tickStep(s);
}

// ------------------------------------------------------------------ guided setup
const STEPS = [
  ...[0, 1, 2, 3, 4].map((i) => ({ kind: 'button', func: i, title: funcName(i) + ' fret', prompt: `Press the ${funcName(i).toLowerCase()} fret twice within one second.`, focus: [FUNCS[i]] })),
  { kind: 'button', func: 5, title: 'Strum up', prompt: 'Push the strum bar up twice within one second.', focus: ['strumUp'] },
  { kind: 'button', func: 6, title: 'Strum down', prompt: 'Push the strum bar down twice within one second.', focus: ['strumDown'] },
  { kind: 'button', func: 7, title: 'Star power', prompt: 'Press the star power button twice within one second.', focus: ['star'] },
  { kind: 'button', func: 8, title: 'Plus / Start', prompt: 'Press the plus button twice within one second.', focus: ['plus'] },
  { kind: 'whammy', title: 'Whammy bar', prompt: 'Move the whammy bar through its full range and back — twice.', focus: ['whammy'] },
  { kind: 'bluetooth', title: 'Bluetooth', prompt: 'Go wireless?', focus: [] },
  { kind: 'tilt', title: 'Tilt switch', prompt: 'Use a tilt switch as a star power shortcut?', focus: ['tilt'] },
  { kind: 'review', title: 'All done', prompt: 'Check everything, then save it to the controller.', focus: [] },
];

let stageViewer = null;
let stepCtx = {};    // per-step transient state

function buildUi() {
  viewers.length = 0;
  $('#stage').innerHTML = '';
  stageViewer = makeViewer($('#stage'), true);
  $('#tuneStage').innerHTML = '';
  makeViewer($('#tuneStage'));
  buildTune();
  buildModes();
  renderStep();
}

function progressHtml() {
  return '<div class="progress">' + STEPS.map((s, i) => `<span class="${i < state.step ? 'done' : i === state.step ? 'cur' : ''}"></span>`).join('') + '</div>';
}

function goStep(i) {
  state.step = Math.max(0, Math.min(STEPS.length - 1, i));
  renderStep();
}

function renderStep() {
  if (!state.dev || !stageViewer) return;
  const step = STEPS[state.step];
  const card = $('#stepCard');
  stepCtx = {};
  stageViewer.g.setFocus(step.focus);
  const head = `${progressHtml()}<div class="muted" style="font-size:13px;margin-bottom:4px">Step ${state.step + 1} of ${STEPS.length}</div>
    <h2 class="step-title">${step.title}</h2><p class="step-prompt">${step.prompt}</p>`;

  const nav = (extra = '') => `<div class="row" style="margin-top:16px;justify-content:space-between">
      <button class="btn ghost small" id="bBack" ${state.step === 0 ? 'disabled' : ''}>← Back</button>
      <div class="row">${extra}</div></div>`;
  const wireNav = () => { $('#bBack')?.addEventListener('click', () => goStep(state.step - 1)); $('#bSkip')?.addEventListener('click', () => goStep(state.step + 1)); };

  if (step.kind === 'button') {
    const exclude = assignedPins().filter((p) => p !== state.cfg.pins[step.func]);
    stepCtx.detector = new PinDetector({ windowMs: 1000, minPresses: 2, exclude });
    const cur = state.cfg.pins[step.func];
    const free = [...Array(NUM_DIGITAL_PINS).keys()].filter((p) => !exclude.includes(p));
    card.innerHTML = head + `
      <div class="result ${cur !== PIN_NONE ? 'ok' : ''}" id="result">${cur !== PIN_NONE
        ? `✓ Currently <span class="chip">GP${cur}</span> — press again to re-detect`
        : '<span class="pulse"></span><span>Waiting for two presses…</span>'}</div>
      <div class="row"><label class="muted" for="manual">or pick the pin yourself</label>
        <select id="manual"><option value="">Choose pin…</option>${free.map((p) => `<option value="${p}">GP${p}</option>`).join('')}</select></div>
      ${nav('<button class="btn small" id="bSkip">' + (cur !== PIN_NONE ? 'Next →' : 'Skip') + '</button>')}`;
    wireNav();
    $('#manual').addEventListener('change', (e) => { if (e.target.value !== '') assignButton(step, +e.target.value); });
  } else if (step.kind === 'whammy') {
    stepCtx.cal = new WhammyCalibrator();
    const have = state.cfg.whammyCh !== PIN_NONE;
    card.innerHTML = head + `
      <div class="result ${have ? 'ok' : ''}" id="result">${have
        ? `✓ Calibrated on <span class="chip">GP${26 + state.cfg.whammyCh}</span> (${state.cfg.whammyMin}–${state.cfg.whammyMax}${state.cfg.whammyInvert ? ', inverted' : ''})`
        : '<span class="pulse"></span><span>Waiting for the bar to move…</span>'}</div>
      <div class="muted" style="font-size:13px;margin-bottom:6px" id="wLabel">${have ? 'Live input' : 'Sweeps detected: 0 / 2'}</div>
      <div class="bar"><i id="wBar" style="width:0"></i></div>
      <div class="adcs"><div class="muted" style="font-size:12px;margin:14px 0 6px">Raw analog inputs — the bar you move should swing one of these. Wrong one picked? Press <b>Use</b> on the right pin.</div>
        ${[0, 1, 2].map((c) => `<div class="adc-row" data-ch="${c}"><span class="chip">GP${26 + c}</span><div class="bar"><i></i></div><span class="val">0</span><button class="btn small" data-use="${c}">Use</button></div>`).join('')}</div>
      ${nav(`<button class="btn small" id="wRedo">Recalibrate</button><button class="btn small ${have ? 'primary' : ''}" id="bSkip">${have ? 'Continue →' : 'Skip'}</button>`)}`;
    wireNav();
    stepCtx.done = have;
    document.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
      stepCtx.cal.select(+b.dataset.use);
      stepCtx.done = false;
      setResult('', `<span class="pulse"></span><span>Using <span class="chip">GP${26 + +b.dataset.use}</span> — move the bar through two full sweeps.</span>`);
    }));
    $('#wRedo').addEventListener('click', () => {
      state.cfg.whammyCh = PIN_NONE; pushCfg(); stepCtx.cal.reset(); stepCtx.done = false; renderStep();
    });
  } else if (step.kind === 'bluetooth') {
    const sup = state.info.btSupported;
    const why = state.info.board === 4
      ? 'Your board is a Pico-compatible clone. The ESP8285 on it only does Wi-Fi — there is no Bluetooth radio to use.'
      : 'This board has no Bluetooth radio. Only Raspberry Pi Pico W / Pico 2 W boards can do wireless.';
    card.innerHTML = head + `
      <div class="opt"><div><h3>Wireless Bluetooth</h3><span class="muted">${sup ? 'Hold <b>Star power + Plus</b> for 5 seconds to enter Bluetooth pairing mode.' : why}</span></div>
        <label class="switch"><input type="checkbox" id="btSw" ${state.cfg.btEnabled ? 'checked' : ''} ${sup ? '' : 'disabled'}><i></i></label></div>
      ${sup ? '<div class="notice warn" style="margin-top:12px">The Bluetooth stack is still being built into the firmware: the setting is stored, but pairing does not do anything yet.</div>' : ''}
      ${nav('<button class="btn small primary" id="bSkip">Continue →</button>')}`;
    wireNav();
    $('#btSw').addEventListener('change', (e) => { state.cfg.btEnabled = e.target.checked; pushCfg(); });
  } else if (step.kind === 'tilt') {
    const renderTilt = () => {
      const c = state.cfg;
      const have = c.tiltPin !== PIN_NONE;
      stepCtx.detector = new PinDetector({ windowMs: 5000, minPresses: 2, exclude: assignedPins().filter((p) => p !== c.tiltPin) });
      card.innerHTML = head + `
        <div class="opt"><div><h3>Tilt switch → star power</h3><span class="muted">Lifting the guitar neck triggers star power, like on a real controller.</span></div>
          <label class="switch"><input type="checkbox" id="tiltSw" ${c.tiltEnabled ? 'checked' : ''}><i></i></label></div>
        ${c.tiltEnabled ? `<div class="result ${have ? 'ok' : ''}" id="result" style="margin-top:12px">${have
          ? `✓ Tilt switch on <span class="chip">GP${c.tiltPin}</span>`
          : '<span class="pulse"></span><span>Tilt the guitar up twice within 5 seconds…</span>'}</div>` : ''}
        ${nav(`${c.tiltEnabled && have ? '<button class="btn small" id="tRedo">Re-detect</button>' : ''}<button class="btn small primary" id="bSkip">Continue →</button>`)}`;
      wireNav();
      stepCtx.active = c.tiltEnabled && !have;
      $('#tiltSw').addEventListener('change', (e) => { c.tiltEnabled = e.target.checked; if (!c.tiltEnabled) c.tiltPin = PIN_NONE; pushCfg(); renderTilt(); });
      $('#tRedo')?.addEventListener('click', () => { c.tiltPin = PIN_NONE; pushCfg(); renderTilt(); });
    };
    renderTilt();
  } else {
    const c = state.cfg;
    const rows = FUNCS.map((f, i) => `<tr><td>${funcName(i)}</td><td>${c.pins[i] === PIN_NONE ? '<span class="muted">not set</span>' : 'GP' + c.pins[i]}</td></tr>`).join('') +
      `<tr><td>Whammy</td><td>${c.whammyCh === PIN_NONE ? '<span class="muted">not set</span>' : 'GP' + (26 + c.whammyCh)}</td></tr>
       <tr><td>Tilt switch</td><td>${c.tiltEnabled && c.tiltPin !== PIN_NONE ? 'GP' + c.tiltPin : '<span class="muted">off</span>'}</td></tr>
       <tr><td>Bluetooth</td><td>${c.btEnabled ? 'on' : 'off'}</td></tr>`;
    card.innerHTML = head + `<table class="sum">${rows}</table>
      <div class="notice info" style="margin-top:14px">Try every input — the guitar on the left lights up as you press. Tune debounce and whammy feel on the <b>Tune</b> tab.</div>
      <div class="row" style="margin-top:16px;justify-content:space-between">
        <button class="btn small" id="bRedo">Start over</button>
        <button class="btn primary" id="bSave">Save to controller</button></div>`;
    $('#bRedo').addEventListener('click', () => { state.cfg.pins.fill(PIN_NONE); state.cfg.whammyCh = PIN_NONE; state.cfg.tiltPin = PIN_NONE; pushCfg(); goStep(0); });
    $('#bSave').addEventListener('click', saveToController);
  }
}

function setResult(kind, html) {
  const r = $('#result');
  if (!r) return;
  r.className = 'result ' + kind;
  r.innerHTML = html;
}

function assignButton(step, pin) {
  if (stepCtx.locked) return;
  stepCtx.locked = true;
  state.cfg.pins[step.func] = pin;
  pushCfg();
  setResult('ok', `✓ ${step.title} → <span class="chip">GP${pin}</span>`);
  setTimeout(() => { if (STEPS[state.step] === step) goStep(state.step + 1); }, 850);
}

function tickStep(s) {
  if (state.view !== 'setup' || !state.dev) return;
  const step = STEPS[state.step];
  if (step.kind === 'button' && stepCtx.detector && !stepCtx.locked) {
    const r = stepCtx.detector.feed(s);
    if (!r) return;
    if (r.pin !== undefined) assignButton(step, r.pin);
    else if (r.ambiguous) setResult('bad', `Several inputs moved at once (${r.ambiguous.map((p) => 'GP' + p).join(', ')}). Press only the ${step.title.toLowerCase()}.`);
    else if (r.used) {
      const who = state.cfg.pins.findIndex((p) => p === r.used[0]);
      setResult('bad', `<span class="chip">GP${r.used[0]}</span> is already ${who >= 0 ? 'the ' + funcName(who).toLowerCase() : 'in use'}. Press a different control.`);
    }
  } else if (step.kind === 'whammy' && stepCtx.cal) {
    const c = state.cfg;
    document.querySelectorAll('.adc-row').forEach((row) => {
      const v = s.adc[+row.dataset.ch];
      row.querySelector('i').style.width = ((v / 4095) * 100).toFixed(1) + '%';
      row.querySelector('.val').textContent = v;
      row.classList.toggle('sel', (stepCtx.done ? c.whammyCh : stepCtx.cal.ch) === +row.dataset.ch);
    });
    if (stepCtx.done) {
      const el = $('#wBar');
      if (el && c.whammyCh !== PIN_NONE) el.style.width = (whammyValue(s.adc[c.whammyCh], c) * 100).toFixed(1) + '%';
      return;
    }
    const p = stepCtx.cal.feed(s);
    $('#wBar').style.width = (p.fraction * 100).toFixed(0) + '%';
    $('#wLabel').textContent = p.channel < 0 ? 'Waiting for movement…' : `Sweeps detected: ${Math.min(2, Math.floor(p.switches / 2))} / 2`;
    if (p.done) {
      const r = stepCtx.cal.result();
      Object.assign(c, { whammyCh: r.channel, whammyMin: r.min, whammyMax: r.max, whammyInvert: r.invert });
      pushCfg();
      stepCtx.done = true;
      setResult('ok', `✓ Calibrated on <span class="chip">GP${26 + r.channel}</span> (${r.min}–${r.max}${r.invert ? ', inverted' : ''})`);
      $('#wLabel').textContent = 'Live input — move the bar to check it';
      const b = $('#bSkip'); if (b) { b.textContent = 'Continue →'; b.classList.add('primary'); }
    }
  } else if (step.kind === 'tilt' && stepCtx.active && stepCtx.detector) {
    const r = stepCtx.detector.feed(s);
    if (!r) return;
    if (r.pin !== undefined) {
      state.cfg.tiltPin = r.pin; pushCfg(); stepCtx.active = false;
      setResult('ok', `✓ Tilt switch on <span class="chip">GP${r.pin}</span>`);
      toast('Tilt switch registered', 'ok');
    } else if (r.ambiguous) setResult('bad', 'Several inputs moved at once — tilt only the guitar.');
    else if (r.used) setResult('bad', `<span class="chip">GP${r.used[0]}</span> is already used by another control.`);
  }
}

async function saveToController() {
  const b = $('#bSave');
  try {
    if (b) b.disabled = true;
    await state.dev.setConfig(state.cfg);
    await state.dev.save();
    await sleep(400);
    const s = await state.dev.getStatus();
    if (!s.saveOk) throw new Error('flash write failed');
    toast('Saved to the controller', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'bad');
  } finally { if (b) b.disabled = false; }
}

// ------------------------------------------------------------------ tune
function buildTune() {
  const c = state.cfg;
  const dt = $('#debT'), ws = $('#wSmooth'), wd = $('#wDead');
  const refresh = () => {
    $('#debTVal').textContent = (c.debounce100us / 10).toFixed(1) + ' ms';
    $('#wSmoothVal').textContent = c.whammySmooth === 0 ? 'off' : String(c.whammySmooth);
    $('#wDeadVal').textContent = c.whammyDeadzone + ' %';
  };
  dt.value = c.debounce100us; ws.value = c.whammySmooth; wd.value = c.whammyDeadzone;
  $('#combStrum').checked = c.combinedStrum; $('#wInv').checked = c.whammyInvert;
  $('#debModes').innerHTML = DEBOUNCE_MODES.map((m) => `<label><input type="radio" name="dm" value="${m.id}" ${c.debounceMode === m.id ? 'checked' : ''}><div><b>${m.name}</b><br><span class="muted">${m.desc}</span></div></label>`).join('');
  const live = () => { refresh(); $('#tuneState').textContent = 'Live changes — not saved yet.'; pushCfg(); };
  dt.oninput = () => { c.debounce100us = +dt.value; live(); };
  ws.oninput = () => { c.whammySmooth = +ws.value; live(); };
  wd.oninput = () => { c.whammyDeadzone = +wd.value; live(); };
  $('#combStrum').onchange = (e) => { c.combinedStrum = e.target.checked; live(); };
  $('#wInv').onchange = (e) => { c.whammyInvert = e.target.checked; live(); };
  $('#debModes').onchange = (e) => { c.debounceMode = +e.target.value; live(); };
  $('#saveTune').onclick = async () => { await saveToController(); $('#tuneState').textContent = 'Saved to the controller.'; };
  $('#resetCfg').onclick = async () => {
    if (!confirm('Reset every setting (pins, whammy, tuning, modes) to factory defaults?')) return;
    await state.dev.defaults(); await state.dev.save(); await sleep(300);
    state.cfg = await state.dev.getConfig(); state.step = 0; buildUi(); toast('Reset to defaults', 'ok');
  };
  refresh();
}

// ------------------------------------------------------------------ modes
function buildModes() {
  const c = state.cfg;
  const running = state.info.mode;
  $('#modeCards').innerHTML = MODES.map((m) => `<div class="card mode-card ${c.usbMode === m.id ? 'sel' : ''}" data-mode="${m.id}">
      <h2>${m.name}</h2><p class="muted" style="margin:0 0 10px">${m.desc}</p>
      <span class="chip">${c.usbMode === m.id ? 'Default' : 'Select as default'}</span>
      ${running === m.id ? ' <span class="chip" style="color:var(--ok)">Running now</span>' : ''}</div>`).join('');
  $('#modeCards').onclick = (e) => {
    const card = e.target.closest('.mode-card'); if (!card) return;
    c.usbMode = +card.dataset.mode; buildModes();
  };
  const opts = (sel) => `<option value="255" ${sel === MODE_NONE ? 'selected' : ''}>Keep current</option>` +
    MODES.map((m) => `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${m.name}</option>`).join('');
  $('#bootTable').innerHTML = [0, 1, 2, 3, 4].map((i) => `<div><label class="muted"><span class="fretdot" style="background:${FRET_COLORS[i]}"></span>Hold ${funcName(i)}</label><br>
      <select data-fret="${i}">${opts(c.bootModes[i])}</select></div>`).join('');
  $('#bootTable').onchange = (e) => { c.bootModes[+e.target.dataset.fret] = +e.target.value; };
  $('#saveModes').onclick = async () => {
    try {
      await state.dev.setConfig(c); await state.dev.save(); await sleep(400);
      toast('Saved — restarting the controller…', 'ok');
      await state.dev.reboot(false);
    } catch (e) { toast('Failed: ' + e.message, 'bad'); }
  };
}

// ------------------------------------------------------------------ flash page
const BOARD_LIST = [
  { id: 'pico_clone', arch: 'rp2040', name: 'Pico-compatible clone (ESP8285 / “Pico W-style” boards)', help: 'Uses the slower, safer flash settings these clone boards need. Pick this if your board is not an official Raspberry Pi one.' },
  { id: 'pico', arch: 'rp2040', name: 'Raspberry Pi Pico', help: 'Official Pico (RP2040).' },
  { id: 'pico_w', arch: 'rp2040', name: 'Raspberry Pi Pico W', help: 'Official Pico W with the CYW43 radio (Bluetooth capable).' },
  { id: 'pico2', arch: 'rp2350', name: 'Raspberry Pi Pico 2', help: 'Official Pico 2 (RP2350).' },
  { id: 'pico2_w', arch: 'rp2350', name: 'Raspberry Pi Pico 2 W', help: 'Official Pico 2 W (RP2350, Bluetooth capable).' },
];

function initFlash() {
  const sel = $('#boardSel');
  sel.innerHTML = BOARD_LIST.map((b) => `<option value="${b.id}">${b.name}</option>`).join('');
  sel.value = store.get('yacc.board') || 'pico_clone';
  if (!BOARD_LIST.some((b) => b.id === sel.value)) sel.value = 'pico_clone';
  const apply = () => {
    const b = BOARD_LIST.find((x) => x.id === sel.value);
    store.set('yacc.board', b.id);
    $('#boardHelp').textContent = b.help;
    const fw = `downloads/yacc-${b.id}.uf2`, nk = `downloads/yacc-nuke-${b.arch}.uf2`;
    $('#dlFw').href = fw; $('#dlFw').setAttribute('download', `yacc-${b.id}.uf2`);
    $('#dlNuke').href = nk; $('#dlNuke').setAttribute('download', `yacc-nuke-${b.arch}.uf2`);
    $('#directFw').onclick = () => directFlash(fw, `yacc-${b.id}.uf2`);
    $('#directNuke').onclick = () => directFlash(nk, `yacc-nuke-${b.arch}.uf2`);
  };
  sel.onchange = apply; apply();
  if (!window.showDirectoryPicker) { $('#directFw').disabled = true; $('#directNuke').disabled = true; $('#directFw').title = 'Needs Chrome or Edge'; }
  if (!webusbSupported()) {
    const w = $('#browserWarn');
    w.style.display = '';
    w.innerHTML = '<b>WebUSB is not available in this browser.</b> Open YACC in Chrome, Edge or another Chromium browser to configure the controller. Downloading firmware works everywhere.';
  }
}

async function directFlash(url, name) {
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!/RP/i.test(dir.name)) {
      if (!confirm(`“${dir.name}” does not look like the Pico's bootloader drive (usually RPI-RP2 or RP2350). Write the file anyway?`)) return;
    }
    const buf = await (await fetch(url)).arrayBuffer();
    const fh = await dir.getFileHandle(name, { create: true });
    try {
      const w = await fh.createWritable();
      await w.write(buf);
      await w.close();
    } catch { /* the drive disappears as soon as the board reboots into the new firmware */ }
    $('#flashMsg').textContent = `Wrote ${name}. The board is restarting — if it disconnected, that worked.`;
    toast('Flashed ' + name, 'ok');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Direct flash failed: ' + e.message, 'bad');
  }
}

// ------------------------------------------------------------------ boot
$('#connectBtn').onclick = pickAndConnect;
$('#connectBtn2').onclick = pickAndConnect;
initFlash();
updatePill();

if (webusbSupported()) {
  navigator.usb.addEventListener('connect', async () => { await sleep(700); autoConnect(!state.dev); });
  navigator.usb.addEventListener('disconnect', () => { if (state.dev) { state.dev.stopPolling(); onLost(); } });
  autoConnect(true);   // already-authorised controller -> straight to setup
}

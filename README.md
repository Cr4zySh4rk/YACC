# YACC — Yet Another Controller Configurator

A browser-based configurator **and** matching firmware for DIY guitar controllers on the Raspberry Pi Pico family.
Flash the board, plug it in, and the web app walks you through mapping every button — no matter which pins you wired them to.

**Web app:** https://cr4zysh4rk.github.io/YACC/ (GitHub Pages) · also deployable on Vercel (see below)

> Requires a Chromium-based browser (Chrome, Edge, Brave, …) for WebUSB. Downloading firmware works in any browser.

## How it works

1. **Flash** – download the *flash nuke* (wipes the old firmware and settings) and the YACC firmware for your board, or let the page write them straight to the `RPI-RP2` drive.
2. **Plug in** – the page detects the controller and jumps to guided setup.
3. **Guided setup** – for every control YACC asks you to press it twice within a second, watches which GPIO changed, and assigns it:
   green → red → yellow → blue → orange → strum up → strum down → star power → plus.
4. **Whammy** – move the bar through two full sweeps; YACC finds the analog pin, calibrates min/max, detects direction and shows a live meter.
5. **RGB** – say whether you wired 5 WS2812 LEDs, give the data pin, and teach YACC which LED sits under which fret by pressing the frets.
6. **Add-ons** – Bluetooth toggle (Pico W / Pico 2 W only) and an optional tilt switch (a plain digital switch such as a mercury ball switch; tilt up twice within 5 s to register it as a star-power shortcut).
7. **Tune** – debounce time/mode, combined-strum debounce, whammy smoothing and dead-zone, all live.
8. **Lights** – optional WS2812 RGB LEDs under the frets (colours, reactive effects, brightness, LED order).
9. **Modes** – choose what the controller pretends to be.

## USB modes

| Hold at plug-in (default) | Mode | Identity |
|---|---|---|
| Green | **XInput** | Xbox 360 guitar (subtype 6), answers the capability/serial requests Windows asks for. + WebUSB config |
| Blue | **PS3 Guitar Hero** | RedOctane `12BA:0100`, Santroller-style HID descriptor and `0x21 0x26 0x01 0x06` handshake. No web config in this mode |
| Yellow | **HID gamepad** | Generic HID gamepad (16 buttons, hat, 4 axes) for Linux / macOS / Android / emulators. + WebUSB config |
| Plus | **Setup mode** | XInput + web config for this boot only, nothing saved |
| Star + Plus + Strum up | **Bootloader** | Jumps to UF2 mode so you can reflash without touching BOOTSEL |

The mode picked by holding a fret is remembered (like GP2040-CE). Every fret → mode assignment can be changed on the **Modes** tab.

## Wiring

* Buttons: any of **GP0–GP22**, switched to **GND** (internal pull-ups are enabled).
* Whammy potentiometer: **GP26, GP27 or GP28** (ADC0–2), wiper to the pin, ends to 3V3 and GND.
* Tilt switch: any of GP0–GP22 to GND.

## RGB lighting (WS2812)

* Five individually addressable WS2812/NeoPixel LEDs on **one data pin** (any of GP0–GP22 not used by a button), driven by a PIO state machine.
* **Brightness 0–100** (of 255) – deliberately capped so the strip never pulls much current.
* Per-fret **colours** with presets, and an **LED order wizard**: each LED lights white in turn and you press the fret above it.
* **Effects**: static, dim on press, off on press, brighten on press, flash & fade, breathing, rainbow (speed adjustable).
* **Mode indicator**: after plug-in the fret LED that selects the running mode (green = XInput, blue = PS3, yellow = HID by default) flashes for one second.
* The LEDs work in every USB mode, including PS3 where the web config is unavailable (set them up beforehand).

## Debounce

YACC uses a *lockout + glitch filter* engine, designed after reading how Santroller and GP2040-CE do it:

* **GP2040-CE** debounces with a per-pin lockout: the first edge is taken immediately, then changes are ignored for the delay (default 5 ms) before the input re-syncs to the raw level.
* **Santroller** lets presses through instantly and holds *releases* for the debounce time, with an optional press-delay mode and a combined strum debounce.
* **YACC** takes the best of both: a 0.2 ms press / 1 ms release glitch filter (so EMI spikes and contact flutter never register), then a per-input lockout (default 5 ms) after every accepted edge, then re-sync. Strum up/down additionally share a lockout so a bouncing strum switch can't fire both directions. A mercury tilt switch gets at least a 20 ms lockout.

The only knob is the lockout time (presets from Off to 20 ms, or a slider up to 25 ms). Inputs are sampled at up to 10 kHz.

## Boards

| Build | Board |
|---|---|
| `pico_clone` | Generic RP2040 "Pico-compatible" clones, including boards with an ESP8285 (Wi-Fi only) instead of a real Pico W radio. Uses the generic flash boot stage, slower flash clock and longer crystal start-up, like Santroller's `pico_w_compat`. |
| `pico` / `pico_w` | Official Pico / Pico W |
| `pico2` / `pico2_w` | Official Pico 2 / Pico 2 W (RP2350) |

**Bluetooth** needs the CYW43 radio of a genuine Pico W / Pico 2 W. The ESP8285 on clone boards is Wi-Fi only, so the toggle is disabled there. The BLE-HID stack itself is not implemented yet — the setting is stored and the hook exists (`firmware/src/bt.c`).

## Repository layout

```
firmware/   pico-sdk + TinyUSB firmware (XInput / PS3 / HID + WebUSB config) and flash nuke
web/        static web app (no build step) – deployed as-is
tests/      unit tests for pin and whammy detection
.github/    CI: builds all firmware variants and deploys the site to GitHub Pages
vercel.json Vercel configuration (serves web/)
```

### Build the firmware locally

```bash
git clone --depth 1 -b 2.1.1 https://github.com/raspberrypi/pico-sdk
git -C pico-sdk submodule update --init --depth 1 lib/tinyusb
cmake -S firmware -B build -G Ninja -DPICO_BOARD=pico_clone -DPICO_SDK_PATH=$PWD/pico-sdk
cmake --build build        # build/yacc.uf2 and build/nuke/yacc_nuke.uf2
```

### Tests

```bash
node tests/detect.test.mjs
```

### Run the site locally

```bash
python3 -m http.server -d web 8000   # then open http://localhost:8000 in Chrome
```

## Deploying

* **GitHub Pages** – automatic: every push to `main` builds the firmware for all boards and publishes `web/` plus fresh UF2s.
* **Vercel** – import the repository at <https://vercel.com/new>. `vercel.json` already points the output directory at `web/` and needs no build step. The UF2 files committed in `web/downloads/` are served directly.

## Protocol (for hackers)

Configuration travels over WebUSB vendor control transfers on interface 1 (WinUSB via MS OS 2.0 descriptors):
`0x30` info · `0x31` live status (GPIO levels, ADCs, debounced press counters) · `0x32/0x33` get/set config (64 bytes, CRC32) · `0x34` save · `0x35` defaults · `0x36` reboot/bootloader · `0x37` set mode · `0x38` light one LED (wizard).
See `firmware/src/config.h`, `firmware/src/usb_common.h` and `web/js/protocol.js`.

## Credits & license

Inspired by and compatible in spirit with [Santroller](https://github.com/Santroller/Santroller) and [GP2040-CE](https://github.com/OpenStickCommunity/GP2040-CE); USB identities and handshakes were studied from Santroller. Licensed under **GPL-3.0** (see `LICENSE`).

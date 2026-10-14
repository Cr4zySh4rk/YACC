// YAGCC firmware: guitar controller with three USB personalities (XInput, PS3 GH, HID)
// and a WebUSB configuration channel used by the YAGCC web app.
#include <string.h>
#include "pico/stdlib.h"
#include "pico/bootrom.h"
#include "hardware/watchdog.h"
#include "hardware/structs/watchdog.h"
#include "tusb.h"

#include "usb_common.h"
#include "config.h"
#include "input.h"
#include "bt.h"
#include "rgb.h"

// ---------------------------------------------------------------- state shared with USB callbacks
static yacc_config_t cfg_rx;
static uint8_t tx_buf[64];
static volatile bool save_pending;
static volatile bool save_ok = true;
static volatile int reboot_mode = -1;     // -1 none, 0 normal, 1 BOOTSEL
static volatile uint64_t reboot_at;
static volatile bool setup_reboot;

// Asked over HID (PS3 mode has no WebUSB interface): restart once in setup mode (XInput + web config)
#define SETUP_MAGIC 0x59414743u   // "YAGC"
void usb_request_setup_reboot(void) {
    setup_reboot = true;
    reboot_at = time_us_64() + 150000;
}

#define STATUS_LEN (4 + 2 * NUM_ADC_CH + NUM_DIGITAL_PINS + 1)

static uint16_t build_status(void) {
    uint8_t *p = tx_buf;
    uint32_t m = input_gpio_mask();
    memcpy(p, &m, 4); p += 4;
    for (int c = 0; c < NUM_ADC_CH; c++) {
        uint16_t v = input_adc(c);
        memcpy(p, &v, 2); p += 2;
    }
    memcpy(p, input_press_counts(), NUM_DIGITAL_PINS); p += NUM_DIGITAL_PINS;
    *p++ = (bt_state() & 0x03) | (save_ok ? 0x04 : 0) | (save_pending ? 0x08 : 0);
    return (uint16_t)(p - tx_buf);
}

static uint16_t build_info(void) {
    uint8_t *p = tx_buf;
    memcpy(p, "YACC", 4); p += 4;   // wire-protocol magic (unchanged by the YAGCC rename)
    *p++ = YACC_VERSION_MAJOR;
    *p++ = YACC_VERSION_MINOR;
    *p++ = YACC_BOARD_ID;
    *p++ = (bt_supported() ? 1 : 0) | 2;   // capability bits: 1 = bluetooth, 2 = RGB
    *p++ = NUM_DIGITAL_PINS;
    *p++ = NUM_ADC_CH;
    *p++ = NUM_FUNCS;
    *p++ = g_usb_mode;                  // mode this boot is running in
    return (uint16_t)(p - tx_buf);
}

static bool reply(uint8_t rhport, tusb_control_request_t const *req, const void *data, uint16_t len) {
    if (len > req->wLength) len = req->wLength;
    return tud_control_xfer(rhport, req, (void *)data, len);
}

bool usb_vendor_request(uint8_t rhport, uint8_t stage, tusb_control_request_t const *req) {
    if (req->bmRequestType_bit.type != TUSB_REQ_TYPE_VENDOR) return false;

    // OUT data stage finished: apply what we received
    if (stage == CONTROL_STAGE_ACK) {
        if (req->bRequest == VREQ_SETCFG && config_validate(&cfg_rx)) g_cfg = cfg_rx;
        return true;
    }
    if (stage != CONTROL_STAGE_SETUP) return true;

    switch (req->bRequest) {
        case VREQ_WEBUSB:
            if (req->wIndex == 2) {
                uint16_t n;
                const uint8_t *d = yacc_webusb_url_desc(&n);
                return reply(rhport, req, d, n);
            }
            return false;
        case VREQ_MS_OS:
            if (req->wIndex == 7) {
                uint16_t n;
                const uint8_t *d = yacc_ms_os_desc(&n);
                return reply(rhport, req, d, n);
            }
            return false;
        case VREQ_INFO:
            return reply(rhport, req, tx_buf, build_info());
        case VREQ_STATUS:
            return reply(rhport, req, tx_buf, build_status());
        case VREQ_GETCFG:
            config_seal(&g_cfg);
            return reply(rhport, req, &g_cfg, sizeof(g_cfg));
        case VREQ_SETCFG:
            if (req->wLength != sizeof(cfg_rx)) return false;
            return tud_control_xfer(rhport, req, &cfg_rx, sizeof(cfg_rx));
        case VREQ_SAVE:
            save_pending = true;
            return tud_control_status(rhport, req);
        case VREQ_DEFAULTS:
            config_defaults(&g_cfg);
            return tud_control_status(rhport, req);
        case VREQ_SETMODE:
            if (req->wValue < NUM_MODES) g_cfg.usb_mode = (uint8_t)req->wValue;
            return tud_control_status(rhport, req);
        case VREQ_LEDTEST:
            rgb_test_led(req->wValue < NUM_LEDS ? (int)req->wValue : -1);
            return tud_control_status(rhport, req);
        case VREQ_REBOOT:
            reboot_mode = req->wValue ? 1 : 0;
            reboot_at = time_us_64() + 150000;
            return tud_control_status(rhport, req);
        default:
            return false;
    }
}

// ---------------------------------------------------------------- controller state
typedef struct {
    bool green, red, yellow, blue, orange;
    bool strum_up, strum_down;
    bool star, plus;
    bool tilt;          // tilt switch alone (also folded into `star` for most modes)
    int16_t whammy;     // 0..32767
} pad_t;

static void read_pad(pad_t *s) {
    s->green  = input_func(F_GREEN);
    s->red    = input_func(F_RED);
    s->yellow = input_func(F_YELLOW);
    s->blue   = input_func(F_BLUE);
    s->orange = input_func(F_ORANGE);
    s->strum_up   = input_func(F_STRUM_UP);
    s->strum_down = input_func(F_STRUM_DOWN);
    s->plus = input_func(F_PLUS);
    s->star = input_func(F_STAR);
    s->tilt = (g_cfg.flags & CFG_FLAG_TILT_ENABLED) && g_cfg.tilt_pin != PIN_NONE && input_tilt();
    if (s->tilt) s->star = true;
    s->whammy = input_whammy();
}

// ---------------------------------------------------------------- game feedback (rumble channel)
// Santroller's convention, which YARG uses: right motor byte = command, left = parameter.
static volatile bool g_star_power_active;
static volatile uint8_t g_star_power_fill;
void usb_game_feedback(uint8_t command, uint8_t param) {
    switch (command) {
        case 0x09: g_star_power_active = param != 0; break;   // star power / overdrive active
        case 0x08: g_star_power_fill = param; break;          // star power meter
        case 0xFF: g_star_power_active = false; break;        // all off
        default: break;
    }
    rgb_set_star_power(g_star_power_active);
}

// whammy 0..32767 -> full signed range with the rest position at -32768 (what XInput guitars report)
static inline int16_t xi_axis(int16_t v) { return (int16_t)((int32_t)v * 2 - 32767); }

// ---- Xbox 360 guitar, 20 byte report. Guitar Hero (subtype 7) and Rock Band (subtype 6) share
// the layout Santroller uses: whammy on right stick X, tilt on right stick Y.
static uint16_t build_xinput(const pad_t *s, uint8_t *out) {
    uint16_t b = 0;
    if (s->green)  b |= 0x1000;   // A
    if (s->red)    b |= 0x2000;   // B
    if (s->blue)   b |= 0x4000;   // X
    if (s->yellow) b |= 0x8000;   // Y
    if (s->orange) b |= 0x0100;   // left shoulder
    if (s->strum_up)   b |= 0x0001;
    if (s->strum_down) b |= 0x0002;
    if (s->plus) b |= 0x0010;     // start
    if (s->star) b |= 0x0020;     // back
    // Fortnite Festival on PC reads overdrive from D-pad left
    if (s->star && (g_cfg.flags & CFG_FLAG_STAR_DPAD_LEFT)) b |= 0x0004;
    memset(out, 0, XINPUT_REPORT_LEN);
    out[1] = XINPUT_REPORT_LEN;
    out[2] = (uint8_t)b;
    out[3] = (uint8_t)(b >> 8);
    int16_t whammy = xi_axis(s->whammy);
    out[10] = (uint8_t)whammy;
    out[11] = (uint8_t)((uint16_t)whammy >> 8);
    int16_t tilt = s->star ? 32767 : -32768;   // games read star power from the tilt axis too
    out[12] = (uint8_t)tilt;
    out[13] = (uint8_t)((uint16_t)tilt >> 8);
    return XINPUT_REPORT_LEN;
}

// ---- PS3 Guitar Hero guitar, 27 byte report (layout matches the descriptor)
static uint16_t build_ps3(const pad_t *s, uint8_t *out) {
    memset(out, 0, PS3_REPORT_LEN);
    uint8_t b0 = 0, b1 = 0;
    if (s->yellow) b0 |= 0x01;
    if (s->green)  b0 |= 0x02;
    if (s->red)    b0 |= 0x04;
    if (s->blue)   b0 |= 0x08;
    if (s->orange) b0 |= 0x10;
    if (s->star) b1 |= 0x01;      // select
    if (s->plus) b1 |= 0x02;      // start
    out[0] = b0;
    out[1] = b1;
    // hat: 0 = up, 4 = down, 8 = neutral
    uint8_t hat = 0x08;
    if (s->strum_up && !s->strum_down) hat = 0x00;
    else if (s->strum_down && !s->strum_up) hat = 0x04;
    out[2] = hat;
    out[3] = 0x80;                // left stick x
    out[4] = 0x80;                // left stick y
    out[5] = (uint8_t)(s->whammy >> 7);   // whammy
    out[6] = 0x80;                // touch slider idle
    // out[7..18] pressure bytes stay 0
    // accelerometer words centred (tilt, z, y, unused)
    for (int i = 0; i < 4; i++) {
        out[19 + 2 * i] = 0x00;
        out[20 + 2 * i] = 0x02;   // 0x0200
    }
    return PS3_REPORT_LEN;
}

// ---- PS3 Rock Band guitar, 27 byte report (Santroller's PS3RockBandGuitar_Data_t layout)
// byte 0: blue, green, red, yellow, orange, tilt(R1), solo(L2), -   byte 1: select, start
// byte 2: hat (strum), 3/4: sticks, 5: whammy (0 = rest), 6: pickup selector, accel words centred.
static uint16_t build_ps3_rb(const pad_t *s, uint8_t *out) {
    memset(out, 0, PS3_REPORT_LEN);
    uint8_t b0 = 0, b1 = 0;
    if (s->blue)   b0 |= 0x01;
    if (s->green)  b0 |= 0x02;
    if (s->red)    b0 |= 0x04;
    if (s->yellow) b0 |= 0x08;
    if (s->orange) b0 |= 0x10;
    if (s->tilt)   b0 |= 0x20;    // Rock Band reads tilt as R1
    // overdrive: the star button is select; with no separate tilt reading it also tilts (star = select)
    if (s->star) b1 |= 0x01;      // select
    if (s->plus) b1 |= 0x02;      // start
    out[0] = b0;
    out[1] = b1;
    uint8_t hat = 0x08;
    if (s->strum_up && !s->strum_down) hat = 0x00;
    else if (s->strum_down && !s->strum_up) hat = 0x04;
    out[2] = hat;
    out[3] = 0x80;
    out[4] = 0x80;
    out[5] = (uint8_t)(s->whammy >> 7);
    out[6] = 0x00;                // pickup selector position
    for (int i = 0; i < 4; i++) {
        out[19 + 2 * i] = 0x00;
        out[20 + 2 * i] = 0x02;   // 0x0200
    }
    return PS3_REPORT_LEN;
}

// ---- USB keyboard, 8 byte boot report (Fortnite Festival keyboard bindings by default)
static uint16_t build_keyboard(const pad_t *s, uint8_t *out) {
    memset(out, 0, KEYBOARD_REPORT_LEN);
    const bool on[NUM_KEYS] = {s->green, s->red, s->yellow, s->blue, s->orange, s->strum_up, s->strum_down,
                               s->star && !s->tilt, s->plus, s->tilt, s->whammy > 16384};
    int n = 0;
    for (int k = 0; k < NUM_KEYS; k++) {
        uint8_t code = g_cfg.keys[k];
        if (!on[k] || code == 0) continue;
        if (code >= 0xE0 && code <= 0xE7) { out[0] |= (uint8_t)(1u << (code - 0xE0)); continue; }
        bool dup = false;
        for (int i = 0; i < n; i++) if (out[2 + i] == code) dup = true;
        if (!dup && n < 6) out[2 + n++] = code;
    }
    return KEYBOARD_REPORT_LEN;
}

// ---- Nintendo Switch (HORIPAD layout), 8 byte report
static uint16_t build_switch(const pad_t *s, uint8_t *out) {
    uint16_t b = 0;
    if (s->yellow) b |= 1u << 0;   // Y
    if (s->red)    b |= 1u << 1;   // B
    if (s->green)  b |= 1u << 2;   // A
    if (s->blue)   b |= 1u << 3;   // X
    if (s->orange) b |= 1u << 4;   // L
    if (s->tilt)   b |= 1u << 5;   // R
    if (s->star)   b |= 1u << 8;   // minus
    if (s->plus)   b |= 1u << 9;   // plus
    out[0] = (uint8_t)b;
    out[1] = (uint8_t)(b >> 8);
    uint8_t hat = 0x08;
    if (s->strum_up && !s->strum_down) hat = 0x00;
    else if (s->strum_down && !s->strum_up) hat = 0x04;
    out[2] = hat;
    out[3] = 0x80; out[4] = 0x80;
    out[5] = (uint8_t)(s->whammy >> 7);   // right stick X = whammy
    out[6] = 0x80;
    out[7] = 0x00;
    return SWITCH_REPORT_LEN;
}

// ---- original Xbox ("Duke"), 20 byte report
static uint16_t build_ogxbox(const pad_t *s, uint8_t *out) {
    memset(out, 0, OGXBOX_REPORT_LEN);
    out[1] = OGXBOX_REPORT_LEN;
    uint8_t d = 0;
    if (s->strum_up)   d |= 0x01;
    if (s->strum_down) d |= 0x02;
    if (s->plus)       d |= 0x10;   // start
    if (s->star)       d |= 0x20;   // back
    out[2] = d;
    out[4] = s->green ? 0xFF : 0;   // A
    out[5] = s->red ? 0xFF : 0;     // B
    out[6] = s->blue ? 0xFF : 0;    // X
    out[7] = s->yellow ? 0xFF : 0;  // Y
    out[8] = s->orange ? 0xFF : 0;  // black
    out[9] = s->tilt ? 0xFF : 0;    // white
    int16_t whammy = xi_axis(s->whammy);
    out[16] = (uint8_t)whammy; out[17] = (uint8_t)((uint16_t)whammy >> 8);   // right stick X
    return OGXBOX_REPORT_LEN;
}

// ---- generic HID gamepad, 7 byte report
static uint16_t build_hid(const pad_t *s, uint8_t *out) {
    uint16_t b = 0;
    if (s->green)  b |= 1u << 0;
    if (s->red)    b |= 1u << 1;
    if (s->yellow) b |= 1u << 2;
    if (s->blue)   b |= 1u << 3;
    if (s->orange) b |= 1u << 4;
    if (s->star)   b |= 1u << 5;
    if (s->plus)   b |= 1u << 6;
    if (s->strum_up)   b |= 1u << 7;
    if (s->strum_down) b |= 1u << 8;
    uint8_t hat = 0x08;           // neutral (8 = null state)
    if (s->strum_up && !s->strum_down) hat = 0x00;
    else if (s->strum_down && !s->strum_up) hat = 0x04;
    out[0] = (uint8_t)b;
    out[1] = (uint8_t)(b >> 8);
    out[2] = hat;
    out[3] = 0x80;
    out[4] = 0x80;
    out[5] = (uint8_t)(s->whammy >> 7);
    out[6] = s->star ? 0xFF : 0x00;
    return HID_REPORT_LEN;
}

// ---------------------------------------------------------------- boot-time mode selection
static void settle_inputs(void) {
    // Pull-ups need a moment, then the detection debounce needs a few ms of stable readings.
    sleep_ms(10);
    uint32_t start = time_us_32();
    while ((uint32_t)(time_us_32() - start) < 20000) input_poll();
}

static bool boot_pressed(int f) {
    uint8_t p = g_cfg.pins[f];
    return p != PIN_NONE && input_pressed(p);
}

static uint8_t pick_mode(void) {
    // the configurator asked for setup mode from PS3 mode: honour it for this boot only
    if (watchdog_caused_reboot() && watchdog_hw->scratch[0] == SETUP_MAGIC) {
        watchdog_hw->scratch[0] = 0;
        return MODE_XINPUT;
    }
    watchdog_hw->scratch[0] = 0;
    // star power + plus at plug-in -> straight to the UF2 bootloader
    if (boot_pressed(F_STAR) && boot_pressed(F_PLUS)) {
        reset_usb_boot(0, 0);
    }
    // plus alone -> setup mode for this boot (XInput + web config), nothing is saved
    if (boot_pressed(F_PLUS)) return MODE_XINPUT;

    uint8_t mode = g_cfg.usb_mode < NUM_MODES ? g_cfg.usb_mode : MODE_XINPUT;
    for (int i = 0; i < NUM_FRETS; i++) {
        uint8_t m = g_cfg.boot_modes[i];
        if (m != MODE_NONE && m < NUM_MODES && boot_pressed(i)) {
            mode = m;
            if (m != g_cfg.usb_mode) {      // remember it, like picking a mode on any other pad
                g_cfg.usb_mode = m;
                config_save();
            }
            break;
        }
    }
    return mode;
}

int main(void) {
    config_load();
    input_init();
    settle_inputs();
    g_usb_mode = pick_mode();

    bt_init(g_cfg.flags & CFG_FLAG_BT_ENABLED);
    rgb_init();
    tusb_init();
    rgb_boot_indicator(g_usb_mode);

    uint64_t last_sent = 0, hold_start = 0;
    bool hold_fired = false;
    uint8_t last_report[32] = {0};
    uint16_t last_len = 0;
    bool dirty = true;

    while (true) {
        tud_task();
        bt_task();
        input_poll();
        rgb_task();

        uint64_t now = time_us_64();

        if (setup_reboot && now >= reboot_at) {
            watchdog_hw->scratch[0] = SETUP_MAGIC;
            watchdog_reboot(0, 0, 10);
            while (true) tight_loop_contents();
        }
        if (reboot_mode >= 0 && now >= reboot_at) {
            if (reboot_mode == 1) reset_usb_boot(0, 0);
            else watchdog_reboot(0, 0, 10);
        }
        if (save_pending) {
            save_ok = config_save();
            save_pending = false;
        }

        // Hold star power + plus for 5 s -> Bluetooth pairing mode
        if ((g_cfg.flags & CFG_FLAG_BT_ENABLED) && input_func(F_STAR) && input_func(F_PLUS)) {
            if (!hold_start) hold_start = now;
            else if (!hold_fired && now - hold_start >= 5000000) {
                hold_fired = true;
                bt_start_pairing();
            }
        } else {
            hold_start = 0;
            hold_fired = false;
        }

        pad_t st;
        read_pad(&st);
        uint8_t rpt[32];
        uint16_t len;
        switch (g_usb_mode) {
            case MODE_PS3_GH: len = build_ps3(&st, rpt); break;
            case MODE_PS3_RB:
            case MODE_WII_RB: len = build_ps3_rb(&st, rpt); break;
            case MODE_KEYBOARD: len = build_keyboard(&st, rpt); break;
            case MODE_SWITCH: len = build_switch(&st, rpt); break;
            case MODE_OGXBOX: len = build_ogxbox(&st, rpt); break;
            case MODE_HID:    len = build_hid(&st, rpt); break;
            default:          len = build_xinput(&st, rpt); break;
        }
        if (len != last_len || memcmp(rpt, last_report, len) != 0) {
            dirty = true;
            memcpy(last_report, rpt, len);
            last_len = len;
            bt_send_state(0, st.whammy, 0);
        }

        if ((dirty || now - last_sent >= 8000) && tud_ready()) {
            bool ok;
            if (g_usb_mode == MODE_XINPUT || g_usb_mode == MODE_OGXBOX) {
                ok = xinput_send(last_report, last_len);
            } else {
                ok = tud_hid_n_ready(0) && tud_hid_n_report(0, 0, last_report, last_len);
            }
            if (ok) {
                dirty = false;
                last_sent = now;
            }
        }
    }
}

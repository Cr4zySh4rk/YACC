#include "input.h"
#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "hardware/adc.h"

// ---- detection grade pin state (fixed debounce, used for pin discovery) ----
#define DETECT_DEBOUNCE_US 3000

static uint8_t level[NUM_DIGITAL_PINS];       // debounced level (1 = released)
static uint32_t since[NUM_DIGITAL_PINS];      // when the raw level last differed from `level`
static bool differing[NUM_DIGITAL_PINS];
static uint8_t presses[NUM_DIGITAL_PINS];

// ---- logical controls with tunable debounce ----
typedef struct {
    bool out;
    bool armed;
    uint32_t t;
} deb_t;
static deb_t slot[NUM_SLOTS];
static uint32_t strum_lock_until;
static bool strum_lock_active;

// ---- analog ----
static int32_t adc_acc[NUM_ADC_CH];           // value * 16
static uint16_t adc_val[NUM_ADC_CH];
static uint32_t last_adc_us;
static uint32_t last_poll_us;

static inline bool elapsed(uint32_t now, uint32_t then, uint32_t span) {
    return (uint32_t)(now - then) >= span;
}

void input_init(void) {
    for (int p = 0; p < NUM_DIGITAL_PINS; p++) {
        gpio_init(p);
        gpio_set_dir(p, GPIO_IN);
        gpio_pull_up(p);
        level[p] = 1;
    }
    adc_init();
    for (int c = 0; c < NUM_ADC_CH; c++) adc_gpio_init(26 + c);
    for (int c = 0; c < NUM_ADC_CH; c++) {
        adc_select_input(c);
        adc_val[c] = adc_read();
        adc_acc[c] = (int32_t)adc_val[c] << 4;
    }
}

static bool deb_step(deb_t *d, bool raw, uint32_t now, uint32_t win, uint8_t mode) {
    if (win == 0) { d->out = raw; return d->out; }
    switch (mode) {
        case DEB_RELEASE:
            if (raw) { d->out = true; d->t = now; }
            else if (d->out && elapsed(now, d->t, win)) d->out = false;
            break;
        case DEB_PRESS:
            if (raw) {
                if (!d->armed) { d->armed = true; d->t = now; }
                if (elapsed(now, d->t, win)) d->out = true;
            } else {
                d->armed = false;
                d->out = false;
            }
            break;
        default: // DEB_BOTH
            if (raw == d->out) d->t = now;
            else if (elapsed(now, d->t, win)) d->out = raw;
            break;
    }
    return d->out;
}

static bool raw_for_slot(uint32_t all, int s) {
    uint8_t pin = (s == SLOT_TILT) ? g_cfg.tilt_pin : g_cfg.pins[s];
    if (pin >= NUM_DIGITAL_PINS) return false;
    return !((all >> pin) & 1);       // active low
}

void input_poll(void) {
    uint32_t now = time_us_32();
    if (!elapsed(now, last_poll_us, 100)) return;     // 10 kHz max
    last_poll_us = now;

    uint32_t all = gpio_get_all();

    // detection grade
    for (int p = 0; p < NUM_DIGITAL_PINS; p++) {
        uint8_t raw = (all >> p) & 1;
        if (raw != level[p]) {
            if (!differing[p]) { differing[p] = true; since[p] = now; }
            else if (elapsed(now, since[p], DETECT_DEBOUNCE_US)) {
                level[p] = raw;
                differing[p] = false;
                if (!raw) presses[p]++;
            }
        } else {
            differing[p] = false;
        }
    }

    // logical controls
    uint32_t win = (uint32_t)g_cfg.debounce_100us * 100u;
    uint8_t mode = g_cfg.debounce_mode;
    bool combined = (g_cfg.flags & CFG_FLAG_COMBINED_STRUM) && win;

    bool up_prev = slot[F_STRUM_UP].out, down_prev = slot[F_STRUM_DOWN].out;
    for (int s = 0; s < NUM_SLOTS; s++) {
        bool raw = raw_for_slot(all, s);
        if (combined && (s == F_STRUM_UP || s == F_STRUM_DOWN) &&
            strum_lock_active && (int32_t)(now - strum_lock_until) < 0 &&
            !slot[F_STRUM_UP].out && !slot[F_STRUM_DOWN].out) {
            raw = false;                       // a new strum can't start inside the window
        }
        deb_step(&slot[s], raw, now, win, mode);
    }
    if (combined && (slot[F_STRUM_UP].out != up_prev || slot[F_STRUM_DOWN].out != down_prev)) {
        strum_lock_until = now + win;
        strum_lock_active = true;
    }
    if (strum_lock_active && (int32_t)(now - strum_lock_until) >= 0) strum_lock_active = false;

    // analog, 1 kHz
    if (elapsed(now, last_adc_us, 1000)) {
        last_adc_us = now;
        uint8_t sh = g_cfg.whammy_smooth;
        for (int c = 0; c < NUM_ADC_CH; c++) {
            adc_select_input(c);
            // The sample capacitor still holds the previous channel's charge: without throw-away
            // conversions an unconnected (floating) pin just mirrors its neighbour, which made
            // the whammy appear on several channels at once.
            (void)adc_read(); (void)adc_read();
            uint32_t sum = 0;
            for (int i = 0; i < 4; i++) sum += adc_read();
            int32_t target = (int32_t)(sum / 4) << 4;
            adc_acc[c] += (target - adc_acc[c]) >> sh;
            if (sh == 0) adc_acc[c] = target;
            adc_val[c] = (uint16_t)(adc_acc[c] >> 4);
        }
    }
}

bool input_pressed(uint8_t gpio) { return gpio < NUM_DIGITAL_PINS && !level[gpio]; }

uint32_t input_gpio_mask(void) {
    uint32_t m = 0;
    for (int p = 0; p < NUM_DIGITAL_PINS; p++) m |= (uint32_t)level[p] << p;
    return m;
}

const uint8_t *input_press_counts(void) { return presses; }

bool input_func(int f) { return f >= 0 && f < NUM_FUNCS && slot[f].out; }
bool input_tilt(void) { return slot[SLOT_TILT].out; }

uint16_t input_adc(uint8_t ch) { return ch < NUM_ADC_CH ? adc_val[ch] : 0; }

int16_t input_whammy(void) {
    if (g_cfg.whammy_ch >= NUM_ADC_CH) return 0;
    int32_t lo = g_cfg.whammy_min, hi = g_cfg.whammy_max;
    int32_t range = hi - lo;
    if (range < 100) return 0;
    int32_t v = (int32_t)adc_val[g_cfg.whammy_ch] - lo;
    if (v < 0) v = 0;
    if (v > range) v = range;
    int32_t n = (v * 32767) / range;
    if (g_cfg.whammy_invert) n = 32767 - n;
    if (n < (32767 * (int32_t)g_cfg.whammy_deadzone) / 100) n = 0;
    return (int16_t)n;
}

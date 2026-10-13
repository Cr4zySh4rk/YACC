// WS2812 lighting for the five fret buttons: per-fret colour, remappable chain order,
// press-reactive effects, power-limited brightness and a boot-time mode indicator.
#include "rgb.h"
#include <string.h>
#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/gpio.h"
#include "config.h"
#include "input.h"
#include "ws2812.pio.h"

#define FRAME_US    8000u
#define BOOT_FLASH_US 1000000u
#define BLINK_US    125000u
#define TEST_HOLD_US 2500000u

static PIO rgb_pio = pio0;
static const uint rgb_sm = 0;
static uint rgb_offset;
static bool program_loaded;
static int cur_pin = -1;

static uint32_t last_frame, boot_t0;
static int boot_fret = -1;
static int test_led = -1;
static uint32_t test_until;
static uint8_t fade[NUM_FRETS];
static bool was_pressed[NUM_FRETS];

void rgb_init(void) {
    rgb_offset = pio_add_program(rgb_pio, &ws2812_program);
    program_loaded = true;
    last_frame = time_us_32();
}

static void attach(int pin) {
    if (pin == cur_pin) return;
    if (cur_pin >= 0) {
        pio_sm_set_enabled(rgb_pio, rgb_sm, false);
        gpio_init(cur_pin);
        gpio_set_dir(cur_pin, GPIO_IN);
        gpio_pull_up(cur_pin);
    }
    cur_pin = -1;
    if (pin >= 0) {
        ws2812_program_init(rgb_pio, rgb_sm, rgb_offset, (uint)pin, 800000.0f);
        cur_pin = pin;
    }
}

bool rgb_active_pin(int p) { return cur_pin >= 0 && p == cur_pin; }

void rgb_boot_indicator(uint8_t mode) {
    boot_t0 = time_us_32();
    boot_fret = -1;
    for (int f = 0; f < NUM_FRETS; f++) if (g_cfg.boot_modes[f] == mode) { boot_fret = f; break; }
    if (boot_fret < 0) boot_fret = (mode == MODE_PS3_GH) ? F_BLUE : (mode == MODE_HID) ? F_YELLOW : F_GREEN;
}

void rgb_test_led(int led) {
    test_led = led;
    test_until = time_us_32() + TEST_HOLD_US;
}

static void hsv(uint8_t h, uint8_t *r, uint8_t *g, uint8_t *b) {
    uint8_t region = h / 43, rem = (h - region * 43) * 6;
    uint8_t q = 255 - rem, t = rem;
    switch (region) {
        case 0: *r = 255; *g = t; *b = 0; break;
        case 1: *r = q; *g = 255; *b = 0; break;
        case 2: *r = 0; *g = 255; *b = t; break;
        case 3: *r = 0; *g = q; *b = 255; break;
        case 4: *r = t; *g = 0; *b = 255; break;
        default: *r = 255; *g = 0; *b = q; break;
    }
}

static uint32_t pack(uint8_t r, uint8_t g, uint8_t b, uint8_t level, uint8_t bright) {
    // brightness is capped at 100 of 255 so five LEDs never pull much current
    uint32_t k = (uint32_t)level * bright;                  // 0 .. 255*100
    uint32_t rr = (uint32_t)r * k / (255u * 255u);
    uint32_t gg = (uint32_t)g * k / (255u * 255u);
    uint32_t bb = (uint32_t)b * k / (255u * 255u);
    return ((gg << 16) | (rr << 8) | bb) << 8;              // GRB, MSB aligned for the PIO
}

void rgb_task(void) {
    bool enabled = (g_cfg.flags & CFG_FLAG_RGB_ENABLED) && g_cfg.rgb_pin < NUM_DIGITAL_PINS;
    if (!program_loaded) return;
    attach(enabled ? (int)g_cfg.rgb_pin : -1);
    if (!enabled) return;

    uint32_t now = time_us_32();
    if ((uint32_t)(now - last_frame) < FRAME_US) return;
    last_frame = now;

    uint8_t bright = g_cfg.rgb_brightness > 100 ? 100 : g_cfg.rgb_brightness;
    uint32_t px[NUM_LEDS] = {0};
    bool testing = test_led >= 0 && (int32_t)(now - test_until) < 0;
    bool booting = (g_cfg.flags & CFG_FLAG_RGB_BOOTFLASH) && boot_fret >= 0 && (uint32_t)(now - boot_t0) < BOOT_FLASH_US;

    if (testing) {
        if (test_led < NUM_LEDS) px[test_led] = pack(255, 255, 255, 255, bright);
    } else if (booting) {
        if (((now - boot_t0) / BLINK_US) % 2 == 0) {
            int f = boot_fret;
            px[g_cfg.led_map[f]] = pack(g_cfg.colors[f][0], g_cfg.colors[f][1], g_cfg.colors[f][2], 255, bright);
        }
    } else {
        uint8_t speed = g_cfg.rgb_speed < 1 ? 1 : g_cfg.rgb_speed > 10 ? 10 : g_cfg.rgb_speed;
        for (int f = 0; f < NUM_FRETS; f++) {
            bool down = input_func(f);
            uint8_t r = g_cfg.colors[f][0], g = g_cfg.colors[f][1], b = g_cfg.colors[f][2];
            uint8_t level = 255;
            switch (g_cfg.rgb_effect) {
                case EFX_STATIC: break;
                case EFX_DIM:    level = down ? 40 : 255; break;
                case EFX_OFF:    level = down ? 0 : 255; break;
                case EFX_BRIGHT: level = down ? 255 : 64; break;
                case EFX_FADE: {
                    uint32_t fade_ms = 1100u - speed * 100u;           // 1000 ms .. 100 ms
                    uint8_t step = (uint8_t)((255u * (FRAME_US / 1000u)) / fade_ms) + 1;
                    if (down) fade[f] = 255;
                    else fade[f] = fade[f] > step ? fade[f] - step : 0;
                    level = fade[f] < 28 ? 28 : fade[f];
                    break;
                }
                case EFX_BREATHE: {
                    if (down) { level = 255; break; }
                    uint32_t period = 4000000u - speed * 350000u;      // 3.65 s .. 0.5 s
                    uint32_t ph = ((now + f * (period / 10)) % period) * 512u / period;   // 0..511
                    uint32_t tri = ph < 256 ? ph : 511 - ph;
                    level = (uint8_t)(40 + tri * 100 / 255);
                    break;
                }
                case EFX_RAINBOW: {
                    if (down) { level = 255; break; }
                    uint32_t hue = (now / 1000u * speed / 40u + f * 40u) & 0xFF;
                    hsv((uint8_t)hue, &r, &g, &b);
                    level = 150;
                    break;
                }
                default: break;
            }
            was_pressed[f] = down;
            px[g_cfg.led_map[f]] = pack(r, g, b, level, bright);
        }
    }
    for (int i = 0; i < NUM_LEDS; i++) pio_sm_put_blocking(rgb_pio, rgb_sm, px[i]);
}

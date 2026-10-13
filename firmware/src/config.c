#include "config.h"

#include <string.h>
#include <stddef.h>
#include "pico/stdlib.h"
#include "pico/flash.h"
#include "hardware/flash.h"
#include "hardware/sync.h"

yacc_config_t g_cfg;

#define CFG_OFFSET (PICO_FLASH_SIZE_BYTES - FLASH_SECTOR_SIZE)

static uint32_t crc32(const uint8_t *d, size_t n) {
    uint32_t c = 0xFFFFFFFFu;
    for (size_t i = 0; i < n; i++) {
        c ^= d[i];
        for (int k = 0; k < 8; k++) c = (c >> 1) ^ (0xEDB88320u & (-(int32_t)(c & 1)));
    }
    return ~c;
}

void config_seal(yacc_config_t *c) {
    c->magic = YACC_CFG_MAGIC;
    c->version = YACC_CFG_VERSION;
    c->crc = crc32((const uint8_t *)c, offsetof(yacc_config_t, crc));
}

bool config_validate(const yacc_config_t *c) {
    if (c->magic != YACC_CFG_MAGIC || c->version != YACC_CFG_VERSION) return false;
    if (c->crc != crc32((const uint8_t *)c, offsetof(yacc_config_t, crc))) return false;
    for (int i = 0; i < NUM_FUNCS; i++)
        if (c->pins[i] != PIN_NONE && c->pins[i] >= NUM_DIGITAL_PINS) return false;
    if (c->whammy_ch != PIN_NONE && c->whammy_ch >= NUM_ADC_CH) return false;
    if (c->tilt_pin != PIN_NONE && c->tilt_pin >= NUM_DIGITAL_PINS) return false;
    if (c->usb_mode >= NUM_MODES) return false;
    if (c->debounce_mode > DEB_BOTH) return false;
    if (c->debounce_100us > 5000) return false;      // 500 ms max
    if (c->whammy_smooth > 6 || c->whammy_deadzone > 30) return false;
    for (int i = 0; i < NUM_FRETS; i++)
        if (c->boot_modes[i] != MODE_NONE && c->boot_modes[i] >= NUM_MODES) return false;
    if (c->rgb_pin != PIN_NONE && c->rgb_pin >= NUM_DIGITAL_PINS) return false;
    if (c->rgb_effect >= NUM_EFX) return false;
    if (c->rgb_speed < 1 || c->rgb_speed > 10) return false;
    for (int i = 0; i < NUM_FRETS; i++) if (c->led_map[i] >= NUM_LEDS) return false;
    return true;
}

void config_defaults(yacc_config_t *c) {
    memset(c, 0, sizeof(*c));
    memset(c->pins, PIN_NONE, sizeof(c->pins));
    c->whammy_ch = PIN_NONE;
    c->whammy_min = 0;
    c->whammy_max = 4095;
    c->tilt_pin = PIN_NONE;
    c->usb_mode = MODE_XINPUT;
    c->debounce_mode = DEB_RELEASE;   // legacy field, the engine no longer has modes
    c->debounce_100us = 50;           // 5 ms
    c->whammy_smooth = 2;
    c->whammy_deadzone = 3;
    c->boot_modes[F_GREEN]  = MODE_XINPUT;
    c->boot_modes[F_RED]    = MODE_NONE;
    c->boot_modes[F_YELLOW] = MODE_HID;
    c->boot_modes[F_BLUE]   = MODE_PS3_GH;
    c->boot_modes[F_ORANGE] = MODE_NONE;
    c->flags |= CFG_FLAG_RGB_BOOTFLASH | CFG_FLAG_COMBINED_STRUM;
    c->rgb_pin = PIN_NONE;
    c->rgb_brightness = 40;
    c->rgb_effect = EFX_BRIGHT;
    c->rgb_speed = 5;
    static const uint8_t def_col[NUM_FRETS][3] = {
        {0x22, 0xC5, 0x5E}, {0xEF, 0x44, 0x44}, {0xFA, 0xCC, 0x15}, {0x3B, 0x82, 0xF6}, {0xFB, 0x92, 0x3C}};
    for (int i = 0; i < NUM_FRETS; i++) { c->led_map[i] = i; memcpy(c->colors[i], def_col[i], 3); }
    config_seal(c);
}

void config_load(void) {
    const yacc_config_t *flash = (const yacc_config_t *)(XIP_BASE + CFG_OFFSET);
    yacc_config_t tmp;
    memcpy(&tmp, flash, sizeof(tmp));
    if (config_validate(&tmp)) {
        g_cfg = tmp;
    } else {
        config_defaults(&g_cfg);
    }
}

typedef struct {
    uint8_t page[FLASH_PAGE_SIZE];
} write_job_t;

static void flash_write_cb(void *param) {
    write_job_t *job = (write_job_t *)param;
    flash_range_erase(CFG_OFFSET, FLASH_SECTOR_SIZE);
    flash_range_program(CFG_OFFSET, job->page, FLASH_PAGE_SIZE);
}

bool config_save(void) {
    static write_job_t job;
    memset(job.page, 0xFF, sizeof(job.page));
    config_seal(&g_cfg);
    memcpy(job.page, &g_cfg, sizeof(g_cfg));
    return flash_safe_execute(flash_write_cb, &job, 500) == PICO_OK;
}

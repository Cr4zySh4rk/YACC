// YACC persistent configuration (stored in the last flash sector)
#ifndef YACC_CONFIG_H_
#define YACC_CONFIG_H_

#include <stdint.h>
#include <stdbool.h>

// Logical controls. The web app maps each of these to a GPIO during setup.
enum {
    F_GREEN = 0,
    F_RED,
    F_YELLOW,
    F_BLUE,
    F_ORANGE,
    F_STRUM_UP,
    F_STRUM_DOWN,
    F_STAR,
    F_PLUS,
    NUM_FUNCS
};
#define NUM_FRETS 5

// USB personalities
enum {
    MODE_XINPUT = 0,   // Xbox 360 guitar (XInput) + WebUSB config
    MODE_PS3_GH = 1,   // PlayStation 3 Guitar Hero guitar (HID)
    MODE_HID    = 2,   // Generic HID gamepad + WebUSB config
    NUM_MODES
};
#define MODE_NONE 0xFF

#define PIN_NONE 0xFF

// Digital GPIOs that are scanned/usable for buttons (GP0..GP22).
// GP23-25 / GP29 are used by the board itself, GP26-28 are the analog inputs.
#define NUM_DIGITAL_PINS 23
#define NUM_ADC_CH       3

#define CFG_FLAG_BT_ENABLED     (1u << 0)
#define CFG_FLAG_TILT_ENABLED   (1u << 1)
#define CFG_FLAG_COMBINED_STRUM (1u << 2)   // strum up/down share one debounce window

// Debounce behaviour (same three flavours Santroller offers)
enum {
    DEB_RELEASE = 0,   // press instantly, hold the press for the debounce time after letting go
    DEB_PRESS   = 1,   // press only registers after being held for the debounce time, release is instant
    DEB_BOTH    = 2,   // classic: any change must be stable for the debounce time
};

#define YACC_CFG_MAGIC   0x43434159u  // "YACC" little endian
#define YACC_CFG_VERSION 2

// 40 bytes on the wire and in flash. Keep in sync with web/js/protocol.js
typedef struct __attribute__((packed)) {
    uint32_t magic;               // 0
    uint8_t  version;             // 4
    uint8_t  pins[NUM_FUNCS];     // 5..13   GPIO per function, PIN_NONE = unassigned
    uint8_t  whammy_ch;           // 14      0..2 (GP26..28) or PIN_NONE
    uint8_t  whammy_invert;       // 15
    uint16_t whammy_min;          // 16      raw 12-bit
    uint16_t whammy_max;          // 18
    uint8_t  tilt_pin;            // 20      GPIO or PIN_NONE
    uint8_t  flags;               // 21
    uint8_t  usb_mode;            // 22      mode used when nothing is held at plug-in
    uint8_t  debounce_mode;       // 23      DEB_*
    uint16_t debounce_100us;      // 24      debounce time in 100 us units
    uint8_t  whammy_smooth;       // 26      0 (off) .. 6 (heavy)
    uint8_t  whammy_deadzone;     // 27      percent of range
    uint8_t  boot_modes[NUM_FRETS]; // 28..32 mode to switch to when this fret is held at plug-in
    uint8_t  reserved[3];         // 33..35
    uint32_t crc;                 // 36      crc32 of bytes 0..35
} yacc_config_t;

_Static_assert(sizeof(yacc_config_t) == 40, "config size");

extern yacc_config_t g_cfg;

void config_defaults(yacc_config_t *c);
void config_load(void);
bool config_save(void);
bool config_validate(const yacc_config_t *c);
void config_seal(yacc_config_t *c);   // fill magic/version/crc

#endif

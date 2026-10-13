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
#define CFG_FLAG_RGB_ENABLED    (1u << 3)   // WS2812 strip on rgb_pin
#define CFG_FLAG_RGB_BOOTFLASH  (1u << 4)   // flash the mode's fret LED for 1 s after plug-in

// Debounce behaviour (same three flavours Santroller offers)
enum {
    DEB_RELEASE = 0,   // press instantly, hold the press for the debounce time after letting go
    DEB_PRESS   = 1,   // press only registers after being held for the debounce time, release is instant
    DEB_BOTH    = 2,   // classic: any change must be stable for the debounce time
};

#define YACC_CFG_MAGIC   0x43434159u  // "YACC" little endian
#define YACC_CFG_VERSION 3

#define NUM_LEDS 5
// What the fret LEDs do
enum {
    EFX_STATIC = 0,   // always full colour
    EFX_DIM,          // full colour, dims while the fret is held
    EFX_OFF,          // full colour, goes dark while the fret is held
    EFX_BRIGHT,       // dim colour, lights up while the fret is held
    EFX_FADE,         // dim colour, flashes on press and fades back out
    EFX_BREATHE,      // breathing idle, full on press
    EFX_RAINBOW,      // rainbow idle, fret colour on press
    NUM_EFX
};

// 64 bytes on the wire and in flash. Keep in sync with web/js/protocol.js
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
    uint8_t  rgb_pin;             // 33      data GPIO of the WS2812 chain or PIN_NONE
    uint8_t  rgb_brightness;      // 34      0..100 (scaled to at most 100/255 of full power)
    uint8_t  rgb_effect;          // 35      EFX_*
    uint8_t  rgb_speed;           // 36      1..10
    uint8_t  led_map[NUM_FRETS];  // 37..41  position in the chain of each fret's LED
    uint8_t  colors[NUM_FRETS][3];// 42..56  R,G,B of each fret
    uint8_t  reserved[3];         // 57..59
    uint32_t crc;                 // 60      crc32 of bytes 0..59
} yacc_config_t;

_Static_assert(sizeof(yacc_config_t) == 64, "config size");

extern yacc_config_t g_cfg;

void config_defaults(yacc_config_t *c);
void config_load(void);
bool config_save(void);
bool config_validate(const yacc_config_t *c);
void config_seal(yacc_config_t *c);   // fill magic/version/crc

#endif

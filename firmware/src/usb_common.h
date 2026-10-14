#ifndef YACC_USB_COMMON_H_
#define YACC_USB_COMMON_H_
#include <stdint.h>
#include <stdbool.h>
#include "tusb.h"

#define YACC_VID 0x1209   // pid.codes test VID/PID - change for your own builds
#define YACC_PID 0x0001

// Real-world identity used for the PS3 Guitar Hero guitar personality
#define REDOCTANE_VID    0x12BA
#define PS3_GH_GUITAR_PID 0x0100
#define PS3_RB_GUITAR_PID 0x0200   // Rock Band guitar (Santroller uses the same VID/PID)
#define HARMONIX_VID      0x1BAD
#define WII_RB_GUITAR_PID 0x0004
#define HORI_VID          0x0F0D
#define HORI_POKKEN_PID   0x0092
#define IS_PS3_MODE(m) ((m) == MODE_PS3_GH || (m) == MODE_PS3_RB)

#define ITF_PAD    0      // XInput or HID interface
#define ITF_CONFIG 1      // WebUSB configuration interface (modes that have one)
#define ITF_SECURITY 2    // Xbox 360 security interface (XInput mode)

#define EP_PAD_IN  0x81
#define EP_PAD_OUT 0x02

// Vendor request codes (bRequest).
#define VREQ_XINPUT   0x01   // Xbox 360 GET_REPORT style requests (caps / serial)
#define VREQ_WEBUSB   0x21   // announced in the BOS descriptor
#define VREQ_MS_OS    0x22   // announced in the BOS descriptor
#define VREQ_INFO     0x30   // IN  : device info
#define VREQ_STATUS   0x31   // IN  : live inputs
#define VREQ_GETCFG   0x32   // IN  : config struct
#define VREQ_SETCFG   0x33   // OUT : config struct (applied live, not saved)
#define VREQ_SAVE     0x34   // OUT : write config to flash
#define VREQ_DEFAULTS 0x35   // OUT : reset config to defaults (not saved)
#define VREQ_REBOOT   0x36   // OUT : wValue 0 = reboot, 1 = BOOTSEL
#define VREQ_SETMODE  0x37   // OUT : wValue = mode to store (applies after reboot)

#define VREQ_LEDTEST  0x38   // OUT : wValue = chain position to light white, 0xFFFF = back to normal

#define XINPUT_REPORT_LEN 20
#define PS3_REPORT_LEN    27
#define HID_REPORT_LEN    7
#define KEYBOARD_REPORT_LEN 8
#define SWITCH_REPORT_LEN 8
#define OGXBOX_REPORT_LEN 20

extern uint8_t g_usb_mode;         // MODE_* currently running
bool mode_has_config(uint8_t mode);
uint8_t xinput_subtype(void);
void usb_game_feedback(uint8_t command, uint8_t param);   // main.c: rumble-channel commands from games

void usb_request_setup_reboot(void);                                    // main.c
bool xinput_send(const uint8_t *report, uint16_t len);
bool usb_vendor_request(uint8_t rhport, uint8_t stage, tusb_control_request_t const *req);   // main.c
bool xinput_vendor_request(uint8_t rhport, uint8_t stage, tusb_control_request_t const *req);
const uint8_t *yacc_webusb_url_desc(uint16_t *len);
const uint8_t *yacc_ms_os_desc(uint16_t *len);
#endif

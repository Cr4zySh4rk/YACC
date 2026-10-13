// Bluetooth support. Real BLE-HID lives behind YACC_HAS_BT (wireless boards);
// on plain Pico / Pico 2 these are no-ops and the web app disables the toggle.
#include "bt.h"

#ifndef YACC_HAS_BT

bool bt_supported(void) { return false; }
void bt_init(bool enabled) { (void)enabled; }
void bt_task(void) {}
void bt_start_pairing(void) {}
uint8_t bt_state(void) { return BT_STATE_OFF; }
void bt_send_state(uint16_t b, int16_t w, int16_t t) { (void)b; (void)w; (void)t; }

#else

// Phase 2: btstack BLE HID-over-GATT implementation.
static uint8_t s_state;
bool bt_supported(void) { return true; }
void bt_init(bool enabled) { s_state = BT_STATE_OFF; (void)enabled; }
void bt_task(void) {}
void bt_start_pairing(void) { s_state = BT_STATE_PAIRING; }
uint8_t bt_state(void) { return s_state; }
void bt_send_state(uint16_t b, int16_t w, int16_t t) { (void)b; (void)w; (void)t; }

#endif

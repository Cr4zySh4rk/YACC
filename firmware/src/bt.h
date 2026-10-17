#ifndef YACC_BT_H_
#define YACC_BT_H_
#include <stdint.h>
#include <stdbool.h>

#define BT_STATE_OFF        0   // radio off, or waiting for the bonded host
#define BT_STATE_PAIRING    1   // discoverable, accepting a new host
#define BT_STATE_CONNECTED  2

// enabled: Bluetooth switched on in the configurator. pair: forget the old host and pair a new one
// (Star power held at power-on). With neither, the radio is never started.
void bt_init(bool enabled, bool pair);
void bt_task(void);
void bt_start_pairing(void);
uint8_t bt_state(void);
bool bt_supported(void);
bool bt_running(void);
// The 7 byte HID gamepad report (same layout as USB HID mode)
void bt_send_report(const uint8_t *report, uint16_t len);
// Pico W / Pico 2 W read USB power through the radio chip: 1 / 0, or -1 when unknown
int bt_vbus(void);
#endif

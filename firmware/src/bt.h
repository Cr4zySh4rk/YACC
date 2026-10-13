#ifndef YACC_BT_H_
#define YACC_BT_H_
#include <stdint.h>
#include <stdbool.h>

#define BT_STATE_OFF        0
#define BT_STATE_PAIRING    1
#define BT_STATE_CONNECTED  2

void bt_init(bool enabled);
void bt_task(void);
void bt_start_pairing(void);
uint8_t bt_state(void);
bool bt_supported(void);
// Called with the same data the USB side sends: 16 button bits + axes
void bt_send_state(uint16_t buttons, int16_t whammy, int16_t tilt);
#endif

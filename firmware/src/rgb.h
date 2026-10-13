#ifndef YACC_RGB_H_
#define YACC_RGB_H_
#include <stdint.h>
#include <stdbool.h>

void rgb_init(void);
void rgb_task(void);                       // call from the main loop, self-paced (~125 Hz)
void rgb_boot_indicator(uint8_t usb_mode); // flash the fret LED that selects this mode for 1 s
void rgb_test_led(int led);                // light only chain position `led` (white); -1 = normal again
bool rgb_active_pin(int p);                 // true while the PIO drives this GPIO
#endif

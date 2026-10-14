// USB host port (Pico-PIO-USB on PIO1) used to relay console authentication to a licensed controller.
#pragma once
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

bool usb_host_start(uint8_t dp_pin);   // D+ on dp_pin, D- on dp_pin + 1. Needs a 120 MHz system clock.
void usb_host_task(void);
bool usb_host_running(void);
bool usb_host_pin(uint8_t gpio);       // true for the two pins the host port owns

#ifdef __cplusplus
}
#endif

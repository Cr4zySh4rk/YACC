// Xbox One guitar mode: GIP device towards the console, with the console's authentication relayed
// to a licensed Xbox One / Series controller (or Mayflash-style dongle) on the USB host port.
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "tusb.h"

#ifdef __cplusplus
extern "C" {
#endif

#define XBONE_GUITAR_PAYLOAD_LEN 32   // input report body after the 4 byte GIP header

// Device side: hooks for the YAGCC TinyUSB application driver (usb_drivers.c)
void xbone_init(void);
void xbone_dev_reset(void);
uint16_t xbone_dev_open(uint8_t rhport, tusb_desc_interface_t const *itf, uint16_t max_len);
bool xbone_dev_xfer(uint8_t rhport, uint8_t ep_addr, xfer_result_t result, uint32_t bytes);
bool xbone_dev_control(uint8_t rhport, uint8_t stage, tusb_control_request_t const *req);

// Main loop: drives announce / descriptor / auth relay and sends the guitar state once authenticated
void xbone_task(const uint8_t *payload, bool guide);
bool xbone_authenticated(void);

// Host side (usb_host.cpp)
void xbone_host_mount(uint8_t dev_addr, uint8_t instance);
void xbone_host_unmount(uint8_t dev_addr);
void xbone_host_report(uint8_t dev_addr, uint8_t instance, const uint8_t *report, uint16_t len);

#ifdef __cplusplus
}
#endif

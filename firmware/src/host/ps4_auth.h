// PS4 guitar mode: console-facing feature reports + relay of the console's authentication
// challenge to a licensed DualShock 4 / PS4 auth dongle on the USB host port.
#pragma once
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define PS4_REPORT_LEN 64        // report id 1 + 63 bytes

const uint8_t *ps4_report_desc(uint16_t *len);   // DualShock 4 style HID report descriptor

// Device side (called from TinyUSB HID callbacks, report id already stripped/prepended by TinyUSB)
uint16_t ps4_dev_get_report(uint8_t report_id, uint8_t report_type, uint8_t *buffer, uint16_t reqlen);
void ps4_dev_set_report(uint8_t report_id, uint8_t report_type, const uint8_t *buffer, uint16_t len);

// Host side
void ps4_host_mount(uint8_t dev_addr, uint8_t instance, const uint8_t *desc_report, uint16_t desc_len);
void ps4_host_unmount(uint8_t dev_addr);
void ps4_host_set_report_complete(uint8_t dev_addr, uint8_t instance, uint8_t report_id, uint16_t len);
void ps4_host_get_report_complete(uint8_t dev_addr, uint8_t instance, uint8_t report_id, uint16_t len);
void ps4_auth_task(void);
bool ps4_auth_device_ready(void);

#ifdef __cplusplus
}
#endif

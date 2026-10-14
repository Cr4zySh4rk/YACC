// TinyUSB host class driver for Xbox One / Series controllers (GIP, interface FF/47/D0).
// Adapted from GP2040-CE src/drivers/shared/xinput_host.cpp (MIT licence) for the TinyUSB
// version in Pico SDK 2.1.1. Only the Xbox One path is kept: it is the one used to relay
// console authentication.
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "tusb.h"
#include "host/usbh_pvt.h"

#ifdef __cplusplus
extern "C" {
#endif

#ifndef CFG_TUH_XINPUT_EPIN_BUFSIZE
#define CFG_TUH_XINPUT_EPIN_BUFSIZE 64
#endif
#ifndef CFG_TUH_XINPUT_EPOUT_BUFSIZE
#define CFG_TUH_XINPUT_EPOUT_BUFSIZE 64
#endif

bool tuh_xinput_send_report(uint8_t dev_addr, uint8_t instance, uint8_t const *report, uint16_t len);

// Callbacks, implemented in usb_host.cpp
void tuh_xinput_mount_cb(uint8_t dev_addr, uint8_t instance);
void tuh_xinput_umount_cb(uint8_t dev_addr, uint8_t instance);
void tuh_xinput_report_received_cb(uint8_t dev_addr, uint8_t instance, uint8_t const *report, uint16_t len);

extern const usbh_class_driver_t xinput_host_driver;

#ifdef __cplusplus
}
#endif

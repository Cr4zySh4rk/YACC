#ifndef TUSB_CONFIG_H_
#define TUSB_CONFIG_H_

#ifdef __cplusplus
extern "C" {
#endif

#ifndef CFG_TUSB_OS
#define CFG_TUSB_OS OPT_OS_NONE
#endif

// Root port 0 = the board's own USB connector (device). The host port is started by hand on
// root port 1 (Pico-PIO-USB), only in the PS4 / Xbox One modes: see host/usb_host.cpp.
#define CFG_TUSB_RHPORT0_MODE (OPT_MODE_DEVICE)
#define CFG_TUD_ENABLED       1
#define CFG_TUD_ENDPOINT0_SIZE 64

// All classes are implemented as custom application drivers (see usb_drivers.c)
#define CFG_TUD_CDC     0
#define CFG_TUD_MSC     0
#define CFG_TUD_HID     1
#define CFG_TUD_HID_EP_BUFSIZE 64
#define CFG_TUD_MIDI    0
#define CFG_TUD_VENDOR  0

// ---------------------------------------------------------------- USB host (authentication relay)
#define CFG_TUH_ENABLED       1
#define CFG_TUH_RPI_PIO_USB   1
#define BOARD_TUH_RHPORT      1
#define CFG_TUH_HUB           0
#define CFG_TUH_DEVICE_MAX    1
#define CFG_TUH_ENUMERATION_BUFSIZE 1024   // a DualShock 4 report descriptor is ~500 bytes
#define CFG_TUH_HID           4
#define CFG_TUH_HID_EPIN_BUFSIZE  64
#define CFG_TUH_HID_EPOUT_BUFSIZE 64
#define CFG_TUH_XINPUT        1            // Xbox One / Series controllers (host/xinput_host.cpp)

#ifdef __cplusplus
}
#endif

#endif

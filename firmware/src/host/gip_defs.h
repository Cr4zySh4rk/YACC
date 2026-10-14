// Xbox One GIP command ids (from GP2040-CE XBOneDescriptors.h, MIT licence).
#pragma once
#include <stdint.h>

enum {
    GIP_ACK_RESPONSE             = 0x01,
    GIP_ANNOUNCE                 = 0x02,
    GIP_KEEPALIVE                = 0x03,
    GIP_DEVICE_DESCRIPTOR        = 0x04,
    GIP_POWER_MODE_DEVICE_CONFIG = 0x05,
    GIP_AUTH                     = 0x06,
    GIP_VIRTUAL_KEYCODE          = 0x07,
    GIP_CMD_RUMBLE               = 0x09,
    GIP_CMD_LED_ON               = 0x0A,
    GIP_FINAL_AUTH               = 0x1E,
    GIP_INPUT_REPORT             = 0x20,
    GIP_HID_REPORT               = 0x21,
};

#define XBONE_ENDPOINT_SIZE 64

// GIP_AUTH / GIP_FINAL_AUTH, or an ACK of one (acked command in byte 5)
static inline bool xbone_is_auth_packet(const uint8_t *data, uint16_t len) {
    if (len < 4) return false;
    if (data[0] == 0x06 || data[0] == 0x1E) return true;
    return data[0] == 0x01 && len >= 6 && (data[5] == 0x06 || data[5] == 0x1E);
}

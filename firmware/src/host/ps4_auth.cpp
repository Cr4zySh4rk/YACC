// PS4 authentication passthrough. The flow and the dongle state machine follow GP2040-CE
// (src/drivers/ps4/PS4Driver.cpp and PS4AuthUSBListener.cpp, MIT licence, Copyright (c) 2024
// OpenStickCommunity); the guitar controller definition follows Santroller
// (src/emulation/usb/ps4_device.cpp, GPL-3.0).
//
//   console --F0 (5 pages of the 256 byte nonce)--> YAGCC --F0--> DualShock 4 / dongle
//   console --F2 (ready?)-->  YAGCC answers "signing" until the dongle is done
//   console --F1 (19 pages of signature + keys)--> YAGCC  <--F1-- dongle
#include <string.h>
#include "tusb.h"
#include "pico/time.h"
#include "ps4_auth.h"
#include "ps4_tables.h"

const uint8_t *ps4_report_desc(uint16_t *len) {
    *len = sizeof(ps4_report_descriptor);
    return ps4_report_descriptor;
}

enum {
    PS4_GET_CALIBRATION = 0x02, PS4_DEFINITION = 0x03, PS4_GET_MAC_ADDRESS = 0x12, PS4_SET_HOST_MAC = 0x13,
    PS4_SET_USB_BT_CONTROL = 0x14, PS4_GET_VERSION_DATE = 0xA3,
    PS4_SET_AUTH_PAYLOAD = 0xF0, PS4_GET_SIGNATURE_NONCE = 0xF1, PS4_GET_SIGNING_STATE = 0xF2, PS4_RESET_AUTH = 0xF3,
};

static const uint8_t output_0xf3[] = {0x00, 0x38, 0x38, 0x00, 0x00, 0x00, 0x00};

// Controller definition (feature 0x03, 47 bytes without the id): a Rock Band 4 guitar.
// Santroller's values: features = lightbar | extended, type 1 = guitar, byte 23 = 0x07 (Rock Band).
static const uint8_t ps4_definition_guitar[47] = {
    0x21, 0x27, 0x04, 0x14, 0x01, 0x2c, 0x56, 0xa0, 0x0f, 0x3d, 0x00, 0x00, 0x04, 0x01, 0x00, 0x00,
    0x20, 0x0d, 0x0d, 0x00, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

static uint32_t crc32(const uint8_t *d, size_t n) {
    uint32_t c = 0xFFFFFFFFu;
    for (size_t i = 0; i < n; i++) {
        c ^= d[i];
        for (int k = 0; k < 8; k++) c = (c >> 1) ^ (0xEDB88320u & (uint32_t)-(int32_t)(c & 1));
    }
    return ~c;
}

static inline uint32_t now_ms() { return to_ms_since_boot(get_absolute_time()); }

// ---------------------------------------------------------------- shared state
typedef enum { AUTH_IDLE, AUTH_CONSOLE_TO_DONGLE, AUTH_DONGLE_TO_CONSOLE } auth_state_t;

static uint8_t auth_buffer[1064];          // nonce in, then signature + serial + keys out (19 x 56 bytes)
static volatile auth_state_t pass_state = AUTH_IDLE;
static uint8_t nonce_id;                   // id the console used for the current nonce
static uint8_t cur_nonce_id = 1;
static uint8_t cur_nonce_chunk;
static volatile bool dongle_ready;
static volatile bool host_reset_pending;     // console sent F3: restart the dongle side too (GP2040 resetAuth)

bool ps4_auth_device_ready(void) { return dongle_ready; }

// ---------------------------------------------------------------- device side (console)
uint16_t ps4_dev_get_report(uint8_t report_id, uint8_t report_type, uint8_t *buffer, uint16_t reqlen) {
    if (report_type != HID_REPORT_TYPE_FEATURE) return 0;
    uint8_t data[64] = {0};
    uint32_t crc;
    uint16_t n = 0;
    switch (report_id) {
        case PS4_GET_CALIBRATION: n = sizeof(ps4_output_0x02); memcpy(buffer, ps4_output_0x02, n < reqlen ? n : reqlen); break;
        case PS4_DEFINITION:      n = sizeof(ps4_definition_guitar); memcpy(buffer, ps4_definition_guitar, n < reqlen ? n : reqlen); break;
        case PS4_GET_MAC_ADDRESS: n = sizeof(ps4_output_0x12); memcpy(buffer, ps4_output_0x12, n < reqlen ? n : reqlen); break;
        case PS4_GET_VERSION_DATE: n = sizeof(ps4_output_0xa3); memcpy(buffer, ps4_output_0xa3, n < reqlen ? n : reqlen); break;
        case PS4_GET_SIGNATURE_NONCE:
            // 56 byte pages of what the dongle returned
            data[0] = 0xF1; data[1] = cur_nonce_id; data[2] = cur_nonce_chunk; data[3] = 0;
            memcpy(&data[4], &auth_buffer[cur_nonce_chunk * 56], 56);
            crc = crc32(data, 60);
            memcpy(&data[60], &crc, 4);
            n = reqlen < 63 ? reqlen : 63;
            memcpy(buffer, &data[1], n);
            if (++cur_nonce_chunk == 19) { cur_nonce_chunk = 0; pass_state = AUTH_IDLE; }
            return n;
        case PS4_GET_SIGNING_STATE:
            data[0] = 0xF2; data[1] = cur_nonce_id;
            data[2] = pass_state == AUTH_DONGLE_TO_CONSOLE ? 0 : 16;   // 0 = signed, 16 = still signing
            crc = crc32(data, 12);
            memcpy(&data[12], &crc, 4);
            n = reqlen < 15 ? reqlen : 15;
            memcpy(buffer, &data[1], n);
            return n;
        case PS4_RESET_AUTH:
            n = sizeof(output_0xf3) < reqlen ? sizeof(output_0xf3) : reqlen;
            memcpy(buffer, output_0xf3, n);
            pass_state = AUTH_IDLE;
            cur_nonce_chunk = 0;
            host_reset_pending = true;
            return n;
        default:
            return 0;
    }
    return n < reqlen ? n : reqlen;
}

void ps4_dev_set_report(uint8_t report_id, uint8_t report_type, const uint8_t *buffer, uint16_t len) {
    if (report_type != HID_REPORT_TYPE_FEATURE || report_id != PS4_SET_AUTH_PAYLOAD) return;
    if (len != 63 || buffer[1] > 4) return;
    uint8_t full[64];
    full[0] = report_id;
    memcpy(&full[1], buffer, len);
    uint32_t got;
    memcpy(&got, &full[60], 4);
    if (crc32(full, 60) != got) return;              // corrupted page
    uint8_t id = buffer[0], page = buffer[1];
    if (page == 0) cur_nonce_id = id;
    else if (id != cur_nonce_id) { pass_state = AUTH_IDLE; return; }
    if (page == 4) {                                  // 4 x 56 + 32 = 256 byte nonce
        memcpy(&auth_buffer[page * 56], &full[4], 32);
        nonce_id = id;
        pass_state = AUTH_CONSOLE_TO_DONGLE;
    } else {
        memcpy(&auth_buffer[page * 56], &full[4], 56);
    }
}

// ---------------------------------------------------------------- host side (DualShock 4 / dongle)
#define CB_TIMEOUT_MS 500
#define POLL_INTERVAL_MS 10

typedef enum { D_NO_NONCE, D_RECEIVING_NONCE, D_SIGNED_NONCE_READY, D_SENDING_NONCE } dongle_state_t;

static uint8_t ps_dev_addr = 0xFF, ps_instance = 0xFF;
static dongle_state_t dstate = D_NO_NONCE;
static uint8_t nonce_page, nonce_chunk;
static bool awaiting_cb, need_definition;
static uint32_t awaiting_since, last_poll;
static uint8_t report_buffer[64];

static void reset_host(void) {
    nonce_page = nonce_chunk = 0;
    awaiting_cb = false;
    dstate = D_NO_NONCE;
}

static bool host_get(uint8_t id, uint16_t len) {
    awaiting_cb = tuh_hid_get_report(ps_dev_addr, ps_instance, id, HID_REPORT_TYPE_FEATURE, report_buffer, len);
    if (awaiting_cb) awaiting_since = now_ms();
    return awaiting_cb;
}

static bool host_set(uint8_t id, uint16_t len) {
    awaiting_cb = tuh_hid_set_report(ps_dev_addr, ps_instance, id, HID_REPORT_TYPE_FEATURE, report_buffer, len);
    if (awaiting_cb) awaiting_since = now_ms();
    return awaiting_cb;
}

void ps4_host_mount(uint8_t dev_addr, uint8_t instance, const uint8_t *desc_report, uint16_t desc_len) {
    if (dongle_ready) return;
    // A PS4-family auth interface has the vendor feature reports F0..F3 on usage page 0xFFF0
    tuh_hid_report_info_t info[32];
    uint8_t n = tuh_hid_parse_report_descriptor(info, 32, desc_report, desc_len);
    bool ok = false;
    for (uint8_t i = 0; i < n; i++) if (info[i].usage_page == 0xFFF0 && info[i].report_id == 0xF3) ok = true;
    if (!ok) return;
    ps_dev_addr = dev_addr;
    ps_instance = instance;
    reset_host();
    need_definition = true;
    dongle_ready = true;
}

void ps4_host_unmount(uint8_t dev_addr) {
    if (!dongle_ready || dev_addr != ps_dev_addr) return;
    ps_dev_addr = ps_instance = 0xFF;
    need_definition = false;
    reset_host();
    dongle_ready = false;
}

void ps4_auth_task(void) {
    if (!dongle_ready) return;
    if (awaiting_cb) {
        if (now_ms() - awaiting_since < CB_TIMEOUT_MS) return;
        // lost completion: start over; the console retries with a new nonce if needed
        bool intact = dstate != D_SENDING_NONCE;
        reset_host();
        if (!intact) pass_state = AUTH_IDLE;
    }
    if (host_reset_pending) { host_reset_pending = false; reset_host(); }   // only between transfers
    if (need_definition) {                         // wakes some dongles up
        memset(report_buffer, 0, sizeof(report_buffer));
        if (host_get(PS4_DEFINITION, 48)) need_definition = false;
        return;
    }
    switch (dstate) {
        case D_NO_NONCE:
            if (pass_state == AUTH_CONSOLE_TO_DONGLE) {
                memcpy(report_buffer, output_0xf3, sizeof(output_0xf3));
                host_get(PS4_RESET_AUTH, sizeof(output_0xf3) + 1);
            }
            break;
        case D_RECEIVING_NONCE: {
            report_buffer[0] = PS4_SET_AUTH_PAYLOAD;
            report_buffer[1] = nonce_id;
            report_buffer[2] = nonce_page;
            report_buffer[3] = 0;
            if (nonce_page == 4) {
                memcpy(&report_buffer[4], &auth_buffer[nonce_page * 56], 32);
                memset(&report_buffer[36], 0, 24);
            } else {
                memcpy(&report_buffer[4], &auth_buffer[nonce_page * 56], 56);
            }
            uint32_t crc = crc32(report_buffer, 60);
            memcpy(&report_buffer[60], &crc, 4);
            if (host_set(PS4_SET_AUTH_PAYLOAD, 64)) nonce_page++;
            break;
        }
        case D_SIGNED_NONCE_READY:
            if (now_ms() - last_poll < POLL_INTERVAL_MS) break;
            report_buffer[0] = PS4_GET_SIGNING_STATE;
            report_buffer[1] = nonce_id;
            memset(&report_buffer[2], 0, 14);
            host_get(PS4_GET_SIGNING_STATE, 16);
            break;
        case D_SENDING_NONCE:
            report_buffer[0] = PS4_GET_SIGNATURE_NONCE;
            report_buffer[1] = nonce_id;
            report_buffer[2] = nonce_chunk;
            memset(&report_buffer[3], 0, 61);
            if (host_get(PS4_GET_SIGNATURE_NONCE, 64)) nonce_chunk++;
            break;
    }
}

void ps4_host_set_report_complete(uint8_t dev_addr, uint8_t instance, uint8_t report_id, uint16_t len) {
    (void)len;
    if (!dongle_ready || !awaiting_cb || dev_addr != ps_dev_addr || instance != ps_instance) return;
    if (report_id == PS4_SET_AUTH_PAYLOAD && nonce_page == 5) {
        nonce_page = 0;
        last_poll = now_ms() - POLL_INTERVAL_MS;
        dstate = D_SIGNED_NONCE_READY;
    }
    awaiting_cb = false;
}

void ps4_host_get_report_complete(uint8_t dev_addr, uint8_t instance, uint8_t report_id, uint16_t len) {
    (void)len;
    if (!dongle_ready || !awaiting_cb || dev_addr != ps_dev_addr || instance != ps_instance) return;
    switch (report_id) {
        case PS4_RESET_AUTH:
            nonce_page = nonce_chunk = 0;
            dstate = D_RECEIVING_NONCE;
            break;
        case PS4_GET_SIGNING_STATE:
            // [2]: 0 = signed, 1 = signing error, 16 = not ready yet
            if (report_buffer[2] == 0) dstate = D_SENDING_NONCE;
            else if (report_buffer[2] == 1) { reset_host(); pass_state = AUTH_IDLE; return; }
            else last_poll = now_ms();
            break;
        case PS4_GET_SIGNATURE_NONCE:
            if (nonce_chunk == 0 || nonce_chunk > 19) break;
            memcpy(&auth_buffer[(nonce_chunk - 1) * 56], &report_buffer[4], 56);
            if (nonce_chunk == 19) {
                nonce_chunk = 0;
                dstate = D_NO_NONCE;
                cur_nonce_chunk = 0;
                pass_state = AUTH_DONGLE_TO_CONSOLE;
            }
            break;
        default:
            break;
    }
    awaiting_cb = false;
}

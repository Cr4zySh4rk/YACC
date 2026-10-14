// USB class glue: XInput (custom driver), HID callbacks (PS3 handshake), config interface.
#include "tusb.h"
#include "device/usbd_pvt.h"
#include "usb_common.h"
#include "config.h"
#include <string.h>

static uint8_t ep_in, ep_out;
static uint8_t out_buf[32];
static uint8_t in_buf[32];

bool xinput_send(const uint8_t *report, uint16_t len) {
    if (!tud_ready() || ep_in == 0 || len > sizeof(in_buf)) return false;
    if (usbd_edpt_busy(0, ep_in)) return false;
    if (!usbd_edpt_claim(0, ep_in)) return false;
    memcpy(in_buf, report, len);
    if (!usbd_edpt_xfer(0, ep_in, in_buf, len)) {
        usbd_edpt_release(0, ep_in);
        return false;
    }
    return true;
}

// ---------------------------------------------------------------- app driver
static void drv_init(void) {}
static bool drv_deinit(void) { return true; }
static void drv_reset(uint8_t rhport) {
    (void)rhport;
    ep_in = ep_out = 0;
}

static uint16_t drv_open(uint8_t rhport, tusb_desc_interface_t const *itf, uint16_t max_len) {
    if (itf->bInterfaceClass != TUSB_CLASS_VENDOR_SPECIFIC) return 0;   // HID is handled by TinyUSB itself

    if (itf->bInterfaceSubClass == 0x5D && itf->bInterfaceProtocol == 0x01) {
        const uint16_t len = 9 + 17 + 7 + 7;           // interface, XInput class desc, 2 endpoints
        TU_VERIFY(max_len >= len, 0);
        uint8_t const *p = tu_desc_next(tu_desc_next((uint8_t const *)itf));
        TU_ASSERT(usbd_open_edpt_pair(rhport, p, 2, TUSB_XFER_INTERRUPT, &ep_out, &ep_in), 0);
        usbd_edpt_xfer(rhport, ep_out, out_buf, sizeof(out_buf));   // keep OUT primed (rumble/LED, ignored)
        return len;
    }
    if (itf->bInterfaceSubClass == 0x00 && itf->bInterfaceProtocol == 0x00) {
        return 9;   // config interface has no endpoints
    }
    return 0;
}

static bool drv_control(uint8_t rhport, uint8_t stage, tusb_control_request_t const *req) {
    if (stage != CONTROL_STAGE_SETUP) return true;
    if (req->bmRequestType_bit.direction == TUSB_DIR_IN) {
        static uint8_t zeros[32];
        uint16_t n = req->wLength < sizeof(zeros) ? req->wLength : sizeof(zeros);
        return tud_control_xfer(rhport, req, zeros, n);
    }
    if (req->wLength == 0) return tud_control_status(rhport, req);
    static uint8_t sink[32];
    return tud_control_xfer(rhport, req, sink, req->wLength < sizeof(sink) ? req->wLength : sizeof(sink));
}

static bool drv_xfer(uint8_t rhport, uint8_t ep_addr, xfer_result_t result, uint32_t bytes) {
    (void)result; (void)bytes;
    if (ep_out && ep_addr == ep_out) usbd_edpt_xfer(rhport, ep_out, out_buf, sizeof(out_buf));
    return true;
}

static const usbd_class_driver_t yacc_driver = {
#if CFG_TUSB_DEBUG >= CFG_TUD_LOG_LEVEL
    .name = "YAGCC",
#endif
    .init = drv_init,
    .deinit = drv_deinit,
    .reset = drv_reset,
    .open = drv_open,
    .control_xfer_cb = drv_control,
    .xfer_cb = drv_xfer,
    .sof = NULL,
};

usbd_class_driver_t const *usbd_app_driver_get_cb(uint8_t *driver_count) {
    *driver_count = 1;
    return &yacc_driver;
}

// ---------------------------------------------------------------- XInput vendor requests
// Windows' Xbox driver (and games) ask the device for its capabilities and a serial number.
// Same replies Santroller gives, so the controller is classified as a guitar.
#define XI_WVALUE_SERIAL   0x0000
#define XI_WVALUE_INPUTCAP 0x0100
#define XI_WVALUE_VIBECAP  0x0000
#define XINPUT_SUBTYPE     0x06

bool xinput_vendor_request(uint8_t rhport, uint8_t stage, tusb_control_request_t const *req) {
    if (stage != CONTROL_STAGE_SETUP) return true;
    if (req->bmRequestType_bit.direction != TUSB_DIR_IN) return false;

    static uint8_t buf[20];
    uint16_t len = 0;

    if (req->bmRequestType_bit.recipient == TUSB_REQ_RCPT_INTERFACE) {
        if (req->wValue == XI_WVALUE_INPUTCAP) {
            memset(buf, 0, sizeof(buf));
            buf[0] = 0x00; buf[1] = 20;
            buf[2] = 0x3F; buf[3] = 0xF7;               // buttons 0xF73F
            buf[4] = 0xFF; buf[5] = 0xFF;               // triggers
            buf[6] = YACC_VID & 0xFF; buf[7] = YACC_VID >> 8;
            buf[8] = YACC_PID & 0xFF; buf[9] = YACC_PID >> 8;
            buf[10] = 0x00; buf[11] = XINPUT_SUBTYPE;   // version word = subtype << 8
            buf[12] = 0xC0; buf[13] = 0xFF;             // 0xFFC0
            buf[18] = 0x01; buf[19] = 0x00;             // XINPUT_FLAGS_FORCE_FEEDBACK
            len = 20;
        } else if (req->wValue == XI_WVALUE_VIBECAP) {
            memset(buf, 0, 8);
            buf[1] = 8; buf[3] = 0xFF; buf[4] = 0xFF;
            len = 8;
        } else {
            return false;
        }
    } else if (req->wValue == XI_WVALUE_SERIAL && req->wIndex == 0) {
        uint32_t serial = time_us_32();
        memcpy(buf, &serial, 4);
        len = 4;
    } else {
        return false;
    }
    if (len > req->wLength) len = req->wLength;
    return tud_control_xfer(rhport, req, buf, len);
}

// All vendor-type control requests (XInput + WebUSB/MS OS + YAGCC config protocol)
bool tud_vendor_control_xfer_cb(uint8_t rhport, uint8_t stage, tusb_control_request_t const *request) {
    if (request->bRequest == VREQ_XINPUT && g_usb_mode == MODE_XINPUT &&
        request->bmRequestType_bit.direction == TUSB_DIR_IN) {
        return xinput_vendor_request(rhport, stage, request);
    }
    return usb_vendor_request(rhport, stage, request);
}

// ---------------------------------------------------------------- HID (PS3 / generic)
static const uint8_t ps3_init_report[8] = {0x21, 0x26, 0x01, 0x06, 0x00, 0x00, 0x00, 0x00};

uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type,
                               uint8_t *buffer, uint16_t reqlen) {
    (void)instance;
    if (IS_PS3_MODE(g_usb_mode) && report_type == HID_REPORT_TYPE_FEATURE && report_id == 0) {
        // the PS3 handshake: byte 3 = 0x06 identifies a guitar (GH and RB alike)
        uint16_t n = reqlen < sizeof(ps3_init_report) ? reqlen : sizeof(ps3_init_report);
        memcpy(buffer, ps3_init_report, n);
        return n;
    }
    return 0;
}

// The configurator (WebHID) sends feature report "YAGCC!" to a controller running in PS3 mode
// to restart it in setup mode without unplugging.
void tud_hid_set_report_cb(uint8_t instance, uint8_t report_id, hid_report_type_t report_type,
                           uint8_t const *buffer, uint16_t bufsize) {
    (void)instance; (void)report_id;
    if (report_type == HID_REPORT_TYPE_FEATURE && bufsize >= 6 && memcmp(buffer, "YAGCC!", 6) == 0) {
        usb_request_setup_reboot();
    }
}

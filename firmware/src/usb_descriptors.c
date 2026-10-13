#include "tusb.h"
#include "pico/unique_id.h"
#include "usb_common.h"
#include "config.h"
#include <string.h>

uint8_t g_usb_mode = MODE_XINPUT;

bool mode_has_config(uint8_t mode) { return mode != MODE_PS3_GH; }

// ================================================================ HID report descriptors
// PS3 Guitar Hero guitar: same report descriptor Santroller uses (27 byte input report).
static const uint8_t desc_hid_ps3_gh[] = {
    HID_USAGE_PAGE(HID_USAGE_PAGE_DESKTOP),
    HID_USAGE(HID_USAGE_DESKTOP_GAMEPAD),
    HID_COLLECTION(HID_COLLECTION_APPLICATION),
    HID_USAGE_PAGE(HID_USAGE_PAGE_BUTTON),
    HID_LOGICAL_MIN(0), HID_LOGICAL_MAX(1), HID_PHYSICAL_MIN(0), HID_PHYSICAL_MAX(1),
    HID_REPORT_COUNT(13), HID_REPORT_SIZE(1),
    HID_USAGE_MIN(0x01), HID_USAGE_MAX(13),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    HID_REPORT_COUNT(3),
    HID_INPUT(HID_CONSTANT | HID_VARIABLE | HID_ABSOLUTE),
    HID_USAGE_PAGE(HID_USAGE_PAGE_DESKTOP),
    HID_USAGE(HID_USAGE_DESKTOP_HAT_SWITCH),
    HID_LOGICAL_MAX(7),
    HID_PHYSICAL_MAX_N(315, 2),
    HID_REPORT_COUNT(1), HID_REPORT_SIZE(4),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    HID_REPORT_COUNT(1),
    HID_INPUT(HID_CONSTANT | HID_VARIABLE | HID_ABSOLUTE),
    HID_USAGE_PAGE(HID_USAGE_PAGE_DESKTOP),
    HID_LOGICAL_MAX_N(255, 2), HID_PHYSICAL_MAX_N(255, 2),
    HID_USAGE(HID_USAGE_DESKTOP_X), HID_USAGE(HID_USAGE_DESKTOP_Y),
    HID_USAGE(HID_USAGE_DESKTOP_Z), HID_USAGE(HID_USAGE_DESKTOP_RZ),
    HID_REPORT_COUNT(4), HID_REPORT_SIZE(8),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    // 12 vendor "pressure" bytes
    HID_USAGE_PAGE_N(HID_USAGE_PAGE_VENDOR, 2),
    HID_USAGE(0x20), HID_USAGE(0x21), HID_USAGE(0x22), HID_USAGE(0x23),
    HID_USAGE(0x24), HID_USAGE(0x25), HID_USAGE(0x26), HID_USAGE(0x27),
    HID_USAGE(0x28), HID_USAGE(0x29), HID_USAGE(0x2A), HID_USAGE(0x2B),
    HID_REPORT_COUNT(0x0C),
    HID_LOGICAL_MIN(0x00), HID_LOGICAL_MAX_N(0xff, 2),
    HID_REPORT_SIZE(8),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    // PS3 output + feature (handshake) reports
    HID_REPORT_SIZE(8),
    HID_USAGE_N(0x2621, 2),
    HID_REPORT_COUNT(8),
    HID_OUTPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    HID_USAGE_N(0x2621, 2),
    HID_REPORT_COUNT(32),
    HID_FEATURE(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    // accelerometer words
    HID_USAGE(0x2C), HID_USAGE(0x2D), HID_USAGE(0x2E), HID_USAGE(0x2F),
    HID_REPORT_COUNT(4),
    HID_LOGICAL_MAX_N(0x3ff, 2), HID_PHYSICAL_MAX_N(0x3ff, 2),
    HID_REPORT_SIZE(16),
    HID_REPORT_COUNT(4),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    HID_COLLECTION_END,
};

// Generic HID gamepad: 16 buttons, hat, X/Y/Z/Rz bytes (7 byte report, no report id).
static const uint8_t desc_hid_generic[] = {
    HID_USAGE_PAGE(HID_USAGE_PAGE_DESKTOP),
    HID_USAGE(HID_USAGE_DESKTOP_GAMEPAD),
    HID_COLLECTION(HID_COLLECTION_APPLICATION),
    HID_USAGE_PAGE(HID_USAGE_PAGE_BUTTON),
    HID_USAGE_MIN(1), HID_USAGE_MAX(16),
    HID_LOGICAL_MIN(0), HID_LOGICAL_MAX(1),
    HID_REPORT_SIZE(1), HID_REPORT_COUNT(16),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    HID_USAGE_PAGE(HID_USAGE_PAGE_DESKTOP),
    HID_USAGE(HID_USAGE_DESKTOP_HAT_SWITCH),
    HID_LOGICAL_MIN(0), HID_LOGICAL_MAX(7),
    HID_PHYSICAL_MIN(0), HID_PHYSICAL_MAX_N(315, 2),
    HID_REPORT_SIZE(4), HID_REPORT_COUNT(1),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE | HID_NULL_STATE),
    HID_REPORT_COUNT(1),
    HID_INPUT(HID_CONSTANT | HID_VARIABLE | HID_ABSOLUTE),
    HID_USAGE(HID_USAGE_DESKTOP_X), HID_USAGE(HID_USAGE_DESKTOP_Y),
    HID_USAGE(HID_USAGE_DESKTOP_Z), HID_USAGE(HID_USAGE_DESKTOP_RZ),
    HID_LOGICAL_MIN(0), HID_LOGICAL_MAX_N(255, 2),
    HID_PHYSICAL_MIN(0), HID_PHYSICAL_MAX_N(255, 2),
    HID_REPORT_SIZE(8), HID_REPORT_COUNT(4),
    HID_INPUT(HID_DATA | HID_VARIABLE | HID_ABSOLUTE),
    HID_COLLECTION_END,
};

uint8_t const *tud_hid_descriptor_report_cb(uint8_t instance) {
    (void)instance;
    return g_usb_mode == MODE_PS3_GH ? desc_hid_ps3_gh : desc_hid_generic;
}

// ================================================================ device descriptor
static tusb_desc_device_t desc_device;

uint8_t const *tud_descriptor_device_cb(void) {
    memset(&desc_device, 0, sizeof(desc_device));
    desc_device.bLength = sizeof(desc_device);
    desc_device.bDescriptorType = TUSB_DESC_DEVICE;
    desc_device.bcdUSB = mode_has_config(g_usb_mode) ? 0x0210 : 0x0200;   // >= 2.01 so hosts read the BOS
    desc_device.bDeviceClass = 0x00;       // per-interface (lets Windows treat it as composite)
    desc_device.bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE;
    desc_device.idVendor = YACC_VID;
    desc_device.idProduct = YACC_PID;
    desc_device.bcdDevice = 0x0100;
    desc_device.iManufacturer = 1;
    desc_device.iProduct = 2;
    desc_device.iSerialNumber = 3;
    desc_device.bNumConfigurations = 1;

    switch (g_usb_mode) {
        case MODE_PS3_GH:
            desc_device.idVendor = REDOCTANE_VID;
            desc_device.idProduct = PS3_GH_GUITAR_PID;
            break;
        case MODE_HID:
            desc_device.idProduct = 0x0002;
            break;
        default:
            break;
    }
    return (uint8_t const *)&desc_device;
}

// ================================================================ configuration
#define XINPUT_SUBTYPE_GUITAR 0x06   // Rock Band style guitar layout

#define XINPUT_IF_LEN 40
#define HID_IF_LEN    32
#define CONFIG_IF_LEN 9

static uint8_t desc_config[9 + XINPUT_IF_LEN + CONFIG_IF_LEN];

uint8_t const *tud_descriptor_configuration_cb(uint8_t index) {
    (void)index;
    uint8_t *p = desc_config;
    bool cfg = mode_has_config(g_usb_mode);
    uint8_t n_itf = cfg ? 2 : 1;
    uint16_t body = (g_usb_mode == MODE_XINPUT ? XINPUT_IF_LEN : HID_IF_LEN) + (cfg ? CONFIG_IF_LEN : 0);

    uint8_t hdr[] = {TUD_CONFIG_DESCRIPTOR(1, n_itf, 0, 9 + body, TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 100)};
    memcpy(p, hdr, sizeof(hdr)); p += sizeof(hdr);

    if (g_usb_mode == MODE_XINPUT) {
        const uint8_t x[] = {
            9, TUSB_DESC_INTERFACE, ITF_PAD, 0, 2, 0xFF, 0x5D, 0x01, 0,
            17, 0x21, 0x10, 0x01, XINPUT_SUBTYPE_GUITAR, 0x25, EP_PAD_IN, 0x14, 0x03, 0x03, 0x03, 0x04, 0x13, EP_PAD_OUT, 0x08, 0x03, 0x03,
            7, TUSB_DESC_ENDPOINT, EP_PAD_IN, TUSB_XFER_INTERRUPT, U16_TO_U8S_LE(0x20), 1,
            7, TUSB_DESC_ENDPOINT, EP_PAD_OUT, TUSB_XFER_INTERRUPT, U16_TO_U8S_LE(0x20), 8,
        };
        memcpy(p, x, sizeof(x)); p += sizeof(x);
    } else {
        uint16_t rlen = (g_usb_mode == MODE_PS3_GH) ? sizeof(desc_hid_ps3_gh) : sizeof(desc_hid_generic);
        const uint8_t h[] = {TUD_HID_INOUT_DESCRIPTOR(ITF_PAD, 0, HID_ITF_PROTOCOL_NONE, rlen, EP_PAD_OUT, EP_PAD_IN, 64, 1)};
        memcpy(p, h, sizeof(h)); p += sizeof(h);
    }
    if (cfg) {
        const uint8_t c[] = {9, TUSB_DESC_INTERFACE, ITF_CONFIG, 0, 0, 0xFF, 0x00, 0x00, 4};
        memcpy(p, c, sizeof(c)); p += sizeof(c);
    }
    return desc_config;
}

// ================================================================ BOS (WebUSB + MS OS 2.0)
#define MS_OS_20_DESC_LEN 0xB2
#define BOS_TOTAL_LEN (TUD_BOS_DESC_LEN + TUD_BOS_WEBUSB_DESC_LEN + TUD_BOS_MICROSOFT_OS_DESC_LEN)

static const uint8_t desc_bos[] = {
    TUD_BOS_DESCRIPTOR(BOS_TOTAL_LEN, 2),
    TUD_BOS_WEBUSB_DESCRIPTOR(VREQ_WEBUSB, 1),
    TUD_BOS_MS_OS_20_DESCRIPTOR(MS_OS_20_DESC_LEN, VREQ_MS_OS),
};

uint8_t const *tud_descriptor_bos_cb(void) {
    return mode_has_config(g_usb_mode) ? desc_bos : NULL;
}

// Landing page: Chrome offers to open this when the controller is plugged in. Scheme 1 = https://
#define LANDING_URL "cr4zysh4rk.github.io/YACC/"
const uint8_t *yacc_webusb_url_desc(uint16_t *len) {
    static uint8_t d[3 + sizeof(LANDING_URL)];
    size_t n = sizeof(LANDING_URL) - 1;
    d[0] = (uint8_t)(3 + n);
    d[1] = 3;   // WEBUSB_URL
    d[2] = 1;   // https://
    memcpy(&d[3], LANDING_URL, n);
    *len = d[0];
    return d;
}

// MS OS 2.0 descriptor set: binds the config interface (1) to WinUSB so the browser can open it.
const uint8_t *yacc_ms_os_desc(uint16_t *len) {
    static uint8_t d[MS_OS_20_DESC_LEN];
    static bool built = false;
    if (!built) {
        uint8_t *p = d;
        #define W16(v) do { *p++ = (uint8_t)((v) & 0xFF); *p++ = (uint8_t)(((v) >> 8) & 0xFF); } while (0)
        W16(0x000A); W16(0x0000);                              // set header
        *p++ = 0x00; *p++ = 0x00; *p++ = 0x03; *p++ = 0x06;    // Windows 8.1+
        W16(MS_OS_20_DESC_LEN);
        W16(0x0008); W16(0x0001); *p++ = 0; *p++ = 0; W16(MS_OS_20_DESC_LEN - 0x0A);                       // configuration subset
        W16(0x0008); W16(0x0002); *p++ = ITF_CONFIG; *p++ = 0; W16(MS_OS_20_DESC_LEN - 0x0A - 0x08);      // function subset
        W16(0x0014); W16(0x0003);                                                                          // compatible id
        memcpy(p, "WINUSB\0\0", 8); p += 8;
        memset(p, 0, 8); p += 8;
        W16(0x0084); W16(0x0004); W16(0x0007); W16(0x002A);                                                // DeviceInterfaceGUIDs
        const char *name = "DeviceInterfaceGUIDs";
        for (int i = 0; i < 20; i++) { *p++ = (uint8_t)name[i]; *p++ = 0; }
        *p++ = 0; *p++ = 0;
        W16(0x0050);
        const char *guid = "{B7E2F0A1-4C3D-4E5F-9A6B-7C8D9E0F1A2B}";
        for (int i = 0; i < 38; i++) { *p++ = (uint8_t)guid[i]; *p++ = 0; }
        *p++ = 0; *p++ = 0;
        *p++ = 0; *p++ = 0;
        #undef W16
        built = true;
    }
    *len = MS_OS_20_DESC_LEN;
    return d;
}

// ================================================================ strings
enum { STR_LANG = 0, STR_MANUF, STR_PRODUCT, STR_SERIAL, STR_CONFIG };

static uint16_t desc_str[40];

uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
    (void)langid;
    const char *s = NULL;
    char serial[2 * PICO_UNIQUE_BOARD_ID_SIZE_BYTES + 1];
    uint8_t chr_count;

    if (index == STR_LANG) {
        desc_str[1] = 0x0409;
        chr_count = 1;
    } else {
        switch (index) {
            case STR_MANUF:   s = (g_usb_mode == MODE_PS3_GH) ? "RedOctane" : "YACC"; break;
            case STR_PRODUCT:
                s = g_usb_mode == MODE_PS3_GH ? "Guitar Hero3 for PlayStation (R) 3"
                  : g_usb_mode == MODE_HID    ? "YACC Guitar (HID)"
                                              : "YACC Guitar Controller";
                break;
            case STR_SERIAL:  pico_get_unique_board_id_string(serial, sizeof(serial)); s = serial; break;
            case STR_CONFIG:  s = "YACC Configuration"; break;
            default: return NULL;
        }
        chr_count = (uint8_t)strlen(s);
        if (chr_count > 38) chr_count = 38;
        for (uint8_t i = 0; i < chr_count; i++) desc_str[1 + i] = s[i];
    }
    desc_str[0] = (uint16_t)((TUSB_DESC_STRING << 8) | (2 * chr_count + 2));
    return desc_str;
}

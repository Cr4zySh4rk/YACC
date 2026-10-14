// See xinput_host.h. Adapted from GP2040-CE (MIT licence, Copyright (c) 2024 OpenStickCommunity).
#include <string.h>
#include "xinput_host.h"

typedef struct {
    uint8_t itf_num;
    uint8_t ep_in, ep_out;
    uint16_t epin_size, epout_size;
    bool mounted;
    uint8_t epin_buf[CFG_TUH_XINPUT_EPIN_BUFSIZE];
    uint8_t epout_buf[CFG_TUH_XINPUT_EPOUT_BUFSIZE];
} xinputh_interface_t;

static xinputh_interface_t _itf[CFG_TUH_DEVICE_MAX];

static inline xinputh_interface_t *get_itf(uint8_t dev_addr) {
    return (dev_addr >= 1 && dev_addr <= CFG_TUH_DEVICE_MAX) ? &_itf[dev_addr - 1] : nullptr;
}

bool tuh_xinput_send_report(uint8_t dev_addr, uint8_t instance, uint8_t const *report, uint16_t len) {
    (void)instance;
    xinputh_interface_t *x = get_itf(dev_addr);
    if (!x || !x->mounted || x->ep_out == 0 || len > x->epout_size || len > sizeof(x->epout_buf)) return false;
    if (!tuh_ready(dev_addr) || usbh_edpt_busy(dev_addr, x->ep_out)) return false;
    if (!usbh_edpt_claim(dev_addr, x->ep_out)) return false;
    memcpy(x->epout_buf, report, len);
    if (!usbh_edpt_xfer(dev_addr, x->ep_out, x->epout_buf, len)) {
        usbh_edpt_release(dev_addr, x->ep_out);
        return false;
    }
    return true;
}

static bool xinputh_init(void) {
    memset(_itf, 0, sizeof(_itf));
    return true;
}

static bool xinputh_deinit(void) { return true; }

static bool xinputh_open(uint8_t rhport, uint8_t dev_addr, tusb_desc_interface_t const *desc_itf, uint16_t max_len) {
    (void)rhport;
    // Xbox One / Series controller: vendor class, subclass 0x47, protocol 0xD0, with endpoints
    if (desc_itf->bInterfaceClass != TUSB_CLASS_VENDOR_SPECIFIC || desc_itf->bInterfaceSubClass != 0x47 ||
        desc_itf->bInterfaceProtocol != 0xD0 || desc_itf->bNumEndpoints == 0) return false;
    xinputh_interface_t *x = get_itf(dev_addr);
    if (!x || x->ep_in || x->ep_out) return false;   // first GIP interface only (later ones are audio etc.)

    uint8_t const *p = (uint8_t const *)desc_itf;
    uint16_t pos = 0;
    uint8_t ep = 0;
    while (ep < desc_itf->bNumEndpoints && pos < max_len) {
        if (tu_desc_type(p) == TUSB_DESC_ENDPOINT) {
            tusb_desc_endpoint_t const *e = (tusb_desc_endpoint_t const *)p;
            TU_ASSERT(tuh_edpt_open(dev_addr, e));
            if (tu_edpt_dir(e->bEndpointAddress) == TUSB_DIR_IN) {
                x->ep_in = e->bEndpointAddress;
                x->epin_size = tu_edpt_packet_size(e);
            } else {
                x->ep_out = e->bEndpointAddress;
                x->epout_size = tu_edpt_packet_size(e);
            }
            ep++;
        }
        pos += tu_desc_len(p);
        p = tu_desc_next(p);
    }
    x->itf_num = desc_itf->bInterfaceNumber;
    return x->ep_in != 0;
}

static bool xinputh_set_config(uint8_t dev_addr, uint8_t itf_num) {
    xinputh_interface_t *x = get_itf(dev_addr);
    if (x && x->itf_num == itf_num && x->ep_in) {
        x->mounted = true;
        tuh_xinput_mount_cb(dev_addr, 0);
        usbh_edpt_xfer(dev_addr, x->ep_in, x->epin_buf, x->epin_size);
    }
    usbh_driver_set_config_complete(dev_addr, itf_num);
    return true;
}

static bool xinputh_xfer_cb(uint8_t dev_addr, uint8_t ep_addr, xfer_result_t result, uint32_t xferred_bytes) {
    xinputh_interface_t *x = get_itf(dev_addr);
    if (!x) return false;
    if (tu_edpt_dir(ep_addr) == TUSB_DIR_IN) {
        if (result == XFER_RESULT_SUCCESS && xferred_bytes > 0)
            tuh_xinput_report_received_cb(dev_addr, 0, x->epin_buf, (uint16_t)xferred_bytes);
        usbh_edpt_xfer(dev_addr, x->ep_in, x->epin_buf, x->epin_size);   // keep listening
    }
    return true;
}

static void xinputh_close(uint8_t dev_addr) {
    xinputh_interface_t *x = get_itf(dev_addr);
    if (!x) return;
    if (x->mounted) tuh_xinput_umount_cb(dev_addr, 0);
    memset(x, 0, sizeof(*x));
}

extern "C" const usbh_class_driver_t xinput_host_driver = {
    .name = "XINPUT",
    .init = xinputh_init,
    .deinit = xinputh_deinit,
    .open = xinputh_open,
    .set_config = xinputh_set_config,
    .xfer_cb = xinputh_xfer_cb,
    .close = xinputh_close,
};

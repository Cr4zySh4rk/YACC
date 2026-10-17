// Bluetooth (BLE HID gamepad, HID-over-GATT) on boards with the CYW43 radio (Pico W, Pico 2 W).
// Other boards get no-op stubs and the web app disables the toggle.
//
// Pairing works like a PlayStation controller's PS + Create: hold Star power while plugging in or switching
// on (or hold Star power + Plus for 5 s while running) and the guitar forgets its previous host and becomes
// discoverable for a new one. Otherwise only the bonded host can reconnect.
#include "bt.h"

#ifndef YACC_HAS_BT

bool bt_supported(void) { return false; }
void bt_init(bool enabled, bool pair) { (void)enabled; (void)pair; }
void bt_task(void) {}
void bt_start_pairing(void) {}
uint8_t bt_state(void) { return BT_STATE_OFF; }
bool bt_running(void) { return false; }
void bt_send_report(const uint8_t *r, uint16_t len) { (void)r; (void)len; }
int bt_vbus(void) { return -1; }

#else

#include <string.h>
#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"
#include "btstack.h"
#include "ble/gatt-service/device_information_service_server.h"
#include "ble/gatt-service/hids_device.h"
#include "yagcc.h"                       // GATT database generated from yagcc.gatt
#include "rgb.h"

#define PAIRING_TIMEOUT_MS 120000u       // stop being discoverable after two minutes, like a game controller
#define BT_REPORT_LEN 7

// Same layout as USB HID mode (16 buttons, hat, X/Y/Z/Rz), with report id 1 to match hids.gatt
static const uint8_t ble_hid_desc[] = {
    0x05, 0x01, 0x09, 0x05, 0xA1, 0x01,             // Generic Desktop / Gamepad / Application
    0x85, 0x01,                                     //   Report ID 1
    0x05, 0x09, 0x19, 0x01, 0x29, 0x10,             //   Buttons 1..16
    0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x10, 0x81, 0x02,
    0x05, 0x01, 0x09, 0x39,                         //   Hat switch
    0x15, 0x00, 0x25, 0x07, 0x35, 0x00, 0x46, 0x3B, 0x01, 0x75, 0x04, 0x95, 0x01, 0x81, 0x42,
    0x95, 0x01, 0x81, 0x03,                         //   4 bit pad
    0x09, 0x30, 0x09, 0x31, 0x09, 0x32, 0x09, 0x35, //   X Y Z Rz
    0x15, 0x00, 0x26, 0xFF, 0x00, 0x35, 0x00, 0x46, 0xFF, 0x00, 0x75, 0x08, 0x95, 0x04, 0x81, 0x02,
    0xC0,
};

#define ADV_NAME 0x0D, BLUETOOTH_DATA_TYPE_COMPLETE_LOCAL_NAME, 'Y', 'A', 'G', 'C', 'C', ' ', 'G', 'u', 'i', 't', 'a', 'r'
#define ADV_HID  0x03, BLUETOOTH_DATA_TYPE_COMPLETE_LIST_OF_16_BIT_SERVICE_CLASS_UUIDS, 0x12, 0x18, \
                 0x03, BLUETOOTH_DATA_TYPE_APPEARANCE, 0xC4, 0x03       /* HID service, gamepad appearance */
static const uint8_t adv_pairing[]   = { 0x02, BLUETOOTH_DATA_TYPE_FLAGS, 0x06, ADV_HID, ADV_NAME };  // discoverable
static const uint8_t adv_reconnect[] = { 0x02, BLUETOOTH_DATA_TYPE_FLAGS, 0x04, ADV_HID, ADV_NAME };  // bonded host only

static bool s_running;                    // radio initialised
static volatile bool s_pairing;           // discoverable and accepting a new host
static volatile bool s_connected;         // host subscribed to input reports
static volatile bool s_want_pair;         // pairing requested before the stack was up
static volatile bool s_powered;
static uint32_t s_pair_until;
static hci_con_handle_t s_con = HCI_CON_HANDLE_INVALID;
static uint8_t s_report[BT_REPORT_LEN];
static btstack_packet_callback_registration_t s_hci_cb, s_sm_cb;

static void set_adv(bool pairing) {
    bd_addr_t null_addr = {0};
    gap_advertisements_enable(0);
    // 30 ms while pairing so hosts find it quickly, 100 ms while waiting for the bonded host
    uint16_t itv = pairing ? 0x0030 : 0x00A0;
    gap_advertisements_set_params(itv, itv, 0 /* connectable undirected */, 0, null_addr, 0x07, 0x00);
    gap_advertisements_set_data(pairing ? sizeof(adv_pairing) : sizeof(adv_reconnect),
                                (uint8_t *)(pairing ? adv_pairing : adv_reconnect));
    gap_advertisements_enable(1);
}

static void begin_pairing(void) {         // stack running, called from its context or under the lock
    if (s_con != HCI_CON_HANDLE_INVALID) gap_disconnect(s_con);
    for (int i = 0; i < le_device_db_max_count(); i++) le_device_db_remove(i);   // forget the old host
    s_pairing = true;
    s_pair_until = to_ms_since_boot(get_absolute_time()) + PAIRING_TIMEOUT_MS;
    set_adv(true);
    rgb_set_bt(RGB_BT_PAIRING);
}

static void packet_handler(uint8_t type, uint16_t channel, uint8_t *packet, uint16_t size) {
    (void)channel; (void)size;
    if (type != HCI_EVENT_PACKET) return;
    switch (hci_event_packet_get_type(packet)) {
        case BTSTACK_EVENT_STATE:
            if (btstack_event_state_get_state(packet) != HCI_STATE_WORKING) break;
            s_powered = true;
            if (s_want_pair) { s_want_pair = false; begin_pairing(); }
            else set_adv(false);
            break;
        case HCI_EVENT_DISCONNECTION_COMPLETE:
            s_con = HCI_CON_HANDLE_INVALID;
            s_connected = false;
            rgb_set_bt(s_pairing ? RGB_BT_PAIRING : RGB_BT_OFF);
            break;                        // the stack resumes advertising by itself
        case SM_EVENT_JUST_WORKS_REQUEST:
            // only a host we are pairing with may bond; outside pairing mode just the stored host gets in
            if (s_pairing) sm_just_works_confirm(sm_event_just_works_request_get_handle(packet));
            else sm_bonding_decline(sm_event_just_works_request_get_handle(packet));
            break;
        case SM_EVENT_NUMERIC_COMPARISON_REQUEST:
            if (s_pairing) sm_numeric_comparison_confirm(sm_event_numeric_comparison_request_get_handle(packet));
            else sm_bonding_decline(sm_event_numeric_comparison_request_get_handle(packet));
            break;
        case SM_EVENT_PAIRING_COMPLETE:
            if (sm_event_pairing_complete_get_status(packet) == ERROR_CODE_SUCCESS) s_pairing = false;
            break;
        case HCI_EVENT_HIDS_META:
            switch (hci_event_hids_meta_get_subevent_code(packet)) {
                case HIDS_SUBEVENT_INPUT_REPORT_ENABLE:
                    s_con = hids_subevent_input_report_enable_get_con_handle(packet);
                    s_connected = hids_subevent_input_report_enable_get_enable(packet) != 0;
                    if (s_connected) {
                        s_pairing = false;
                        rgb_set_bt(RGB_BT_CONNECTED);
                        hids_device_request_can_send_now_event(s_con);
                    }
                    break;
                case HIDS_SUBEVENT_CAN_SEND_NOW:
                    if (s_con != HCI_CON_HANDLE_INVALID) hids_device_send_input_report(s_con, s_report, BT_REPORT_LEN);
                    break;
                default: break;
            }
            break;
        default: break;
    }
}

bool bt_supported(void) { return true; }
bool bt_running(void) { return s_running; }

void bt_init(bool enabled, bool pair) {
    if (s_running || (!enabled && !pair)) return;   // radio stays off: no power, no PIO or DMA used
    if (cyw43_arch_init()) return;
    s_running = true;
    s_want_pair = pair;
    s_report[2] = 0x08; s_report[3] = s_report[4] = 0x80;   // hat and sticks centred

    l2cap_init();
    sm_init();
    sm_set_io_capabilities(IO_CAPABILITY_NO_INPUT_NO_OUTPUT);
    sm_set_authentication_requirements(SM_AUTHREQ_SECURE_CONNECTION | SM_AUTHREQ_BONDING);
    att_server_init(profile_data, NULL, NULL);
    device_information_service_server_init();
    device_information_service_server_set_manufacturer_name("YAGCC");
    device_information_service_server_set_model_number("Guitar controller");
    hids_device_init(0, ble_hid_desc, sizeof(ble_hid_desc));

    s_hci_cb.callback = &packet_handler;
    hci_add_event_handler(&s_hci_cb);
    s_sm_cb.callback = &packet_handler;
    sm_add_event_handler(&s_sm_cb);
    hids_device_register_packet_handler(packet_handler);
    hci_power_control(HCI_POWER_ON);
    if (pair) rgb_set_bt(RGB_BT_PAIRING);
}

void bt_start_pairing(void) {
    if (!s_running) { bt_init(true, true); return; }
    async_context_t *ctx = cyw43_arch_async_context();
    async_context_acquire_lock_blocking(ctx);
    if (s_powered) begin_pairing(); else s_want_pair = true;
    async_context_release_lock(ctx);
}

void bt_task(void) {
    if (!s_running || !s_pairing) return;
    if ((int32_t)(to_ms_since_boot(get_absolute_time()) - s_pair_until) <= 0) return;
    async_context_t *ctx = cyw43_arch_async_context();     // nobody paired in time: stop being discoverable
    async_context_acquire_lock_blocking(ctx);
    s_pairing = false;
    if (s_con == HCI_CON_HANDLE_INVALID) set_adv(false);
    rgb_set_bt(s_connected ? RGB_BT_CONNECTED : RGB_BT_OFF);
    async_context_release_lock(ctx);
}

uint8_t bt_state(void) {
    return s_connected ? BT_STATE_CONNECTED : s_pairing ? BT_STATE_PAIRING : BT_STATE_OFF;
}

void bt_send_report(const uint8_t *r, uint16_t len) {
    if (!s_running) return;
    if (len > BT_REPORT_LEN) len = BT_REPORT_LEN;
    async_context_t *ctx = cyw43_arch_async_context();
    async_context_acquire_lock_blocking(ctx);
    memcpy(s_report, r, len);
    if (s_connected && s_con != HCI_CON_HANDLE_INVALID) hids_device_request_can_send_now_event(s_con);
    async_context_release_lock(ctx);
}

int bt_vbus(void) {
#ifdef CYW43_WL_GPIO_VBUS_PIN
    if (s_running) return cyw43_arch_gpio_get(CYW43_WL_GPIO_VBUS_PIN) ? 1 : 0;
#endif
    return -1;
}

#endif

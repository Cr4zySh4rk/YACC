// YACC flash nuke: erases the entire flash chip (firmware + saved settings)
// and drops the board back into BOOTSEL (USB mass storage) mode, ready for a
// fresh firmware. Runs from RAM, so it is safe to erase the flash it ran from.
#include "pico/stdlib.h"
#include "pico/bootrom.h"
#include "hardware/flash.h"
#include "hardware/sync.h"

int main(void) {
    uint32_t ints = save_and_disable_interrupts();
    flash_range_erase(0, PICO_FLASH_SIZE_BYTES);
    restore_interrupts(ints);

    // Back to BOOTSEL so the user can drop the next UF2 straight on.
    reset_usb_boot(0, 0);
    while (true) {
        tight_loop_contents();
    }
}

// Board definition for generic "Pico-compatible" RP2040 clones (e.g. boards with an ESP8285
// on them instead of a real CYW43 radio). Same trick Santroller's pico_w_compat uses:
// generic flash boot stage, slower flash clock, longer crystal start-up wait.
#ifndef _BOARDS_PICO_CLONE_H
#define _BOARDS_PICO_CLONE_H

#include "boards/pico.h"

#undef PICO_BOOT_STAGE2_CHOOSE_W25Q080
#define PICO_BOOT_STAGE2_CHOOSE_GENERIC_03H 1
#define PICO_XOSC_STARTUP_DELAY_MULTIPLIER 64

#undef PICO_FLASH_SPI_CLKDIV
#define PICO_FLASH_SPI_CLKDIV 4

#undef PICO_RP2040_B0_SUPPORTED
#define PICO_RP2040_B0_SUPPORTED 1
#undef PICO_RP2040_B1_SUPPORTED
#define PICO_RP2040_B1_SUPPORTED 1

#endif

cmake_minimum_required(VERSION 3.13)

# Custom board headers (pico_clone = generic RP2040 clones)
set(PICO_BOARD_HEADER_DIRS ${CMAKE_CURRENT_LIST_DIR}/boards)

# Usage:  cmake -B build -DPICO_BOARD=pico_w -DPICO_SDK_PATH=/path/to/pico-sdk
include(pico_sdk_import.cmake)

project(yacc C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

pico_sdk_init()

set(YACC_VERSION_MAJOR 0)
set(YACC_VERSION_MINOR 4)

# Board ids reported to the web app
if(PICO_BOARD STREQUAL "pico")
  set(YACC_BOARD_ID 0)
elseif(PICO_BOARD STREQUAL "pico_w")
  set(YACC_BOARD_ID 1)
elseif(PICO_BOARD STREQUAL "pico2")
  set(YACC_BOARD_ID 2)
elseif(PICO_BOARD STREQUAL "pico2_w")
  set(YACC_BOARD_ID 3)
elseif(PICO_BOARD STREQUAL "pico_clone")
  set(YACC_BOARD_ID 4)
elseif(PICO_BOARD STREQUAL "waveshare_rp2040_zero")
  set(YACC_BOARD_ID 5)
elseif(PICO_BOARD STREQUAL "waveshare_rp2040_one")
  set(YACC_BOARD_ID 6)
elseif(PICO_BOARD STREQUAL "sparkfun_promicro")
  set(YACC_BOARD_ID 7)
elseif(PICO_BOARD STREQUAL "adafruit_kb2040")
  set(YACC_BOARD_ID 8)

else()
  set(YACC_BOARD_ID 255)
endif()

add_executable(yacc
  src/main.c
  src/usb_descriptors.c
  src/usb_drivers.c
  src/config.c
  src/input.c
  src/bt.c
  src/rgb.c
  # libxsm3 (Xbox 360 security, LGPL-2.1, by InvoxiPlayGames - same copy Santroller ships)
  lib/xsm3/excrypt_des.c
  lib/xsm3/excrypt_parve.c
  lib/xsm3/excrypt_sha.c
  lib/xsm3/usbdsec.c
  lib/xsm3/xsm3.c
)

pico_generate_pio_header(yacc ${CMAKE_CURRENT_LIST_DIR}/src/ws2812.pio)

target_include_directories(yacc PRIVATE src lib/xsm3)

target_compile_definitions(yacc PRIVATE
  YACC_VERSION_MAJOR=${YACC_VERSION_MAJOR}
  YACC_VERSION_MINOR=${YACC_VERSION_MINOR}
  YACC_BOARD_ID=${YACC_BOARD_ID}
)

target_link_libraries(yacc
  pico_stdlib
  pico_unique_id
  pico_flash
  hardware_gpio
  hardware_adc
  hardware_flash
  hardware_sync
  hardware_watchdog
  hardware_pio
  hardware_clocks
  tinyusb_device
)

pico_add_extra_outputs(yacc)

# Wireless boards get Bluetooth (BLE HID) support
if(PICO_BOARD STREQUAL "pico_w" OR PICO_BOARD STREQUAL "pico2_w")
  target_compile_definitions(yacc PRIVATE YACC_HAS_BT=1)
endif()

# ---- flash nuke -------------------------------------------------------------
add_subdirectory(nuke)

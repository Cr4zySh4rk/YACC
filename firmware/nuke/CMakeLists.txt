add_executable(yacc_nuke nuke.c)
target_link_libraries(yacc_nuke pico_stdlib hardware_flash)
# Run straight from RAM so it can erase the flash it was loaded to
pico_set_binary_type(yacc_nuke no_flash)
pico_add_extra_outputs(yacc_nuke)

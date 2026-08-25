cmake_minimum_required(VERSION 3.22.1)
project(mobilediagnosticskit)

find_package(mmkv REQUIRED CONFIG)

add_library(
  mobilediagnosticskit
  SHARED
  src/main/cpp/MobileDiagnosticsStorage.cpp
)

target_link_libraries(
  mobilediagnosticskit
  mmkv::mmkv
  android
  log
)

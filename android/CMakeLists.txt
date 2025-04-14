cmake_minimum_required(VERSION 3.4.1)
project(rnsynctasks)

set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

add_library(rnsynctasks   SHARED
             ../cpp/react-native-sync-tasks.cpp
            ../cpp/react-native-sync-tasks.hpp
            ../cpp/constants.hpp
            ../cpp/JSTask.hpp
            ../cpp/JSTask.cpp
            ../cpp/JSManager.hpp
            ../cpp/JSManager.cpp
            ../cpp/helpers/helpers.hpp
            ../cpp/helpers/FetchService.cpp
            ../cpp/helpers/FetchService.hpp
            cpp-adapter.cpp
)

# Specifies a path to native header files.
 include_directories(
             ../cpp
 )

find_package(ReactAndroid REQUIRED CONFIG)

find_package(fbjni REQUIRED CONFIG)

target_include_directories(
        rnsynctasks PRIVATE
        "${NODE_MODULES_DIR}/react-native/React"
        "${NODE_MODULES_DIR}/react-native/React/Base"
        "${NODE_MODULES_DIR}/react-native/ReactCommon"
        "${NODE_MODULES_DIR}/react-native/ReactCommon/jsi"
        "${NODE_MODULES_DIR}/react-native/ReactCommon/callinvoker"
        "${NODE_MODULES_DIR}/react-native/ReactAndroid/src/main/jni/react/turbomodule"
        "${NODE_MODULES_DIR}/react-native/ReactCommon/runtimeexecutor"
)


target_link_libraries(rnsynctasks
        ReactAndroid::jsi
        log
        ReactAndroid::reactnative
        fbjni::fbjni
)

cmake_minimum_required(VERSION 3.4.1)
project(rnsynctasks)

set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

add_library(fetcher STATIC IMPORTED)

set_target_properties(fetcher PROPERTIES IMPORTED_LOCATION "${CMAKE_SOURCE_DIR}/src/main/libs/${ANDROID_ABI}/libfetcher.a")


add_library(rnsynctasks   SHARED
             ../cpp/react-native-sync-tasks.cpp
            ../cpp/react-native-sync-tasks.hpp
            ../cpp/constants.hpp
            ../cpp/JSTask.hpp
            ../cpp/JSTask.cpp
            ../cpp/JSManager.hpp
            ../cpp/JSManager.cpp
            ../cpp/helpers/helpers.hpp
            ../cpp/core/TaskScheduler.hpp
            ../cpp/fetcher.h
            cpp-adapter.cpp

)

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
        fetcher
)

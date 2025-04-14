#!/bin/bash

NDK_VERSION=27.2.12479018
ANDROID_NDK=~/Library/Android/sdk/ndk/$NDK_VERSION
PREBUILT=$ANDROID_NDK/toolchains/llvm/prebuilt/darwin-x86_64

CLANG=$PREBUILT/bin/x86_64-linux-android21-clang
AR=$PREBUILT/bin/llvm-ar

if [ ! -f "$CLANG" ]; then
  echo "❌ Compiler not found: $CLANG"
  exit 1
fi

export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER=$CLANG
export CC_x86_64_linux_android=$CLANG
export AR_x86_64_linux_android=$AR

# cargo build --release --target x86_64-linux-android
cargo build --release --target aarch64-linux-android
# cargo build --release --target armv7-linux-androideabi
# cargo build --release --target x86_64-linux-android
# cargo build --release --target i686-linux-android

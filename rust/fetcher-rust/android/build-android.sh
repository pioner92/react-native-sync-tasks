#!/bin/bash
cargo install cargo-ndk
cargo ndk -t armeabi-v7a -t arm64-v8a -t x86_64 -o ./libs build --release
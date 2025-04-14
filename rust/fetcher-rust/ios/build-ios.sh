#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "📦 Building libfetcher.a for device and simulator (arm64)..."

# Ensure targets are installed
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# Build for device
echo "🚀 Building for device (aarch64-apple-ios)..."
cargo build --release --target aarch64-apple-ios

# Build for simulator (ARM64 Mac)
echo "🧪 Building for simulator (aarch64-apple-ios-sim)..."
cargo build --release --target aarch64-apple-ios-sim

# Create xcframework (универсальный подход для всех случаев)
echo "📦 Creating xcframework..."
mkdir -p ios/universal

xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libfetcher.a \
  -headers include \
  -library target/aarch64-apple-ios-sim/release/libfetcher.a \
  -headers include \
  -output ios/universal/fetcher.xcframework

echo "✅ Done: ios/universal/fetcher.xcframework created."

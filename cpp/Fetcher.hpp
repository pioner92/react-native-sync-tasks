//
//  Fetcher.hpp
//  SyncTasks
//

#pragma once

#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

struct CPPHeaderItem {
  std::string key;
  std::string value;
};

using CPPHeaders = std::vector<CPPHeaderItem>;

struct FetchRequest {
  std::string url;
  std::string method;  // GET, POST, PUT, PATCH or DELETE
  CPPHeaders headers;
  std::optional<std::string> body;
  int timeoutMs;
};

struct FetchResult {
  bool ok;
  int code;  // 0 when the request failed before an HTTP response
  std::string body;
  CPPHeaders headers;  // response headers, names lowercased
};

// Lets another thread abort a request that is in flight.
class CancelToken {
 public:
  void cancel() {
    std::function<void()> onCancel;
    {
      std::lock_guard lock(mutex_);
      if (cancelled_) {
        return;
      }
      cancelled_ = true;
      onCancel = std::move(onCancel_);
    }
    if (onCancel) {
      onCancel();
    }
  }

  // Registers how to abort the platform request; runs it right away if already cancelled.
  void setOnCancel(std::function<void()> onCancel) {
    {
      std::lock_guard lock(mutex_);
      if (!cancelled_) {
        onCancel_ = std::move(onCancel);
        return;
      }
    }
    onCancel();
  }

  void clearOnCancel() {
    std::lock_guard lock(mutex_);
    onCancel_ = nullptr;
  }

  bool isCancelled() {
    std::lock_guard lock(mutex_);
    return cancelled_;
  }

 private:
  std::mutex mutex_;
  bool cancelled_ = false;
  std::function<void()> onCancel_;
};

// Blocking request on the platform HTTP stack: NSURLSession (ios/Fetcher.mm), OkHttp (android/Fetcher.cpp).
// timeoutMs bounds the whole request, from connecting to the last byte of the body.
FetchResult platformFetch(const FetchRequest& request, CancelToken& cancel);

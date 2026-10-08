//
//  Fetcher.hpp
//  SyncTasks
//

#pragma once

#include <string>
#include <vector>

struct CPPHeaderItem {
  std::string key;
  std::string value;
};

using CPPHeaders = std::vector<CPPHeaderItem>;

struct FetchResult {
  bool ok;
  int code;  // 0 when the request failed before an HTTP response
  std::string body;
};

// Blocking GET on the platform HTTP stack: NSURLSession (ios/Fetcher.mm), OkHttp (android/Fetcher.cpp).
// timeoutMs bounds the whole request, from connecting to the last byte of the body.
FetchResult platformFetch(const std::string& url, const CPPHeaders& headers, int timeoutMs);

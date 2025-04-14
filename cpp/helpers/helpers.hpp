//
//  helpers.hpp
//  Pods
//
//  Created by Oleksandr Shumihin on 12/4/25.
//

#pragma once

#include "jsi/jsi.h"
#include "constants.hpp"


extern "C" {
#include "fetcher.h"
}

template<size_t N>
inline consteval auto createErrorString(const char(&str)[N]){
  constexpr const char prefix[] = "[SyncTasksManager]: ";
  constexpr size_t prefix_len = sizeof(prefix) - 1;
  std::array<char, prefix_len + N> result{};

  for (size_t i = 0; i < prefix_len; ++i) {
    result[i] = prefix[i];
  }
  for (size_t i = 0; i < N; ++i) {
    result[prefix_len + i] = str[i];
  }

  return result;
}

template<typename T>
inline bool checkJSType(facebook::jsi::Runtime& rt, const facebook::jsi::Value& val);

template<>
inline bool checkJSType<facebook::jsi::Function>(facebook::jsi::Runtime& rt, const facebook::jsi::Value& val) {
  return val.isObject() && val.asObject(rt).isFunction(rt);
};

template<>
inline bool checkJSType<facebook::jsi::Array>(facebook::jsi::Runtime& rt, const facebook::jsi::Value& val) {
  return val.isObject() && val.asObject(rt).isArray(rt);
};


struct CPPHeaderItem {
  std::string key;
  std::string value;
};

using CPPHeaders = std::vector<CPPHeaderItem>;

inline CPPHeaders getFetchHeadersFromJSObject(jsi::Runtime&rt, const jsi::Object& obj){
  CPPHeaders cppHeaders;

  jsi::Value headers = obj.getProperty(rt, HEADERS_KEY);

  if (headers.isObject()) {
    jsi::Object h = headers.asObject(rt);

    jsi::Array names = h.getPropertyNames(rt);

    cppHeaders.reserve(names.size(rt));

    for (int i = 0; i < names.size(rt); ++i) {
      jsi::Value keyValue = names.getValueAtIndex(rt, i);

      if (!keyValue.isString()) [[unlikely]] {
        throw jsi::JSError(
                           rt,
                           createErrorString("Invalid Header, key must be a string").data());
      }

      jsi::String key = keyValue.asString(rt);

      jsi::Value valValue = h.getProperty(rt, key);

      if (!valValue.isString()) [[unlikely]] {
        throw jsi::JSError(
                           rt,
                           createErrorString("Invalid Header, value must be a string").data());
      }

      jsi::String value = valValue.asString(rt);

      cppHeaders.emplace_back(key.utf8(rt),value.utf8(rt));
    }
  }

  return cppHeaders;
}




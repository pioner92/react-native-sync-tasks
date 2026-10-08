//
//  JSTask.cpp
//  SyncTasks
//
//  Created by Oleksandr Shumihin on 12/4/25.
//

#include "JSTask.hpp"

#include <array>
#include <cctype>
#include <climits>
#include <cmath>

#include "core/TaskScheduler.hpp"
#include "constants.hpp"
#include "helpers/helpers.hpp"

using namespace facebook;

namespace {

constexpr std::hash<std::string> hasher;
constexpr std::array<const char*, 5> kMethods = {"GET", "POST", "PUT", "PATCH", "DELETE"};

[[noreturn]] void throwConfigError(jsi::Runtime& rt, const std::string& message) {
  throw jsi::JSError(rt, "[SyncTasksManager]: createTask -> " + message);
}

double readNumber(jsi::Runtime& rt, const jsi::Object& obj, const char* key,
                  double fallback, double min, double max) {
  jsi::Value value = obj.getProperty(rt, key);
  // A NaN fallback marks the field as required.
  if (value.isUndefined() && !std::isnan(fallback)) {
    return fallback;
  }

  double number = value.isNumber() ? value.asNumber() : NAN;
  if (!std::isfinite(number) || number < min || number > max) {
    throwConfigError(rt, std::string(key) + " must be a number between " +
                             std::to_string(static_cast<long long>(min)) + " and " +
                             std::to_string(static_cast<long long>(max)));
  }
  return number;
}

bool readBool(jsi::Runtime& rt, const jsi::Object& obj, const char* key, bool fallback) {
  jsi::Value value = obj.getProperty(rt, key);
  if (value.isUndefined()) {
    return fallback;
  }
  if (!value.isBool()) {
    throwConfigError(rt, std::string(key) + " must be a boolean");
  }
  return value.getBool();
}

std::string toLower(std::string str) {
  for (auto& c : str) {
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  return str;
}

const std::string* findHeader(const CPPHeaders& headers, const std::string& lowerName) {
  for (const auto& h : headers) {
    if (toLower(h.key) == lowerName) {
      return &h.value;
    }
  }
  return nullptr;
}

jsi::Object headersToJS(jsi::Runtime& rt, const CPPHeaders& headers) {
  jsi::Object obj(rt);
  for (const auto& h : headers) {
    obj.setProperty(rt, h.key.c_str(), jsi::String::createFromUtf8(rt, h.value));
  }
  return obj;
}

void callOnError(jsi::Runtime& rt, const std::shared_ptr<jsi::Function>& onError,
                 const std::string& message, int statusCode, const CPPHeaders& headers) {
  if (!onError) {
    return;
  }
  jsi::Object error(rt);
  error.setProperty(rt, "error", jsi::String::createFromUtf8(rt, message));
  error.setProperty(rt, "status_code", statusCode);
  error.setProperty(rt, "headers", headersToJS(rt, headers));
  onError->call(rt, error);
}

}  // namespace

jsi::Function createJSTaskCreator(
    jsi::Runtime& rt,
    std::shared_ptr<react::CallInvoker> callInvoker) {
  jsi::Function createTask = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, CREATE_TASK_KEY), 1,
      [callInvoker = std::move(callInvoker)](
          jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args,
          size_t count) {
        jsi::Object taskJS(rt);

        if (count < 1 || !args[0].isObject()) {
          throw jsi::JSError(
              rt, createErrorString("createTask -> argument must be an object")
                      .data());
        }

        jsi::Object props = args[0].asObject(rt);
        jsi::Value configValue = props.getProperty(rt, CONFIG_KEY);
        if (!configValue.isObject()) {
          throwConfigError(rt, "config must be an object");
        }
        jsi::Object config = configValue.asObject(rt);

        jsi::Value urlValue = config.getProperty(rt, URL_KEY);
        if (!urlValue.isString()) {
          throwConfigError(rt, "url must be a string");
        }

        FetchRequest request;
        request.url = urlValue.asString(rt).utf8(rt);
        request.headers = getFetchHeadersFromJSObject(rt, config);
        request.timeoutMs = static_cast<int>(
            readNumber(rt, config, TIMEOUT_KEY, DEFAULT_TIMEOUT_MS, 1, INT_MAX));

        jsi::Value methodValue = config.getProperty(rt, METHOD_KEY);
        request.method = methodValue.isUndefined()
                             ? "GET"
                             : (methodValue.isString() ? methodValue.asString(rt).utf8(rt) : "");
        if (std::find(kMethods.begin(), kMethods.end(), request.method) == kMethods.end()) {
          throwConfigError(rt, "method must be one of GET, POST, PUT, PATCH, DELETE");
        }

        jsi::Value bodyValue = config.getProperty(rt, BODY_KEY);
        if (!bodyValue.isUndefined()) {
          if (!bodyValue.isString()) {
            throwConfigError(rt, "body must be a string");
          }
          if (request.method == "GET") {
            throwConfigError(rt, "body is not allowed with GET");
          }
          request.body = bodyValue.asString(rt).utf8(rt);
        }

        TaskOptions options;
        options.intervalMs = static_cast<int>(
            readNumber(rt, config, INTERVAL_KEY, NAN, 1, INT_MAX));
        options.jitter = readNumber(rt, config, JITTER_KEY, 0, 0, 1);
        options.immediate = readBool(rt, config, IMMEDIATE_KEY, false);

        jsi::Value backoffValue = config.getProperty(rt, BACKOFF_KEY);
        if (!backoffValue.isUndefined()) {
          if (!backoffValue.isObject()) {
            throwConfigError(rt, "backoff must be an object");
          }
          jsi::Object backoff = backoffValue.asObject(rt);
          options.backoffMultiplier = readNumber(
              rt, backoff, MULTIPLIER_KEY, DEFAULT_BACKOFF_MULTIPLIER, 1, 100);
          options.maxIntervalMs = static_cast<int>(readNumber(
              rt, backoff, MAX_INTERVAL_KEY,
              std::max(options.intervalMs, DEFAULT_MAX_BACKOFF_MS), options.intervalMs, INT_MAX));
        }

        // Conditional requests (ETag / Last-Modified) only make sense for GET.
        bool conditional =
            readBool(rt, config, CONDITIONAL_KEY, true) && request.method == "GET";

        if (!checkJSType<jsi::Function>(rt,
                                        props.getProperty(rt, ON_DATA_KEY))) {
          throw jsi::JSError(
              rt, createErrorString("onData must be a function").data());
        }

        auto onData = std::make_shared<jsi::Function>(
            props.getPropertyAsFunction(rt, ON_DATA_KEY));

        jsi::Value onErrorValue = props.getProperty(rt, ON_ERROR_KEY);

        std::shared_ptr<jsi::Function> onError;

        if (checkJSType<jsi::Function>(rt, onErrorValue)) {
          onError = std::make_shared<jsi::Function>(
              props.getPropertyAsFunction(rt, ON_ERROR_KEY));
        }

        auto task = std::make_shared<Task>(
            options,
            [request = std::move(request), conditional, callInvoker, onData,
             onError](Task& self, uint64_t generation) {
              FetchRequest req = request;

              if (conditional) {
                if (!self.etag.empty() && !findHeader(req.headers, "if-none-match")) {
                  req.headers.push_back({"If-None-Match", self.etag});
                }
                if (!self.lastModified.empty() &&
                    !findHeader(req.headers, "if-modified-since")) {
                  req.headers.push_back({"If-Modified-Since", self.lastModified});
                }
              }

              auto cancel = self.beginRequest();
              FetchResult result = platformFetch(req, *cancel);
              self.endRequest();

              // Stopped or removed while the request was running: drop the result.
              if (cancel->isCancelled() || !self.isCurrent(generation)) {
                return;
              }

              self.recordResult(result.ok);

              // 304: the conditional request confirmed nothing changed.
              if (result.code == 304) {
                return;
              }

              std::weak_ptr<Task> weakTask = self.weak_from_this();

              if (!result.ok) {
                callInvoker->invokeAsync(
                    [weakTask, generation, onError, result = std::move(result)](jsi::Runtime& rt) {
                      auto task = weakTask.lock();
                      if (task && task->isCurrent(generation)) {
                        callOnError(rt, onError, result.body, result.code, result.headers);
                      }
                    });
                return;
              }

              if (conditional) {
                const std::string* etag = findHeader(result.headers, "etag");
                const std::string* lastModified = findHeader(result.headers, "last-modified");
                self.etag = etag ? *etag : "";
                self.lastModified = lastModified ? *lastModified : "";
              }

              size_t bodyHash = hasher(result.body);
              if (self.lastBodyHash == bodyHash) {
                return;
              }
              self.lastBodyHash = bodyHash;

              callInvoker->invokeAsync(
                  [weakTask, generation, onData, onError, result = std::move(result)](jsi::Runtime& rt) {
                    auto task = weakTask.lock();
                    if (!task || !task->isCurrent(generation)) {
                      return;
                    }

                    // An empty body (e.g. 204) is delivered as null.
                    jsi::Value json = jsi::Value::null();

                    if (!result.body.empty()) {
                      try {
                        json = jsi::Value::createFromJsonUtf8(
                            rt, reinterpret_cast<const uint8_t*>(result.body.data()),
                            result.body.size());
                      } catch (const jsi::JSIException&) {
                        // Not JSON: hand the raw body to onError instead of dropping it.
                        callOnError(rt, onError, result.body, result.code, result.headers);
                        return;
                      }
                    }

                    jsi::Object jsRes(rt);
                    jsRes.setProperty(rt, "body", json);
                    jsRes.setProperty(rt, "status_code", result.code);
                    jsRes.setProperty(rt, "headers", headersToJS(rt, result.headers));

                    onData->call(rt, jsRes);
                  });
            });

        jsi::Function stopTask = jsi::Function::createFromHostFunction(
            rt, jsi::PropNameID::forAscii(rt, "stopTask"), 0,
            [task](jsi::Runtime& rt, const jsi::Value& thisVal,
                   const jsi::Value* args, size_t count) {
              task->stop();

              return jsi::Value(true);
            });

        jsi::Function startTask = jsi::Function::createFromHostFunction(
            rt, jsi::PropNameID::forAscii(rt, "startTask"), 0,
            [task](jsi::Runtime& rt, const jsi::Value& thisVal,
                   const jsi::Value* args, size_t count) {
              task->start();

              return jsi::Value(true);
            });

        jsi::Function isRunning = jsi::Function::createFromHostFunction(
            rt, jsi::PropNameID::forAscii(rt, "isRunning"), 0,
            [task](jsi::Runtime& rt, const jsi::Value& thisVal,
                   const jsi::Value* args,
                   size_t count) { return jsi::Value(!task->isStopped()); });

        taskJS.setNativeState(rt, task);

        taskJS.setProperty(rt, "stop", std::move(stopTask));
        taskJS.setProperty(rt, "start", std::move(startTask));
        taskJS.setProperty(rt, "isRunning", std::move(isRunning));

        taskJS.setExternalMemoryPressure(rt, sizeof(Task));

        return taskJS;
      });

  return createTask;
}

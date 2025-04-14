//
//  JSTask2.cpp
//  SyncTasks
//
//  Created by Oleksandr Shumihin on 12/4/25.
//

#include "JSTask.hpp"

#include "core/TaskScheduler.hpp"
#include "constants.hpp"
#include "helpers/helpers.hpp"
#include "iostream"

extern "C" {
#include "fetcher.h"
}

using namespace facebook;

using RustHeader = Header;

constexpr std::hash<std::string> hasher;

jsi::Function createJSTaskCreator(
    jsi::Runtime& rt,
    std::shared_ptr<react::CallInvoker> callInvoker) {
  jsi::Function createTask = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, CREATE_TASK_KEY), 1,
      [callInvoker = std::move(callInvoker)](
          jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args,
          size_t count) {
        jsi::Object taskJS(rt);

        if (!args[0].isObject()) {
          throw jsi::JSError(
              rt, createErrorString("createTask -> argument must be an object")
                      .data());
        }

        jsi::Object props = args[0].asObject(rt);

        jsi::Object config = props.getPropertyAsObject(rt, CONFIG_KEY);

        CPPHeaders cppHeaders = getFetchHeadersFromJSObject(rt, config);

        int interval = config.getProperty(rt, INTERVAL_KEY).asNumber();
        std::string url = config.getProperty(rt, URL_KEY).asString(rt).utf8(rt);

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
            url, interval,
            [url, cppHeaders = std::move(cppHeaders), callInvoker, onData,
             onError, &rt](Task& self) mutable {
              std::vector<RustHeader> rustHeaders;

              if (cppHeaders.size()) {
                for (auto& h : cppHeaders) {
                  rustHeaders.emplace_back(h.key.c_str(), h.value.c_str());
                }
              }

              FetchResult result = rust_fetch(url.c_str(), rustHeaders.data(),
                                              rustHeaders.size());

              std::string body = result.body;
              rust_free_string(result.body);

              if (result.ok) {
                size_t bodyHash = hasher(body);

                if (self.hasSameBodyHash(bodyHash)) {
                  return;
                }

                self.setLastBodyHash(bodyHash);

                callInvoker->invokeAsync([&rt, onData, body = std::move(body),
                                          statuc_code = result.code] {
                  jsi::Object jsRes(rt);

                  jsi::Value json = jsi::Value::createFromJsonUtf8(
                      rt, reinterpret_cast<const uint8_t*>(body.data()),
                      body.size());

                  jsRes.setProperty(rt, "body", json);
                  jsRes.setProperty(rt, "status_code", statuc_code);

                  onData->call(rt, jsRes);
                });

              } else {
                callInvoker->invokeAsync([onError, &rt, body = std::move(body),
                                          status_code = result.code] {
                  if (onError) {
                    jsi::Object error(rt);
                    error.setProperty(rt, "error",
                                      jsi::String::createFromUtf8(rt, body));
                    error.setProperty(rt, "status_code", status_code);

                    onError->call(rt, error);
                  }
                });
              }
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

//
//  JSManager.cpp
//  SyncTasks
//
//  Created by Oleksandr Shumihin on 12/4/25.
//

#include "JSManager.hpp"

#include <cmath>
#include <string>

#include "core/TaskScheduler.hpp"
#include "constants.hpp"
#include "helpers/helpers.hpp"

namespace {

std::shared_ptr<Task> taskFromValue(jsi::Runtime& rt, const jsi::Value* value, const char* method) {
  if (!value || !value->isObject() || !value->asObject(rt).hasNativeState<Task>(rt)) {
    throw jsi::JSError(rt, std::string("[SyncTasksManager]: ") + method + " -> Invalid argument");
  }
  return value->asObject(rt).getNativeState<Task>(rt);
}

}  // namespace

jsi::Object createJSTaskManager(jsi::Runtime& rt) {
  jsi::Object taskManagerJS = jsi::Object(rt);

  auto t_manager = std::make_shared<TaskScheduler>(DEFAULT_MAX_CONCURRENT_REQUESTS);

  jsi::Function addTask = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, ADD_TASK_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        t_manager->addTask(taskFromValue(rt, count ? &args[0] : nullptr, ADD_TASK_KEY));
        return jsi::Value(true);
      });

  jsi::Function addTasks = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, ADD_TASKS_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        if (!count || !checkJSType<jsi::Array>(rt, args[0])) {
          throw jsi::JSError(rt, createErrorString("addTasks -> Argument must be an array").data());
        }

        jsi::Array jsTasks = args[0].asObject(rt).asArray(rt);

        // Validate everything first so a bad element does not leave a half-added batch.
        std::vector<std::shared_ptr<Task>> tasks;
        for (size_t i = 0; i < jsTasks.length(rt); ++i) {
          jsi::Value item = jsTasks.getValueAtIndex(rt, i);
          tasks.push_back(taskFromValue(rt, &item, ADD_TASKS_KEY));
        }
        for (auto& task : tasks) {
          t_manager->addTask(std::move(task));
        }

        return jsi::Value(true);
      });

  jsi::Function removeTask = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, REMOVE_TASK_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        t_manager->removeTask(taskFromValue(rt, count ? &args[0] : nullptr, REMOVE_TASK_KEY));
        return jsi::Value(true);
      });

  jsi::Function startAll = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, START_ALL_KEY), 0,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        t_manager->start();
        return jsi::Value(true);
      });

  jsi::Function stopAll = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, STOP_ALL_KEY), 0,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        t_manager->stop();
        return jsi::Value(true);
      });

  jsi::Function setMaxConcurrentRequests = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, SET_MAX_CONCURRENT_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        double value = count && args[0].isNumber() ? args[0].asNumber() : NAN;
        if (!std::isfinite(value) || value < 1 || value > MAX_CONCURRENT_REQUESTS ||
            value != std::floor(value)) {
          throw jsi::JSError(
              rt, "[SyncTasksManager]: setMaxConcurrentRequests -> expected an integer between 1 and " +
                      std::to_string(MAX_CONCURRENT_REQUESTS));
        }
        t_manager->setPoolSize(static_cast<size_t>(value));
        return jsi::Value(true);
      });

  taskManagerJS.setNativeState(rt, t_manager);

  taskManagerJS.setProperty(rt, ADD_TASK_KEY, std::move(addTask));
  taskManagerJS.setProperty(rt, ADD_TASKS_KEY, std::move(addTasks));
  taskManagerJS.setProperty(rt, REMOVE_TASK_KEY, std::move(removeTask));
  taskManagerJS.setProperty(rt, START_ALL_KEY, std::move(startAll));
  taskManagerJS.setProperty(rt, STOP_ALL_KEY, std::move(stopAll));
  taskManagerJS.setProperty(rt, SET_MAX_CONCURRENT_KEY, std::move(setMaxConcurrentRequests));

  taskManagerJS.setExternalMemoryPressure(rt, sizeof(TaskScheduler));

  return taskManagerJS;
}

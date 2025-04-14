//
//  JSManager2.cpp
//  SyncTasks
//
//  Created by Oleksandr Shumihin on 12/4/25.
//

#include "JSManager.hpp"
#include "core/TaskScheduler.hpp"
#include "constants.hpp"
#include "helpers/helpers.hpp"

jsi::Object createJSTaskManager(jsi::Runtime& rt) {
  jsi::Object taskManagerJS = jsi::Object(rt);

  auto t_manager = std::make_shared<TaskScheduler>(THREADS_COUNT);

  jsi::Function addTask = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, ADD_TASK_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {

        if(!args[0].isObject() || !args[0].asObject(rt).hasNativeState<Task>(rt)){
          throw jsi::JSError(rt, createErrorString("addTask -> Invalid argument").data());
        }

        t_manager->addTask(args[0].asObject(rt).getNativeState<Task>(rt));

        return jsi::Value(true);
      });

  jsi::Function addTasks = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, ADD_TASKS_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        if (!checkJSType<jsi::Array>(rt, args[0])) {
          throw jsi::JSError(rt, createErrorString("addTasks -> Argument must be an array").data());
        }

        jsi::Array jsTasks = args[0].asObject(rt).asArray(rt);

        for (int i = 0; i < jsTasks.length(rt); ++i) {

          jsi::Value taskValue = jsTasks.getValueAtIndex(rt, i);

          if(!taskValue.isObject() || !taskValue.asObject(rt).hasNativeState<Task>(rt)){
            throw jsi::JSError(rt, createErrorString("addTasks -> Invalid argument").data());
          }

          std::shared_ptr<Task> task = taskValue.asObject(rt).getNativeState<Task>(rt);

          t_manager->addTask(std::move(task));
        }

        return jsi::Value(true);
      });

  jsi::Function startAll = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, START_ALL_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        t_manager->start();
        return jsi::Value(true);
      });

  jsi::Function stopAll = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, STOP_ALL_KEY), 1,
      [t_manager](jsi::Runtime& rt, const jsi::Value& thisVal,
                  const jsi::Value* args, size_t count) {
        t_manager->stop();
        return jsi::Value(true);
      });

  taskManagerJS.setNativeState(rt, t_manager);

  taskManagerJS.setProperty(rt, ADD_TASK_KEY, std::move(addTask));
  taskManagerJS.setProperty(rt, ADD_TASKS_KEY, std::move(addTasks));
  taskManagerJS.setProperty(rt, START_ALL_KEY, std::move(startAll));
  taskManagerJS.setProperty(rt, STOP_ALL_KEY, std::move(stopAll));

  taskManagerJS.setExternalMemoryPressure(rt, sizeof(TaskScheduler));

  return taskManagerJS;
}

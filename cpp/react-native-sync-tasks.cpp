#include "react-native-sync-tasks.hpp"
#include "JSManager.hpp"
#include "JSTask.hpp"
#include "constants.hpp"


using namespace sh;
using namespace facebook;
using namespace std;


void synctasks::install(jsi::Runtime* rt,
                        std::shared_ptr<react::CallInvoker> callInvoker
                        ) {
  jsi::Runtime& runtime = *rt;


 jsi::Object jsTaskManager = createJSTaskManager(runtime);

 jsi::Function taskCreator = createJSTaskCreator(runtime, callInvoker);

 runtime.global().setProperty(runtime, SYNC_TASK_MANAGER_KEY,
                              std::move(jsTaskManager));

 runtime.global().setProperty(runtime, CREATE_TASK_KEY,
                              std::move(taskCreator));

  runtime.global().setProperty(runtime, CREATE_TASK_KEY,
                               std::move(taskCreator));
}

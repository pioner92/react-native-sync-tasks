#include <jni.h>
#include "jsi/jsi.h"
#include <android/log.h>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/CallInvokerHolder.h>
#include <fbjni/fbjni.h>
#include <fbjni/detail/Registration.h>
#include <typeinfo>
#include "react-native-sync-tasks.hpp"


using namespace facebook;

struct SyncTasksBridge : jni::JavaClass<SyncTasksBridge> {
public:
    static constexpr auto kJavaDescriptor = "Lcom/synctasks/SyncTasksModule;";

    static void registerNatives() {
        javaClassStatic()->registerNatives({makeNativeMethod("nativeInstall", SyncTasksBridge::nativeInstall)});
    }
private:
    static void nativeInstall(
            jni::alias_ref<jni::JObject> thiz,
            jlong jsiRuntimePointer,
            jni::alias_ref<react::CallInvokerHolder::javaobject> jsCallInvokerHolder
            ) {

        // Реализация
        auto jsiRuntime = reinterpret_cast<jsi::Runtime*>(jsiRuntimePointer);
        auto jsCallInvoker = jsCallInvokerHolder->cthis()->getCallInvoker();

        sh::synctasks::install(jsiRuntime, jsCallInvoker);
    }
};

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *) {
    return jni::initialize(vm, [] { SyncTasksBridge::registerNatives(); });
}

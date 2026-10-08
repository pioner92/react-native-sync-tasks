#include <jni.h>
#include "jsi/jsi.h"
#include <android/log.h>
#include <ReactCommon/BindingsInstallerHolder.h>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/CallInvokerHolder.h>
#include <fbjni/fbjni.h>
#include <fbjni/detail/Registration.h>
#include <typeinfo>
#include "react-native-sync-tasks.hpp"


using namespace facebook;

void initFetcherJni();

struct SyncTasksBridge : jni::JavaClass<SyncTasksBridge> {
public:
    static constexpr auto kJavaDescriptor = "Lcom/synctasks/SyncTasksModule;";

    static void registerNatives() {
        javaClassStatic()->registerNatives({
            makeNativeMethod("nativeInstall", SyncTasksBridge::nativeInstall),
            makeNativeMethod("nativeCreateBindingsInstaller", SyncTasksBridge::nativeCreateBindingsInstaller),
        });
    }
private:
    // Old architecture: called from the blocking install() method with the bridge's runtime.
    static void nativeInstall(
            jni::alias_ref<jni::JObject> thiz,
            jlong jsiRuntimePointer,
            jni::alias_ref<react::CallInvokerHolder::javaobject> jsCallInvokerHolder
            ) {

        auto jsiRuntime = reinterpret_cast<jsi::Runtime*>(jsiRuntimePointer);
        auto jsCallInvoker = jsCallInvokerHolder->cthis()->getCallInvoker();

        sh::synctasks::install(jsiRuntime, jsCallInvoker);
    }

    // New architecture: the TurboModule manager runs this installer on the JS thread.
    static jni::local_ref<react::BindingsInstallerHolder::javaobject> nativeCreateBindingsInstaller(
            jni::alias_ref<jni::JClass>) {
        return react::BindingsInstallerHolder::newObjectCxxArgs(
            [](jsi::Runtime& runtime, const std::shared_ptr<react::CallInvoker>& callInvoker) {
                sh::synctasks::install(&runtime, callInvoker);
            });
    }
};

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *) {
    return jni::initialize(vm, [] {
        SyncTasksBridge::registerNatives();
        initFetcherJni();
    });
}

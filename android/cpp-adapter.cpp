#include <jni.h>
#include "jsi/jsi.h"
#include <android/log.h>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/CallInvokerHolder.h>
#include <fbjni/fbjni.h>
#include <fbjni/detail/Registration.h>
#include <typeinfo>
#include "react-native-sync-tasks.hpp"
#include "helpers/FetchService.hpp"


using namespace facebook;

JavaVM* g_vm = nullptr;
jobject g_classLoader = nullptr;
jmethodID g_loadClass = nullptr;

JNIEnv* getJNIEnv() {
    JNIEnv* env = nullptr;
    if (g_vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        // Поток не прикреплён — нужно attach
        g_vm->AttachCurrentThread(&env, nullptr);
    }
    return env;
}

extern "C"
JNIEXPORT void JNICALL
Java_com_synctasks_SyncTasksModule_nativeSetClassLoader(JNIEnv* env, jclass, jobject classLoader) {
    g_classLoader = env->NewGlobalRef(classLoader);
    jclass classLoaderClass = env->FindClass("java/lang/ClassLoader");
    g_loadClass = env->GetMethodID(classLoaderClass, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;");
}

void setupClassLoader(JNIEnv* env) {
    jclass contextClass = env->FindClass("com/synctasks/SyncTasksModule");
    jclass classClass = env->FindClass("java/lang/Class");
    jmethodID getClassLoader = env->GetMethodID(classClass, "getClassLoader", "()Ljava/lang/ClassLoader;");
    jobject classLoader = env->CallObjectMethod(contextClass, getClassLoader);
    g_classLoader = env->NewGlobalRef(classLoader);

    jclass classLoaderClass = env->FindClass("java/lang/ClassLoader");
    g_loadClass = env->GetMethodID(classLoaderClass, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;");
}

jclass findClassSafe(JNIEnv* env, const char* name) {
    if (!g_classLoader || !g_loadClass) {
        __android_log_print(ANDROID_LOG_ERROR, "SYNC_TASKS", "ClassLoader not initialized");
        return nullptr;
    }
    jstring strClassName = env->NewStringUTF(name);
    jclass clazz = (jclass)env->CallObjectMethod(g_classLoader, g_loadClass, strClassName);
    env->DeleteLocalRef(strClassName);

    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
        return nullptr;
    }
    return clazz;
}

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

        auto fetch = [](std::string&& url, FetchHeaders&& headers) -> FetchResponse {
            JNIEnv* env = getJNIEnv();

            jclass fetcherClass = findClassSafe(env, "com.synctasks.Fetcher");
            if (!fetcherClass) {
                return FetchError{"Fetcher class not found", "", 0};
            }

            jmethodID fetchMethod = env->GetStaticMethodID(fetcherClass, "fetch", "(Ljava/lang/String;Ljava/util/Map;)Ljava/lang/String;");
            if (!fetchMethod) {
                return FetchError{"Fetcher.fetch() not found", "", 0};
            }

            jstring jUrl = env->NewStringUTF(url.c_str());

            jclass mapClass = env->FindClass("java/util/HashMap");
            jmethodID init = env->GetMethodID(mapClass, "<init>", "()V");
            jobject jMap = env->NewObject(mapClass, init);

            jmethodID put = env->GetMethodID(mapClass, "put", "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");

            for (const auto& [k, v] : headers) {
                jstring jk = env->NewStringUTF(k.c_str());
                jstring jv = env->NewStringUTF(v.c_str());
                env->CallObjectMethod(jMap, put, jk, jv);
                env->DeleteLocalRef(jk);
                env->DeleteLocalRef(jv);
            }

            jstring jResult = (jstring)env->CallStaticObjectMethod(fetcherClass, fetchMethod, jUrl, jMap);

//            jclass pairClass = env->FindClass("kotlin/Pair");
//            jmethodID getFirst = env->GetMethodID(pairClass, "getFirst", "()Ljava/lang/Object;");
//            jmethodID getSecond = env->GetMethodID(pairClass, "getSecond", "()Ljava/lang/Object;");


//            jobject jCodeObj = env->CallObjectMethod(resultPair, getFirst);
//            jobject jBodyObj = env->CallObjectMethod(resultPair, getSecond);

//            const char* cstr = env->GetStringUTFChars(jResult, nullptr);
//            std::string body(cstr);
//            env->ReleaseStringUTFChars(jResult, cstr);
//
//            env->DeleteLocalRef(jUrl);
//            env->DeleteLocalRef(jMap);
//            env->DeleteLocalRef(jResult);
//            env->DeleteLocalRef(fetcherClass);

            return FetchBody("");
        };

        sh::synctasks::install(jsiRuntime, jsCallInvoker,std::move(fetch));
    }
};

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *) {
    g_vm = vm;

    JNIEnv* env = nullptr;
    if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        return JNI_ERR;
    }

    setupClassLoader(env);

    return jni::initialize(vm, [] { SyncTasksBridge::registerNatives(); });
}

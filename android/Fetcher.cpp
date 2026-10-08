//
//  Fetcher.cpp
//  SyncTasks
//

#include "Fetcher.hpp"

#include <fbjni/fbjni.h>

using namespace facebook;

namespace {

struct JFetchResponse : jni::JavaClass<JFetchResponse> {
  static constexpr auto kJavaDescriptor = "Lcom/synctasks/FetchResponse;";
};

struct JFetcher : jni::JavaClass<JFetcher> {
  static constexpr auto kJavaDescriptor = "Lcom/synctasks/Fetcher;";
};

}  // namespace

void initFetcherJni() {
  // Worker threads only see the bootstrap class loader, so cache the class refs from a Java thread.
  JFetcher::javaClassStatic();
  JFetchResponse::javaClassStatic();
}

FetchResult platformFetch(const std::string& url, const CPPHeaders& headers, int timeoutMs) {
  jni::ThreadScope scope;

  try {
    static const auto fetchMethod =
        JFetcher::javaClassStatic()
            ->getStaticMethod<JFetchResponse::javaobject(
                std::string, jni::alias_ref<jni::JArrayClass<jstring>>, jlong)>("fetch");
    static const auto codeField =
        JFetchResponse::javaClassStatic()->getField<jint>("code");
    static const auto bodyField =
        JFetchResponse::javaClassStatic()->getField<jbyteArray>("body");

    // Flattened as [key0, value0, key1, value1, ...].
    auto jHeaders = jni::JArrayClass<jstring>::newArray(headers.size() * 2);
    for (size_t i = 0; i < headers.size(); ++i) {
      jHeaders->setElement(i * 2, jni::make_jstring(headers[i].key).get());
      jHeaders->setElement(i * 2 + 1, jni::make_jstring(headers[i].value).get());
    }

    auto response = fetchMethod(JFetcher::javaClassStatic(), url, jHeaders, static_cast<jlong>(timeoutMs));

    int code = response->getFieldValue(codeField);
    auto jBody = jni::static_ref_cast<jni::JArrayByte>(response->getFieldValue(bodyField));

    std::string body;
    if (jBody) {
      auto pinned = jBody->pin();
      body.assign(reinterpret_cast<const char*>(pinned.get()), pinned.size());
    }

    return {code > 0 && code < 400, code, std::move(body)};
  } catch (const std::exception& e) {
    return {false, 0, std::string("Request error: ") + e.what()};
  }
}

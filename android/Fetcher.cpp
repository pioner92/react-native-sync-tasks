//
//  Fetcher.cpp
//  SyncTasks
//

#include "Fetcher.hpp"

#include <atomic>
#include <fbjni/fbjni.h>

using namespace facebook;

namespace {

using JStringArray = jni::JArrayClass<jstring>;

struct JFetchResponse : jni::JavaClass<JFetchResponse> {
  static constexpr auto kJavaDescriptor = "Lcom/synctasks/FetchResponse;";
};

struct JFetcher : jni::JavaClass<JFetcher> {
  static constexpr auto kJavaDescriptor = "Lcom/synctasks/Fetcher;";
};

void cancelJavaCall(jlong id) {
  jni::ThreadScope scope;
  try {
    static const auto cancelMethod = JFetcher::javaClassStatic()->getStaticMethod<void(jlong)>("cancel");
    cancelMethod(JFetcher::javaClassStatic(), id);
  } catch (const std::exception&) {
    // Nothing to do: the request finishes on its own timeout.
  }
}

}  // namespace

void initFetcherJni() {
  // Worker threads only see the bootstrap class loader, so cache the class refs from a Java thread.
  JFetcher::javaClassStatic();
  JFetchResponse::javaClassStatic();
}

FetchResult platformFetch(const FetchRequest& req, CancelToken& cancel) {
  static std::atomic<jlong> nextRequestId{1};
  const jlong id = nextRequestId++;

  jni::ThreadScope scope;
  cancel.setOnCancel([id] { cancelJavaCall(id); });

  struct ClearOnCancel {
    CancelToken& token;
    ~ClearOnCancel() { token.clearOnCancel(); }
  } clearOnCancel{cancel};

  try {
    static const auto fetchMethod =
        JFetcher::javaClassStatic()
            ->getStaticMethod<JFetchResponse::javaobject(
                jlong, std::string, std::string, jni::alias_ref<JStringArray>,
                jni::alias_ref<jni::JArrayByte>, jlong)>("fetch");
    static const auto codeField = JFetchResponse::javaClassStatic()->getField<jint>("code");
    static const auto bodyField = JFetchResponse::javaClassStatic()->getField<jbyteArray>("body");
    static const auto headersField =
        JFetchResponse::javaClassStatic()->getField<JStringArray::javaobject>("headers");

    // Flattened as [key0, value0, key1, value1, ...].
    auto jHeaders = JStringArray::newArray(req.headers.size() * 2);
    for (size_t i = 0; i < req.headers.size(); ++i) {
      jHeaders->setElement(i * 2, jni::make_jstring(req.headers[i].key).get());
      jHeaders->setElement(i * 2 + 1, jni::make_jstring(req.headers[i].value).get());
    }

    jni::local_ref<jni::JArrayByte> jBody;
    if (req.body) {
      jBody = jni::JArrayByte::newArray(req.body->size());
      jBody->setRegion(0, req.body->size(), reinterpret_cast<const jbyte*>(req.body->data()));
    }

    auto response = fetchMethod(
        JFetcher::javaClassStatic(), id, req.url, req.method, jHeaders, jBody,
        static_cast<jlong>(req.timeoutMs));

    int code = response->getFieldValue(codeField);

    std::string body;
    auto jResponseBody = jni::static_ref_cast<jni::JArrayByte>(response->getFieldValue(bodyField));
    if (jResponseBody) {
      auto pinned = jResponseBody->pin();
      body.assign(reinterpret_cast<const char*>(pinned.get()), pinned.size());
    }

    CPPHeaders headers;
    auto jResponseHeaders = response->getFieldValue(headersField);
    if (jResponseHeaders) {
      for (size_t i = 0; i + 1 < jResponseHeaders->size(); i += 2) {
        headers.push_back({jResponseHeaders->getElement(i)->toStdString(),
                           jResponseHeaders->getElement(i + 1)->toStdString()});
      }
    }

    return {code > 0 && code < 400, code, std::move(body), std::move(headers)};
  } catch (const std::exception& e) {
    return {false, 0, std::string("Request error: ") + e.what(), {}};
  }
}

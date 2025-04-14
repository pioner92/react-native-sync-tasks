package com.synctasks

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl
import okhttp3.OkHttpClient
import okhttp3.Request


object Fetcher {
  @JvmStatic
  fun fetch(url: String, headers: Map<String, String>): String {
    val client = OkHttpClient()

    val builder = Request.Builder()
      .url(url)

    headers.forEach { (k, v) -> builder.addHeader(k, v) }

    val response = client.newCall(builder.build()).execute()

    val body = response.body?.string() ?: ""

    return body;
  }
}

@OptIn(FrameworkAPI::class)
class SyncTasksModule internal constructor(val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  companion object {

    const val NAME = "SyncTasksManager"

    init {
      System.loadLibrary("rnsynctasks")
    }

    lateinit var  instance: SyncTasksModule

    @OptIn(FrameworkAPI::class)
    @JvmStatic
    external fun nativeInstall(jsiRuntimePointer: Long, jsCallInvoker: CallInvokerHolderImpl)
  }

  private val reactContext = context

   init {
        instance = this
    }

  override fun getName(): String {
    return NAME
  }

  @OptIn(FrameworkAPI::class)
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun install(): Boolean {
    Log.d(NAME, "install() called")


    val callInvokerHolder = reactContext.catalystInstance.jsCallInvokerHolder as CallInvokerHolderImpl

    nativeInstall(
      context.javaScriptContextHolder!!.get(),
      callInvokerHolder,
    )
    return true
  }
}

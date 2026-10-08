package com.synctasks

import com.facebook.proguard.annotations.DoNotStrip
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

@DoNotStrip
class FetchResponse(
  @JvmField @DoNotStrip val code: Int,
  @JvmField @DoNotStrip val body: ByteArray,
)

// Called from native worker threads (android/Fetcher.cpp).
@DoNotStrip
object Fetcher {
  // No per-phase limits: each call gets one overall timeout from the task config.
  private val client = OkHttpClient.Builder()
    .connectTimeout(0, TimeUnit.MILLISECONDS)
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .writeTimeout(0, TimeUnit.MILLISECONDS)
    .build()

  @JvmStatic
  @DoNotStrip
  fun fetch(url: String, headers: Array<String>, timeoutMs: Long): FetchResponse {
    return try {
      val builder = Request.Builder().url(url)

      for (i in 0 until headers.size / 2) {
        builder.header(headers[i * 2], headers[i * 2 + 1])
      }

      val call = client.newCall(builder.build())
      call.timeout().timeout(timeoutMs, TimeUnit.MILLISECONDS)

      call.execute().use { response ->
        FetchResponse(response.code, response.body?.bytes() ?: ByteArray(0))
      }
    } catch (e: Exception) {
      FetchResponse(0, "Request error: ${e.message ?: e.javaClass.name}".toByteArray())
    }
  }
}

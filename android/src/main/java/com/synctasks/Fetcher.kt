package com.synctasks

import com.facebook.proguard.annotations.DoNotStrip
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

@DoNotStrip
class FetchResponse(
  @JvmField @DoNotStrip val code: Int,
  @JvmField @DoNotStrip val body: ByteArray,
  // Flattened as [name0, value0, name1, value1, ...], names lowercased.
  @JvmField @DoNotStrip val headers: Array<String>,
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

  private val methodsWithBody = setOf("POST", "PUT", "PATCH")

  private val lock = Any()
  private val calls = HashMap<Long, Call>()
  // cancel() can arrive before the call is registered.
  private val cancelledEarly = HashSet<Long>()

  @JvmStatic
  @DoNotStrip
  fun fetch(
    id: Long,
    url: String,
    method: String,
    headers: Array<String>,
    body: ByteArray?,
    timeoutMs: Long,
  ): FetchResponse {
    return try {
      val builder = Request.Builder().url(url)

      for (i in 0 until headers.size / 2) {
        builder.header(headers[i * 2], headers[i * 2 + 1])
      }

      // Null media type: Content-Type comes from the caller's headers, not from OkHttp.
      val requestBody = body?.toRequestBody(null)
        ?: if (method in methodsWithBody) ByteArray(0).toRequestBody(null) else null
      builder.method(method, requestBody)

      val call = client.newCall(builder.build())
      call.timeout().timeout(timeoutMs, TimeUnit.MILLISECONDS)

      synchronized(lock) {
        if (cancelledEarly.remove(id)) call.cancel()
        calls[id] = call
      }

      try {
        call.execute().use { response ->
          val responseHeaders = response.headers.names().flatMap { name ->
            listOf(name.lowercase(), response.headers.values(name).joinToString(", "))
          }
          FetchResponse(
            response.code,
            response.body?.bytes() ?: ByteArray(0),
            responseHeaders.toTypedArray(),
          )
        }
      } finally {
        synchronized(lock) {
          calls.remove(id)
          cancelledEarly.remove(id)
        }
      }
    } catch (e: Exception) {
      FetchResponse(0, "Request error: ${e.message ?: e.javaClass.name}".toByteArray(), emptyArray())
    }
  }

  @JvmStatic
  @DoNotStrip
  fun cancel(id: Long) {
    synchronized(lock) {
      val call = calls[id]
      if (call != null) call.cancel() else cancelledEarly.add(id)
    }
  }
}

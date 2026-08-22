package com.mobilediagnosticskit

import com.didichuxing.doraemonkit.kit.network.NetworkManager
import com.didichuxing.doraemonkit.kit.network.core.NetworkInterpreter
import com.didichuxing.doraemonkit.kit.network.core.RequestBodyHelper
import com.didichuxing.doraemonkit.kit.network.okhttp.OkHttpInspectorRequest
import com.didichuxing.doraemonkit.kit.network.okhttp.OkHttpInspectorResponse
import okhttp3.Interceptor
import okhttp3.Response

class MobileDiagnosticsImageInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    val startTime = System.currentTimeMillis()
    val response = chain.proceed(request)
    if (!NetworkManager.isActive() || !isImage(response)) return response

    runCatching {
      val interpreter = NetworkInterpreter.get()
      val requestId = interpreter.nextRequestId()
      val record = NetworkInterpreter.get().createRecord(
        requestId,
        "native",
        OkHttpInspectorRequest(requestId, request, RequestBodyHelper()),
      ).apply { this.startTime = startTime }
      interpreter.fetchResponseInfo(
        record,
        OkHttpInspectorResponse(requestId, request, response),
      )

      val body = response.body
      val contentLength = body?.contentLength() ?: -1L
      if (body != null && (contentLength < 0L || contentLength <= MAX_IMAGE_BYTES)) {
        val bytes = response.peekBody(MAX_IMAGE_BYTES + 1L).bytes()
        record.responseLength = if (contentLength >= 0L) contentLength else bytes.size.toLong()
        if (bytes.size <= MAX_IMAGE_BYTES) {
          MobileDiagnosticsImageStore.put(requestId, bytes)
        }
      } else if (contentLength > 0L) {
        record.responseLength = contentLength
      }
      NetworkManager.get().updateRecord(record, false)
    }
    return response
  }

  private fun isImage(response: Response): Boolean {
    val contentType = response.header("Content-Type")
      ?: response.body?.contentType()?.toString()
      ?: return false
    return contentType.substringBefore(';').trim().startsWith("image/", ignoreCase = true)
  }

  private companion object {
    const val MAX_IMAGE_BYTES = 4 * 1024 * 1024L
  }
}

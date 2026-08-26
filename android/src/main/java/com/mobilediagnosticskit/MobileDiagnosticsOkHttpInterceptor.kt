package com.mobilediagnosticskit

import okhttp3.Headers
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okio.Buffer

/** Passive OkHttp capture that always returns the original response or rethrows the same failure. */
class MobileDiagnosticsOkHttpInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    val requestBody = runCatching { captureRequestBody(request) }.getOrNull()
    val requestBodyLength = runCatching { request.body?.contentLength() ?: 0L }.getOrDefault(0L)
    val startedAtMs = System.currentTimeMillis()

    try {
      val response = chain.proceed(request)
      record(request, requestBody, requestBodyLength, response, startedAtMs, null)
      return response
    } catch (error: Throwable) {
      record(request, requestBody, requestBodyLength, null, startedAtMs, error)
      throw error
    }
  }

  private fun record(
    request: Request,
    requestBody: ByteArray?,
    requestBodyLength: Long,
    response: Response?,
    startedAtMs: Long,
    error: Throwable?,
  ) {
    runCatching {
      val responseBodyLength = response?.body?.contentLength()?.takeIf { it >= 0L } ?: 0L
      val responseBody = captureResponseBody(response)
      MobileDiagnosticsNativeNetwork.record(
        MobileDiagnosticsHttpExchange(
          url = request.url.toString(),
          method = request.method,
          requestHeaders = request.headers.toMultimap(),
          requestBody = requestBody,
          requestBodyLength = requestBodyLength.coerceAtLeast(requestBody?.size?.toLong() ?: 0L),
          statusCode = response?.code,
          responseHeaders = response?.headers?.toMultimap().orEmpty(),
          responseBody = responseBody,
          responseBodyLength = responseBodyLength.coerceAtLeast(responseBody?.size?.toLong() ?: 0L),
          startedAtMs = startedAtMs,
          endedAtMs = System.currentTimeMillis(),
          error = error?.let { "${it.javaClass.name}: ${it.message.orEmpty()}" },
        ),
      )
    }
  }

  private fun captureRequestBody(request: Request): ByteArray? {
    val body = request.body ?: return null
    if (body.isDuplex() || body.isOneShot()) return null
    val contentLength = runCatching { body.contentLength() }.getOrNull() ?: return null
    if (contentLength !in 0..MobileDiagnosticsNativeNetwork.MAX_TEXT_BODY_BYTES.toLong()) {
      return null
    }
    if (!isTextContentType(request.headers)) return null
    return runCatching {
      Buffer().use { buffer ->
        body.writeTo(buffer)
        buffer.readByteArray()
      }
    }.getOrNull()
  }

  private fun captureResponseBody(response: Response?): ByteArray? {
    val body = response?.body ?: return null
    val contentType = body.contentType()?.toString() ?: response.header("Content-Type")
    val maxBytes = if (contentType?.startsWith("image/", ignoreCase = true) == true) {
      MobileDiagnosticsNativeNetwork.MAX_IMAGE_BYTES
    } else {
      if (!isTextContentType(response.headers)) return null
      MobileDiagnosticsNativeNetwork.MAX_TEXT_BODY_BYTES
    }
    return runCatching { response.peekBody(maxBytes.toLong() + 1L).bytes() }
      .getOrNull()
      ?.takeIf { it.size <= maxBytes }
  }

  private fun isTextContentType(headers: Headers): Boolean {
    val contentType = headers["Content-Type"]?.lowercase().orEmpty()
    return contentType.startsWith("text/") ||
      contentType.contains("json") ||
      contentType.contains("xml") ||
      contentType.contains("graphql") ||
      contentType.contains("x-www-form-urlencoded")
  }
}

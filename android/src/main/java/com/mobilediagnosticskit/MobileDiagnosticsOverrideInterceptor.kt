package com.mobilediagnosticskit

import okhttp3.Interceptor
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody

/** Applies opt-in runtime overrides and returns the original exchange on every failure path. */
internal class MobileDiagnosticsOverrideInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val originalRequest = chain.request()
    val request = runCatching {
      val rewrittenUrl = MobileDiagnosticsOverrides.rewriteApiUrl(originalRequest.url)
      if (rewrittenUrl == originalRequest.url) originalRequest
      else originalRequest.newBuilder().url(rewrittenUrl).build()
    }.getOrDefault(originalRequest)

    val response = chain.proceed(request)
    return runCatching { patchResponse(request, response) }.getOrDefault(response)
  }

  private fun patchResponse(request: okhttp3.Request, response: Response): Response {
    if (!MobileDiagnosticsOverrides.shouldMockABConfigRequest(request.url, request.method)) {
      return response
    }
    val body = response.body ?: return response
    val contentType = body.contentType()
    if (contentType?.subtype?.contains("json", ignoreCase = true) != true) return response
    val bytes = body.bytes()
    val patched = MobileDiagnosticsOverrides.patchABConfigResponse(
      request.url,
      request.method,
      bytes,
    ) ?: return response.newBuilder().body(bytes.toResponseBody(contentType)).build()

    return response.newBuilder()
      .removeHeader("Content-Length")
      .body(patched.toResponseBody(contentType))
      .build()
  }
}

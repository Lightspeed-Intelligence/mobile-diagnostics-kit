package com.mobilediagnosticskit

import com.didichuxing.doraemonkit.kit.network.NetworkManager
import com.didichuxing.doraemonkit.kit.network.bean.NetworkRecord
import com.didichuxing.doraemonkit.kit.network.bean.Request as DoKitRequest
import com.didichuxing.doraemonkit.kit.network.bean.Response as DoKitResponse
import com.didichuxing.doraemonkit.kit.network.core.NetworkInterpreter
import okhttp3.OkHttpClient

/**
 * A completed native HTTP exchange. Recording is best-effort and never owns the request lifecycle.
 * Callers keep responsibility for sending, retrying, cancelling, and propagating failures.
 */
data class MobileDiagnosticsHttpExchange(
  val url: String,
  val method: String,
  val requestHeaders: Map<String, List<String>> = emptyMap(),
  val requestBody: ByteArray? = null,
  val requestBodyLength: Long = requestBody?.size?.toLong() ?: 0L,
  val statusCode: Int? = null,
  val responseHeaders: Map<String, List<String>> = emptyMap(),
  val responseBody: ByteArray? = null,
  val responseBodyLength: Long = responseBody?.size?.toLong() ?: 0L,
  val startedAtMs: Long,
  val endedAtMs: Long,
  val error: String? = null,
)

/** Passive capture entry point for Android networking implemented outside React Native. */
object MobileDiagnosticsNativeNetwork {
  /** Records an already-completed exchange without changing its result or throwing to the caller. */
  @JvmStatic
  fun record(exchange: MobileDiagnosticsHttpExchange) {
    runCatching {
      if (!NetworkManager.isActive()) return

      val requestId = NetworkInterpreter.get().nextRequestId()
      val contentType = firstHeader(exchange.responseHeaders, "Content-Type")
      val responseHeaders = if (exchange.error.isNullOrBlank()) {
        exchange.responseHeaders
      } else {
        exchange.responseHeaders + mapOf(
          ERROR_HEADER to listOf(exchange.error.take(MAX_ERROR_CHARACTERS)),
        )
      }
      val record = NetworkRecord().apply {
        mRequestId = requestId
        mPlatform = "native"
        mRequest = DoKitRequest().apply {
          url = exchange.url
          method = exchange.method.ifBlank { "HTTP" }
          headers = formatHeaders(exchange.requestHeaders)
          encode = firstHeader(exchange.requestHeaders, "Content-Encoding")
          postData = decodeTextBody(
            exchange.requestBody,
            firstHeader(exchange.requestHeaders, "Content-Type"),
          )
        }
        mResponse = DoKitResponse().apply {
          url = exchange.url
          status = exchange.statusCode ?: 0
          headers = formatHeaders(responseHeaders)
          mimeType = contentType?.substringBefore(';')?.trim().orEmpty()
            .ifBlank { "application/octet-stream" }
        }
        mResponseBody = decodeTextBody(exchange.responseBody, contentType)
        requestLength = exchange.requestBodyLength.coerceAtLeast(0L)
        responseLength = exchange.responseBodyLength.coerceAtLeast(0L)
        startTime = exchange.startedAtMs
        endTime = exchange.endedAtMs.coerceAtLeast(exchange.startedAtMs)
      }

      NetworkManager.get().addRecord(requestId, record)
      if (
        contentType?.startsWith("image/", ignoreCase = true) == true &&
        exchange.responseBody != null &&
        exchange.responseBody.size <= MAX_IMAGE_BYTES
      ) {
        MobileDiagnosticsImageStore.put(requestId, exchange.responseBody)
      }
      NetworkManager.get().updateRecord(record, false)
    }
  }

  /**
   * Java/reflection-friendly bridge for optional diagnostic integrations. It is intentionally
   * additive: when this library is absent, callers can skip it without changing networking.
   */
  @JvmStatic
  fun recordHttpExchange(
    url: String,
    method: String,
    requestHeaders: Map<String, List<String>>?,
    requestBody: ByteArray?,
    requestBodyLength: Long,
    statusCode: Int,
    responseHeaders: Map<String, List<String>>?,
    responseBody: ByteArray?,
    responseBodyLength: Long,
    startedAtMs: Long,
    endedAtMs: Long,
    error: String?,
  ) {
    record(
      MobileDiagnosticsHttpExchange(
        url = url,
        method = method,
        requestHeaders = requestHeaders.orEmpty(),
        requestBody = requestBody,
        requestBodyLength = requestBodyLength,
        statusCode = statusCode.takeIf { it > 0 },
        responseHeaders = responseHeaders.orEmpty(),
        responseBody = responseBody,
        responseBodyLength = responseBodyLength,
        startedAtMs = startedAtMs,
        endedAtMs = endedAtMs,
        error = error,
      ),
    )
  }

  /** Adds passive capture once without allowing diagnostics setup to break client creation. */
  @JvmStatic
  fun install(builder: OkHttpClient.Builder): OkHttpClient.Builder = builder.also { target ->
    runCatching {
      val interceptors = target.interceptors()
      if (interceptors.none { it is MobileDiagnosticsOverrideInterceptor }) {
        target.addInterceptor(MobileDiagnosticsOverrideInterceptor())
      }
      val alreadyCaptured = interceptors.any {
        it is MobileDiagnosticsOkHttpInterceptor || it.javaClass.name == DOKIT_CAP_INTERCEPTOR
      }
      if (!alreadyCaptured) target.addInterceptor(MobileDiagnosticsOkHttpInterceptor())
    }
  }

  private fun decodeTextBody(body: ByteArray?, contentType: String?): String? {
    if (body == null || body.isEmpty() || body.size > MAX_TEXT_BODY_BYTES) return null
    if (!isTextContentType(contentType)) return null
    return body.toString(Charsets.UTF_8)
  }

  private fun isTextContentType(contentType: String?): Boolean {
    val normalized = contentType?.lowercase().orEmpty()
    return normalized.startsWith("text/") ||
      normalized.contains("json") ||
      normalized.contains("xml") ||
      normalized.contains("graphql") ||
      normalized.contains("x-www-form-urlencoded")
  }

  private fun firstHeader(headers: Map<String, List<String>>, name: String): String? =
    headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }
      ?.value
      ?.firstOrNull()

  private fun formatHeaders(headers: Map<String, List<String>>): String =
    headers.entries
      .sortedBy { it.key.lowercase() }
      .flatMap { (name, values) ->
        values.ifEmpty { listOf("") }.map { value ->
          "${name.replace(HEADER_LINE_BREAK, "")}:${value.replace(HEADER_LINE_BREAK, " ")}"
        }
      }
      .joinToString("\n")

  internal const val MAX_TEXT_BODY_BYTES = 256 * 1024
  internal const val MAX_IMAGE_BYTES = 4 * 1024 * 1024
  private const val MAX_ERROR_CHARACTERS = 2_048
  private const val ERROR_HEADER = "X-Mobile-Diagnostics-Error"
  private const val HEADER_LINE_BREAK = "\n"
  private const val DOKIT_CAP_INTERCEPTOR =
    "com.didichuxing.doraemonkit.kit.network.okhttp.interceptor.DokitCapInterceptor"
}

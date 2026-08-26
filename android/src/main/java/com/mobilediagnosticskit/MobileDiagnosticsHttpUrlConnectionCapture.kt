package com.mobilediagnosticskit

import java.io.ByteArrayOutputStream
import java.io.FilterInputStream
import java.io.FilterOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URLConnection
import java.util.Collections
import java.util.WeakHashMap

/** Passive HttpURLConnection call-site helpers used only by the diagnostics Gradle plugin. */
object MobileDiagnosticsHttpUrlConnectionCapture {
  private val states = Collections.synchronizedMap(
    WeakHashMap<HttpURLConnection, CaptureState>(),
  )

  @JvmStatic
  @Throws(IOException::class)
  fun replacementForConnect(connection: URLConnection) {
    val httpConnection = connection as? HttpURLConnection
    if (httpConnection == null) {
      connection.connect()
      return
    }

    stateFor(httpConnection)
    try {
      connection.connect()
    } catch (error: Throwable) {
      finish(httpConnection, error)
      throw error
    }
  }

  @JvmStatic
  @Throws(IOException::class)
  fun replacementForOutputStream(connection: URLConnection): OutputStream {
    val httpConnection = connection as? HttpURLConnection
      ?: return connection.outputStream
    val state = stateFor(httpConnection)
    val stream = try {
      connection.outputStream
    } catch (error: Throwable) {
      finish(httpConnection, error)
      throw error
    }
    return state?.let {
      runCatching {
        CapturingOutputStream(httpConnection, stream, it.requestBody)
      }.getOrDefault(stream)
    } ?: stream
  }

  @JvmStatic
  @Throws(IOException::class)
  fun replacementForInputStream(connection: URLConnection): InputStream {
    val httpConnection = connection as? HttpURLConnection
      ?: return connection.inputStream
    val state = stateFor(httpConnection)
    val stream = try {
      connection.inputStream
    } catch (error: Throwable) {
      state?.let { captureState ->
        updateResponseMetadata(httpConnection, captureState)
        if (captureState.statusCode == null) finish(httpConnection, error)
      }
      throw error
    }
    return state?.let {
      updateResponseMetadata(httpConnection, it)
      runCatching {
        CapturingInputStream(httpConnection, stream, it.responseBody)
      }.getOrDefault(stream)
    } ?: stream
  }

  @JvmStatic
  @Throws(IOException::class)
  fun replacementForResponseCode(connection: HttpURLConnection): Int {
    val state = stateFor(connection)
    val responseCode = try {
      connection.responseCode
    } catch (error: Throwable) {
      finish(connection, error)
      throw error
    }
    state?.let {
      it.statusCode = responseCode
      updateResponseMetadata(connection, it)
    }
    return responseCode
  }

  @JvmStatic
  fun replacementForErrorStream(connection: HttpURLConnection): InputStream? {
    val state = stateFor(connection)
    val stream = try {
      connection.errorStream
    } catch (error: Throwable) {
      finish(connection, error)
      throw error
    }
    state?.let { updateResponseMetadata(connection, it) }
    if (stream == null) {
      finish(connection, null)
      return null
    }
    return state?.let {
      runCatching {
        CapturingInputStream(connection, stream, it.responseBody)
      }.getOrDefault(stream)
    } ?: stream
  }

  @JvmStatic
  fun replacementForDisconnect(connection: HttpURLConnection) {
    var failure: Throwable? = null
    try {
      connection.disconnect()
    } catch (error: Throwable) {
      failure = error
      throw error
    } finally {
      finish(connection, failure)
    }
  }

  private fun stateFor(connection: HttpURLConnection): CaptureState? = runCatching {
    synchronized(states) {
      states[connection] ?: run {
        val headers = requestHeaders(connection)
        CaptureState(
          url = runCatching { connection.url.toString() }.getOrDefault(""),
          method = runCatching { connection.requestMethod }.getOrDefault("HTTP"),
          requestHeaders = headers,
          requestBody = CaptureBuffer(
            bodyLimit(firstHeader(headers, "Content-Type")),
          ),
          startedAtMs = System.currentTimeMillis(),
        ).also { states[connection] = it }
      }
    }
  }.getOrNull()

  private fun updateResponseMetadata(
    connection: HttpURLConnection,
    state: CaptureState,
  ) {
    runCatching {
      if (state.statusCode == null) {
        state.statusCode = runCatching { connection.responseCode }.getOrNull()
      }
      state.responseHeaders = responseHeaders(connection)
      state.responseBody.updateLimit(
        bodyLimit(firstHeader(state.responseHeaders, "Content-Type")),
      )
      state.responseBodyLength = runCatching { connection.contentLengthLong }
        .getOrNull()
        ?.takeIf { it >= 0L }
    }
  }

  private fun finish(connection: HttpURLConnection, error: Throwable?) {
    runCatching {
      val state = synchronized(states) { states.remove(connection) } ?: return
      MobileDiagnosticsNativeNetwork.record(
        MobileDiagnosticsHttpExchange(
          url = state.url,
          method = state.method,
          requestHeaders = state.requestHeaders,
          requestBody = state.requestBody.bytesOrNull(),
          requestBodyLength = state.requestBody.totalBytes,
          statusCode = state.statusCode,
          responseHeaders = state.responseHeaders,
          responseBody = state.responseBody.bytesOrNull(),
          responseBodyLength = state.responseBodyLength
            ?: state.responseBody.totalBytes,
          startedAtMs = state.startedAtMs,
          endedAtMs = System.currentTimeMillis(),
          error = error?.let {
            "${it.javaClass.name}: ${it.message.orEmpty()}"
          },
        ),
      )
    }
  }

  private fun requestHeaders(connection: HttpURLConnection): Map<String, List<String>> =
    runCatching { copyHeaders(connection.requestProperties) }.getOrDefault(emptyMap())

  private fun responseHeaders(connection: HttpURLConnection): Map<String, List<String>> =
    runCatching { copyHeaders(connection.headerFields) }.getOrDefault(emptyMap())

  private fun copyHeaders(headers: Map<String?, List<String?>?>): Map<String, List<String>> =
    headers.entries.mapNotNull { (name, values) ->
      name?.let { nonNullName ->
        nonNullName to values.orEmpty().filterNotNull()
      }
    }.toMap()

  private fun firstHeader(headers: Map<String, List<String>>, name: String): String? =
    headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }
      ?.value
      ?.firstOrNull()

  private fun bodyLimit(contentType: String?): Int {
    val normalized = contentType?.lowercase().orEmpty()
    return when {
      normalized.startsWith("image/") -> MobileDiagnosticsNativeNetwork.MAX_IMAGE_BYTES
      normalized.startsWith("text/") ||
        normalized.contains("json") ||
        normalized.contains("xml") ||
        normalized.contains("graphql") ||
        normalized.contains("x-www-form-urlencoded") ->
        MobileDiagnosticsNativeNetwork.MAX_TEXT_BODY_BYTES
      else -> 0
    }
  }

  private data class CaptureState(
    val url: String,
    val method: String,
    val requestHeaders: Map<String, List<String>>,
    val requestBody: CaptureBuffer,
    val startedAtMs: Long,
    val responseBody: CaptureBuffer = CaptureBuffer(0),
    var statusCode: Int? = null,
    var responseHeaders: Map<String, List<String>> = emptyMap(),
    var responseBodyLength: Long? = null,
  )

  private class CaptureBuffer(initialLimit: Int) {
    private var limit = initialLimit.coerceAtLeast(0)
    private val output = ByteArrayOutputStream()
    private var incomplete = false
    var totalBytes: Long = 0L
      private set

    @Synchronized
    fun updateLimit(nextLimit: Int) {
      limit = nextLimit.coerceAtLeast(0)
      if (limit == 0 || output.size() > limit) {
        output.reset()
      }
    }

    @Synchronized
    fun append(bytes: ByteArray, offset: Int, length: Int) {
      if (length <= 0) return
      totalBytes += length.toLong()
      if (incomplete || limit == 0 || output.size() >= limit) return
      val writable = minOf(length, limit - output.size())
      output.write(bytes, offset, writable)
      if (writable != length) incomplete = true
    }

    @Synchronized
    fun append(value: Int) {
      totalBytes += 1L
      if (incomplete || limit == 0 || output.size() >= limit) {
        incomplete = incomplete || limit > 0
        return
      }
      output.write(value)
    }

    @Synchronized
    fun skip(length: Long) {
      if (length <= 0L) return
      totalBytes += length
      incomplete = true
    }

    @Synchronized
    fun markIncomplete() {
      incomplete = true
    }

    @Synchronized
    fun bytesOrNull(): ByteArray? =
      output.toByteArray().takeIf { !incomplete && it.isNotEmpty() }
  }

  private class CapturingInputStream(
    private val connection: HttpURLConnection,
    input: InputStream,
    private val capture: CaptureBuffer,
  ) : FilterInputStream(input) {
    override fun read(): Int {
      val value = try {
        `in`.read()
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      if (value < 0) finish(connection, null) else runCatching { capture.append(value) }
      return value
    }

    override fun read(bytes: ByteArray): Int {
      val count = try {
        `in`.read(bytes)
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      if (count < 0) {
        finish(connection, null)
      } else {
        runCatching { capture.append(bytes, 0, count) }
      }
      return count
    }

    override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
      val count = try {
        `in`.read(bytes, offset, length)
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      if (count < 0) {
        finish(connection, null)
      } else {
        runCatching { capture.append(bytes, offset, count) }
      }
      return count
    }

    override fun skip(length: Long): Long {
      val skipped = try {
        `in`.skip(length)
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      runCatching { capture.skip(skipped) }
      return skipped
    }

    override fun mark(readLimit: Int) {
      `in`.mark(readLimit)
      runCatching { capture.markIncomplete() }
    }

    override fun reset() {
      `in`.reset()
      runCatching { capture.markIncomplete() }
    }

    override fun close() {
      try {
        `in`.close()
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      finish(connection, null)
    }
  }

  private class CapturingOutputStream(
    private val connection: HttpURLConnection,
    output: OutputStream,
    private val capture: CaptureBuffer,
  ) : FilterOutputStream(output) {
    override fun write(value: Int) {
      try {
        out.write(value)
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      runCatching { capture.append(value) }
    }

    override fun write(bytes: ByteArray) {
      try {
        out.write(bytes)
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      runCatching { capture.append(bytes, 0, bytes.size) }
    }

    override fun write(bytes: ByteArray, offset: Int, length: Int) {
      try {
        out.write(bytes, offset, length)
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
      runCatching { capture.append(bytes, offset, length) }
    }

    override fun close() {
      try {
        out.close()
      } catch (error: Throwable) {
        finish(connection, error)
        throw error
      }
    }
  }
}

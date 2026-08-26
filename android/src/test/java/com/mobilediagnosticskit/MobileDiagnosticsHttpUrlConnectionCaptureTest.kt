package com.mobilediagnosticskit

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLConnection
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class MobileDiagnosticsHttpUrlConnectionCaptureTest {
  @Test
  fun `returns the original response code and disconnect result`() {
    val connection = FakeHttpURLConnection().apply { responseCodeValue = 204 }

    val responseCode =
      MobileDiagnosticsHttpUrlConnectionCapture.replacementForResponseCode(connection)
    MobileDiagnosticsHttpUrlConnectionCapture.replacementForDisconnect(connection)

    assertEquals(204, responseCode)
    assertTrue(connection.disconnected)
  }

  @Test
  fun `rethrows the same response exception instance`() {
    val expected = IOException("same failure")
    val connection = FakeHttpURLConnection().apply { responseFailure = expected }

    val actual = try {
      MobileDiagnosticsHttpUrlConnectionCapture.replacementForResponseCode(connection)
      fail("Expected the connection failure")
      null
    } catch (error: IOException) {
      error
    }

    assertSame(expected, actual)
  }

  @Test
  fun `delegates exact byte array stream overloads`() {
    val requestStream = OverloadTrackingOutputStream()
    val responseStream = OverloadTrackingInputStream("response".toByteArray())
    val connection = FakeHttpURLConnection().apply {
      output = requestStream
      input = responseStream
      responseHeadersValue = mapOf("Content-Type" to listOf("text/plain"))
    }

    val output =
      MobileDiagnosticsHttpUrlConnectionCapture.replacementForOutputStream(connection)
    output.write("request".toByteArray())
    output.close()
    val input =
      MobileDiagnosticsHttpUrlConnectionCapture.replacementForInputStream(connection)
    val response = ByteArray(8)
    assertEquals(8, input.read(response))
    input.close()

    assertTrue(requestStream.byteArrayOverloadUsed)
    assertFalse(requestStream.rangeOverloadUsed)
    assertArrayEquals("request".toByteArray(), requestStream.bytes.toByteArray())
    assertTrue(responseStream.byteArrayOverloadUsed)
    assertFalse(responseStream.rangeOverloadUsed)
    assertArrayEquals("response".toByteArray(), response)
  }

  @Test
  fun `leaves non-http URL connections and streams untouched`() {
    val expected = ByteArrayInputStream(byteArrayOf(1, 2, 3))
    val connection = object : URLConnection(URL("file:/diagnostics")) {
      override fun connect() = Unit
      override fun getInputStream(): InputStream = expected
    }

    val actual =
      MobileDiagnosticsHttpUrlConnectionCapture.replacementForInputStream(connection)

    assertSame(expected, actual)
  }

  private class FakeHttpURLConnection : HttpURLConnection(URL("https://example.test")) {
    var responseCodeValue = 200
    var responseFailure: IOException? = null
    var disconnected = false
    var input: InputStream = ByteArrayInputStream(byteArrayOf())
    var output: OutputStream = ByteArrayOutputStream()
    var responseHeadersValue: Map<String, List<String>> = emptyMap()

    override fun connect() = Unit

    override fun disconnect() {
      disconnected = true
    }

    override fun usingProxy(): Boolean = false

    override fun getResponseCode(): Int {
      responseFailure?.let { throw it }
      return responseCodeValue
    }

    override fun getInputStream(): InputStream = input

    override fun getOutputStream(): OutputStream = output

    override fun getHeaderFields(): Map<String, List<String>> = responseHeadersValue
  }

  private class OverloadTrackingOutputStream : OutputStream() {
    val bytes = ByteArrayOutputStream()
    var byteArrayOverloadUsed = false
    var rangeOverloadUsed = false

    override fun write(value: Int) {
      bytes.write(value)
    }

    override fun write(value: ByteArray) {
      byteArrayOverloadUsed = true
      bytes.write(value)
    }

    override fun write(value: ByteArray, offset: Int, length: Int) {
      rangeOverloadUsed = true
      bytes.write(value, offset, length)
    }
  }

  private class OverloadTrackingInputStream(
    bytes: ByteArray,
  ) : InputStream() {
    private val input = ByteArrayInputStream(bytes)
    var byteArrayOverloadUsed = false
    var rangeOverloadUsed = false

    override fun read(): Int = input.read()

    override fun read(bytes: ByteArray): Int {
      byteArrayOverloadUsed = true
      return input.read(bytes)
    }

    override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
      rangeOverloadUsed = true
      return input.read(bytes, offset, length)
    }
  }
}

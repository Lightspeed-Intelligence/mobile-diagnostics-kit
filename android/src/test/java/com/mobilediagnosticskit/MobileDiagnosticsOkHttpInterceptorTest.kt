package com.mobilediagnosticskit

import java.io.IOException
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class MobileDiagnosticsOkHttpInterceptorTest {
  private fun client() = OkHttpClient.Builder()
    .retryOnConnectionFailure(false)
    .addInterceptor(MobileDiagnosticsOkHttpInterceptor())

  @Test
  fun `returns the same failure instance`() {
    val expected = IOException("transport failure")
    val client = client().addInterceptor { throw expected }.build()
    val actual = failure { client.newCall(request("http://127.0.0.1:1/")).execute() }
    assertSame(expected, actual)
  }

  @Test
  fun `preserves real HTTP success and error status headers and body`() {
    for (status in listOf(200, 400, 401)) {
      ServerSocket(0).use { server ->
        val writer = Thread {
          server.accept().use { socket ->
            val reader = socket.getInputStream().bufferedReader()
            while (!reader.readLine().isNullOrEmpty()) Unit
            socket.getOutputStream().write(
              ("HTTP/1.1 $status Test\r\nContent-Type: application/json\r\n" +
                "X-Result: original\r\nContent-Length: 11\r\nConnection: close\r\n\r\n" +
                "{\"ok\":true}").toByteArray(),
            )
          }
        }.apply { isDaemon = true; start() }
        client().build().newCall(request(url(server))).execute().use { response ->
          assertEquals(status, response.code)
          assertEquals("original", response.header("X-Result"))
          assertEquals("{\"ok\":true}", response.body!!.string())
        }
        writer.join(2_000)
        assertFalse(writer.isAlive)
      }
    }
  }

  @Test
  fun `connection refusal remains an IOException`() {
    val port = ServerSocket(0).use { it.localPort }
    val actual = failure {
      client().build().newCall(request("http://127.0.0.1:$port/")).execute()
    }
    assertTrue(actual is IOException)
  }

  @Test
  fun `real read timeout remains a timeout`() {
    ServerSocket(0).use { server ->
      val call = client().readTimeout(100, TimeUnit.MILLISECONDS).build()
        .newCall(request(url(server)))
      val result = CompletableFuture.supplyAsync { failure { call.execute() } }
      server.accept().use {
        assertTrue(result.get(3, TimeUnit.SECONDS) is SocketTimeoutException)
      }
    }
  }

  @Test
  fun `cancels a real in flight call without producing a response`() {
    ServerSocket(0).use { server ->
      val call = client().readTimeout(3, TimeUnit.SECONDS).build()
        .newCall(request(url(server)))
      val result = CompletableFuture.supplyAsync { failure { call.execute() } }
      server.accept().use {
        call.cancel()
        assertTrue(result.get(3, TimeUnit.SECONDS) is IOException)
        assertTrue(call.isCanceled())
      }
    }
  }

  @Test
  fun `does not replace a successful response object`() {
    val original = okhttp3.Response.Builder()
      .request(request("http://127.0.0.1/"))
      .protocol(okhttp3.Protocol.HTTP_1_1).code(200).message("OK")
      .body(okhttp3.ResponseBody.create(null, byteArrayOf(1, 2, 3))).build()
    val client = client().addInterceptor { original }.build()
    client.newCall(original.request).execute().use { assertSame(original, it) }
  }

  private fun request(url: String) = Request.Builder().url(url).build()
  private fun url(server: ServerSocket) = "http://127.0.0.1:${server.localPort}/"

  private fun failure(block: () -> Unit): IOException {
    try {
      block()
    } catch (error: IOException) {
      return error
    }
    throw AssertionError("Expected original network failure, received a response")
  }
}

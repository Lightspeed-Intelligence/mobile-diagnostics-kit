package com.mobilediagnosticskit

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import com.didichuxing.doraemonkit.kit.network.NetworkManager
import com.didichuxing.doraemonkit.kit.network.bean.NetworkRecord
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.util.Locale
import org.json.JSONObject

internal class MobileDiagnosticsNetworkModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "MobileDiagnosticsNetwork"

  @ReactMethod
  fun getRequests(promise: Promise) {
    runCatching {
      val records = NetworkManager.get().records
      val snapshot = synchronized(records) { records.toList().asReversed() }
      Arguments.createArray().apply {
        snapshot.forEach { pushMap(toSnapshot(it)) }
      }
    }.onSuccess(promise::resolve).onFailure {
      promise.reject("network_snapshot_failed", "Unable to read captured requests", it)
    }
  }

  @ReactMethod
  fun clearRequests(promise: Promise) {
    runCatching {
      val records = NetworkManager.get().records
      synchronized(records) { records.clear() }
    }.onSuccess { promise.resolve(null) }.onFailure {
      promise.reject("network_clear_failed", "Unable to clear captured requests", it)
    }
  }

  @ReactMethod
  fun setCaptureEnabled(enabled: Boolean, promise: Promise) {
    runCatching {
      if (enabled) NetworkManager.get().startMonitor()
      else NetworkManager.get().stopMonitor()
    }.onSuccess { promise.resolve(null) }.onFailure {
      promise.reject("network_capture_failed", "Unable to change network capture", it)
    }
  }

  @ReactMethod
  fun isCaptureEnabled(promise: Promise) {
    promise.resolve(NetworkManager.isActive())
  }

  @ReactMethod
  fun copyToClipboard(value: String, promise: Promise) {
    runCatching {
      val clipboard = reactApplicationContext.getSystemService(
        Context.CLIPBOARD_SERVICE,
      ) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("Network request", value))
    }.onSuccess { promise.resolve(null) }.onFailure {
      promise.reject("network_copy_failed", "Unable to copy network content", it)
    }
  }

  private fun toSnapshot(record: NetworkRecord): WritableMap {
    val request = record.mRequest
    val response = record.mResponse
    val url = request?.url.orEmpty()
    val uri = Uri.parse(url)
    val responseBody = record.mResponseBody.orEmpty()
    val mimeType = response?.mimeType.orEmpty()
    return Arguments.createMap().apply {
      putString("id", record.mRequestId.toString())
      putString("url", url)
      putString("host", uri.host.orEmpty())
      putString("path", uri.encodedPath.orEmpty().ifBlank { "/" })
      putString("method", request?.method?.uppercase(Locale.ROOT) ?: "HTTP")
      putString("status", response?.status?.takeIf { it > 0 }?.toString() ?: "Pending")
      putString("mimeType", mimeType)
      putDouble("startTime", record.startTime.toDouble())
      putDouble("duration", (record.endTime - record.startTime).coerceAtLeast(0).toDouble())
      putDouble("requestBytes", record.requestLength.toDouble())
      putDouble("responseBytes", record.responseLength.toDouble())
      putArray("requestHeaders", headers(request?.headers))
      putArray("responseHeaders", headers(response?.headers))
      putString("requestBody", request?.postData.orEmpty())
      putString("responseBody", responseBody)
      putBoolean("responseBodyBinary", responseBody.isEmpty() && record.responseLength > 0)
    }
  }

  private fun headers(rawHeaders: String?): WritableArray {
    val result = Arguments.createArray()
    val source = rawHeaders?.trim().orEmpty()
    if (source.isEmpty()) return result
    if (source.startsWith("{") && source.endsWith("}")) {
      runCatching { JSONObject(source) }.getOrNull()?.let { json ->
        json.keys().asSequence().sorted().forEach { name ->
          result.pushMap(Arguments.createMap().apply {
            putString("name", name)
            putString("value", json.optString(name))
          })
        }
      }
    }
    return result
  }
}

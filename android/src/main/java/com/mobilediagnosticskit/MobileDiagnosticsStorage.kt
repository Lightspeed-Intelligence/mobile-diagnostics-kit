package com.mobilediagnosticskit

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

internal data class MobileDiagnosticsStorageEntry(
  val key: String,
  val value: String,
)

internal object MobileDiagnosticsStorage {
  private const val REDACTED = "[REDACTED]"
  private val sensitiveName = Regex(
    "(^|[_\\-.])(access[_-]?token|refresh[_-]?token|id[_-]?token|token|authorization|cookie|secret|password|passwd|api[_-]?key|private[_-]?key|client[_-]?secret|credential|sentry)([_\\-.]|$)",
    RegexOption.IGNORE_CASE,
  )

  init {
    System.loadLibrary("mobilediagnosticskit")
  }

  fun readDefault(context: Context): List<MobileDiagnosticsStorageEntry> {
    val values = readDefaultNative("${context.filesDir.absolutePath}/mmkv")
    return values.asList().chunked(2).mapNotNull { pair ->
      if (pair.size != 2) null
      else MobileDiagnosticsStorageEntry(pair[0], redact(pair[0], pair[1]))
    }.sortedBy { it.key.lowercase() }
  }

  private fun redact(key: String, rawValue: String): String {
    if (sensitiveName.containsMatchIn(normalize(key))) return REDACTED
    val parsed = runCatching { JSONTokener(rawValue).nextValue() }.getOrNull()
      ?: return rawValue
    return when (val sanitized = sanitizeJson(parsed)) {
      is JSONObject -> sanitized.toString(2)
      is JSONArray -> sanitized.toString(2)
      else -> sanitized.toString()
    }
  }

  private fun sanitizeJson(value: Any?): Any = when (value) {
    is JSONObject -> JSONObject().also { output ->
      value.keys().forEach { key ->
        output.put(
          key,
          if (sensitiveName.containsMatchIn(normalize(key))) REDACTED
          else sanitizeJson(value.opt(key)),
        )
      }
    }
    is JSONArray -> JSONArray().also { output ->
      for (index in 0 until value.length()) output.put(sanitizeJson(value.opt(index)))
    }
    else -> value ?: JSONObject.NULL
  }

  private fun normalize(value: String): String =
    value.replace(Regex("([a-z])([A-Z])"), "$1_$2").lowercase()

  @JvmStatic
  private external fun readDefaultNative(rootPath: String): Array<String>
}

package com.mobilediagnosticskit

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

internal data class MobileDiagnosticsStorageEntry(
  val key: String,
  val kind: String,
  val value: String,
  val canMutate: Boolean,
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
    val values = readDefaultNative(rootPath(context))
    return values.asList().chunked(3).mapNotNull { parts ->
      if (parts.size != 3) return@mapNotNull null
      val (key, kind, rawValue) = parts
      val parsed = runCatching { JSONTokener(rawValue).nextValue() }.getOrNull()
      MobileDiagnosticsStorageEntry(
        key = key,
        kind = kind,
        value = redact(key, rawValue),
        canMutate = kind != "binary" &&
          !sensitiveName.containsMatchIn(normalize(key)) &&
          !containsSensitiveField(parsed),
      )
    }.sortedBy { it.key.lowercase() }
  }

  fun writeDefault(
    context: Context,
    entry: MobileDiagnosticsStorageEntry,
    value: String,
  ): Boolean {
    if (!entry.canMutate) return false
    val normalized = when (entry.kind) {
      "string" -> value
      "number" -> value.trim().takeIf { candidate ->
        candidate.toDoubleOrNull()?.isFinite() == true
      } ?: return false
      "boolean" -> value.trim().lowercase().takeIf {
        it == "true" || it == "false"
      } ?: return false
      else -> return false
    }
    return writeDefaultNative(rootPath(context), entry.key, entry.kind, normalized)
  }

  fun removeDefault(context: Context, entry: MobileDiagnosticsStorageEntry): Boolean =
    entry.canMutate && removeDefaultNative(rootPath(context), entry.key)

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

  private fun containsSensitiveField(value: Any?): Boolean = when (value) {
    is JSONObject -> value.keys().asSequence().any { key ->
      sensitiveName.containsMatchIn(normalize(key)) ||
        containsSensitiveField(value.opt(key))
    }
    is JSONArray -> (0 until value.length()).any { index ->
      containsSensitiveField(value.opt(index))
    }
    else -> false
  }

  private fun normalize(value: String): String =
    value.replace(Regex("([a-z])([A-Z])"), "$1_$2").lowercase()

  private fun rootPath(context: Context): String =
    "${context.filesDir.absolutePath}/mmkv"

  @JvmStatic
  private external fun readDefaultNative(rootPath: String): Array<String>

  @JvmStatic
  private external fun writeDefaultNative(
    rootPath: String,
    key: String,
    kind: String,
    value: String,
  ): Boolean

  @JvmStatic
  private external fun removeDefaultNative(rootPath: String, key: String): Boolean
}

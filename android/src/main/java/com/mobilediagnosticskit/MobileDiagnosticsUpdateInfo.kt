package com.mobilediagnosticskit

import org.json.JSONObject

internal object MobileDiagnosticsUpdateInfo {
  fun sourceBranch(manifestString: String?): String? {
    if (manifestString.isNullOrBlank()) return null
    val manifest = runCatching { JSONObject(manifestString) }.getOrNull() ?: return null
    return manifest.nonBlankString("branchName")
      ?: manifest.optJSONObject("metadata")?.nonBlankString("branchName")
      ?: manifest.optJSONObject("extra")?.let { extra ->
        extra.nonBlankString("sourceBranch")
          ?: extra.optJSONObject("eas")?.nonBlankString("branchName")
      }
  }

  private fun JSONObject.nonBlankString(key: String): String? =
    optString(key).trim().takeIf { it.isNotEmpty() }
}

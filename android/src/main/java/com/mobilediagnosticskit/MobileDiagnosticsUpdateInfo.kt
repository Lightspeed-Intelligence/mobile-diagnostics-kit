package com.mobilediagnosticskit

import org.json.JSONObject

internal object MobileDiagnosticsUpdateInfo {
  fun sourceBranch(manifestString: String?): String? {
    if (manifestString.isNullOrBlank()) return null
    val manifest = runCatching { JSONObject(manifestString) }.getOrNull() ?: return null
    val extra = manifest.optJSONObject("extra")
    return extra?.nonBlankString("sourceBranch")
      ?: extra?.optJSONObject("expoClient")
        ?.optJSONObject("extra")
        ?.nonBlankString("sourceBranch")
      ?: manifest.nonBlankString("branchName")
      ?: manifest.optJSONObject("metadata")?.nonBlankString("branchName")
      ?: extra?.optJSONObject("eas")?.nonBlankString("branchName")
  }

  private fun JSONObject.nonBlankString(key: String): String? =
    optString(key).trim().takeIf { it.isNotEmpty() }
}

package com.mobilediagnosticskit

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MobileDiagnosticsOverridesTest {
  @Test
  fun canonicalApiBaseUrl_acceptsOnlyApprovedTipsyOrigins() {
    assertEquals(
      "https://branch.api.dev.fantacy.live",
      MobileDiagnosticsOverrides.canonicalApiBaseUrl(
        " HTTPS://BRANCH.API.DEV.FANTACY.LIVE:443/api/v2/ ",
      ),
    )
    assertEquals(
      "https://api.tipsy.chat",
      MobileDiagnosticsOverrides.canonicalApiBaseUrl("https://api.tipsy.chat"),
    )
    assertNull(MobileDiagnosticsOverrides.canonicalApiBaseUrl("http://api.tipsy.chat/api/v1"))
    assertNull(MobileDiagnosticsOverrides.canonicalApiBaseUrl("https://user@api.tipsy.chat/api/v1"))
    assertNull(MobileDiagnosticsOverrides.canonicalApiBaseUrl("https://example.com/api/v1"))
    assertNull(MobileDiagnosticsOverrides.canonicalApiBaseUrl("https://api.tipsy.chat/private"))
  }

  @Test
  fun rewriteApiUrl_changesOnlyOriginAndPreservesVersionPathAndQuery() {
    val rewritten = MobileDiagnosticsOverrides.rewriteApiUrl(
      "https://api.dev.fantacy.live/api/v2/characters?page=3".toHttpUrl(),
      "https://feature.api.dev.fantacy.live/api/v1",
    )

    assertEquals(
      "https://feature.api.dev.fantacy.live/api/v2/characters?page=3",
      rewritten.toString(),
    )
    assertEquals(
      "https://feature.api.dev.fantacy.live/api/v3/experiments?locale=zh-CN",
      MobileDiagnosticsOverrides.rewriteApiUrl(
        "https://api.tipsy.chat/api/v3/experiments?locale=zh-CN".toHttpUrl(),
        "https://feature.api.dev.fantacy.live",
      ).toString(),
    )
    assertEquals(
      "https://cdn.example.com/api/v2/image",
      MobileDiagnosticsOverrides.rewriteApiUrl(
        "https://cdn.example.com/api/v2/image".toHttpUrl(),
        "https://feature.api.dev.fantacy.live/api/v1",
      ).toString(),
    )
    assertEquals(
      "https://api.dev.fantacy.live/health",
      MobileDiagnosticsOverrides.rewriteApiUrl(
        "https://api.dev.fantacy.live/health".toHttpUrl(),
        "https://feature.api.dev.fantacy.live/api/v1",
      ).toString(),
    )
  }

  @Test
  fun patchABConfigResponse_mergesSelectedValuesAndPreservesUnknownFields() {
    val original = """
      {"code":0,"trace_id":"trace-1","data":{"configs":{"existing":"keep"},"revision":7}}
    """.trimIndent().toByteArray()
    val patched = MobileDiagnosticsOverrides.patchABConfigResponse(
      "https://api.tipsy.chat/api/v1/ab_config/get_bundle_configs".toHttpUrl(),
      "POST",
      original,
      MobileDiagnosticsMockOverride(
        enabled = true,
        values = mapOf("enable_recsys_in_home_show_case" to "true"),
      ),
    ) ?: error("Expected a patched response")
    val json = JSONObject(patched.toString(Charsets.UTF_8))

    assertEquals("trace-1", json.getString("trace_id"))
    assertEquals(7, json.getJSONObject("data").getInt("revision"))
    assertEquals("keep", json.getJSONObject("data").getJSONObject("configs").getString("existing"))
    assertEquals(
      "true",
      json.getJSONObject("data").getJSONObject("configs")
        .getString("enable_recsys_in_home_show_case"),
    )
  }

  @Test
  fun patchABConfigResponse_isNoOpForDisabledWrongEndpointAndInvalidJson() {
    val url = "https://api.tipsy.chat/api/v1/ab_config/get_bundle_configs".toHttpUrl()
    val disabled = MobileDiagnosticsMockOverride(
      enabled = false,
      values = mapOf("enable_recsys_in_home_show_case" to "true"),
    )
    val enabled = disabled.copy(enabled = true)
    val original = "{\"data\":{\"configs\":{}}}".toByteArray()

    assertNull(MobileDiagnosticsOverrides.patchABConfigResponse(url, "POST", original, disabled))
    assertNull(
      MobileDiagnosticsOverrides.patchABConfigResponse(
        "https://api.tipsy.chat/api/v1/user/info".toHttpUrl(),
        "POST",
        original,
        enabled,
      ),
    )
    assertNull(MobileDiagnosticsOverrides.patchABConfigResponse(url, "GET", original, enabled))
    assertNull(
      MobileDiagnosticsOverrides.patchABConfigResponse(
        "https://third-party.example/api/v1/ab_config/get_bundle_configs".toHttpUrl(),
        "POST",
        original,
        enabled,
      ),
    )
    assertNull(MobileDiagnosticsOverrides.patchABConfigResponse(url, "POST", "bad".toByteArray(), enabled))
  }
}

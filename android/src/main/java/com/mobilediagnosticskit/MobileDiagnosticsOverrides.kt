package com.mobilediagnosticskit

import android.content.Context
import java.net.URI
import java.util.Locale
import okhttp3.HttpUrl
import org.json.JSONObject

internal data class MobileDiagnosticsMockOverride(
  val enabled: Boolean,
  val values: Map<String, String>,
)

/** Persistent, package-owned runtime overrides. Missing or invalid state is always a no-op. */
internal object MobileDiagnosticsOverrides {
  const val API_BASE_URL_KEY = "mobile_diagnostics_api_base_url"
  const val MOCK_OVERRIDES_KEY = "mobile_diagnostics_mock_overrides_v1"
  const val AB_CONFIG_MOCK_ID = "ab_config/get_bundle_configs"
  const val AB_CONFIG_PATH = "/api/v1/ab_config/get_bundle_configs"
  const val SCREEN_RECOMMENDATION_KEY = "enable_recsys_in_home_show_case"

  private const val PREFERENCES_NAME = "mobile_diagnostics_overrides"
  private val VERSIONED_API_PATH = Regex("^/api/v[0-9]+(?:/.*)?$")

  @Volatile
  private var applicationContext: Context? = null

  fun install(context: Context) {
    applicationContext = context.applicationContext
  }

  fun savedApiBaseUrl(): String? = preferences()
    ?.getString(API_BASE_URL_KEY, null)
    ?.let(::canonicalApiBaseUrl)

  /**
   * Accepts a Tipsy API origin or a versioned API base for display. Rewriting uses only the
   * origin, so every request keeps its original /api/vN path.
   */
  fun canonicalApiBaseUrl(rawValue: String): String? {
    val trimmed = rawValue.trim()
    if (trimmed.isEmpty()) return null
    val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
    val host = uri.host?.lowercase(Locale.ROOT)?.takeIf { it.isNotBlank() } ?: return null
    if (!uri.scheme.equals("https", ignoreCase = true)) return null
    if (uri.rawUserInfo != null || uri.rawQuery != null || uri.rawFragment != null) return null
    if (uri.port != -1 && uri.port != 443) return null
    if (!isAllowedApiHost(host)) return null

    val path = uri.rawPath.orEmpty()
    if (path.isNotEmpty() && path != "/" &&
      !Regex("^/api/v[0-9]+/?$").matches(path)
    ) return null

    return URI("https", null, host, -1, "", null, null).toASCIIString()
  }

  fun saveApiBaseUrl(rawValue: String): String? {
    val canonical = canonicalApiBaseUrl(rawValue) ?: return null
    val prefs = preferences() ?: return null
    if (!prefs.edit().putString(API_BASE_URL_KEY, canonical).commit()) return null
    return canonical
  }

  fun clearApiBaseUrl(): Boolean = preferences()
    ?.edit()
    ?.remove(API_BASE_URL_KEY)
    ?.commit() == true

  fun rewriteApiUrl(url: HttpUrl): HttpUrl = rewriteApiUrl(url, savedApiBaseUrl())

  internal fun rewriteApiUrl(url: HttpUrl, configuredBaseUrl: String?): HttpUrl {
    val configured = configuredBaseUrl?.let(::canonicalApiBaseUrl) ?: return url
    if (!isAllowedApiHost(url.host) || !VERSIONED_API_PATH.matches(url.encodedPath)) return url
    val target = runCatching { URI(configured) }.getOrNull() ?: return url
    val targetHost = target.host ?: return url
    return runCatching {
      url.newBuilder()
        .scheme("https")
        .host(targetHost)
        .port(443)
        .build()
    }.getOrDefault(url)
  }

  fun mockOverride(identifier: String): MobileDiagnosticsMockOverride {
    val root = readMockRoot() ?: return MobileDiagnosticsMockOverride(false, emptyMap())
    val entry = root.optJSONObject(identifier)
      ?: return MobileDiagnosticsMockOverride(false, emptyMap())
    val valuesObject = entry.optJSONObject("values")
    val values = buildMap {
      valuesObject?.keys()?.forEach { key ->
        val value = valuesObject.opt(key)
        if (value is String) put(key, value)
      }
    }
    return MobileDiagnosticsMockOverride(entry.optBoolean("enabled", false), values)
  }

  fun saveMockOverride(
    identifier: String,
    enabled: Boolean,
    values: Map<String, String>,
  ): Boolean {
    val root = readMockRoot() ?: JSONObject()
    val valuesObject = JSONObject()
    normalizeMockValues(values).forEach { (key, value) ->
      valuesObject.put(key, value)
    }
    root.put(identifier, JSONObject().apply {
      put("enabled", enabled)
      put("values", valuesObject)
    })
    return preferences()?.edit()?.putString(MOCK_OVERRIDES_KEY, root.toString())?.commit() == true
  }

  fun clearAllMockOverrides(): Boolean = preferences()
    ?.edit()
    ?.remove(MOCK_OVERRIDES_KEY)
    ?.commit() == true

  /** Removes accidental whitespace-only keys while keeping user-defined experiment names. */
  internal fun normalizeMockValues(values: Map<String, String>): Map<String, String> =
    values.asSequence()
      .map { (key, value) -> key.trim() to value }
      .filter { (key, _) -> key.isNotEmpty() }
      .sortedBy { (key, _) -> key }
      .toMap()

  /** Extracts editable primitive values from a captured AB config response. */
  internal fun parseABConfigValues(body: String): Map<String, String>? = runCatching {
    val configs = JSONObject(body)
      .optJSONObject("data")
      ?.optJSONObject("configs")
      ?: return null
    buildMap {
      configs.keys().forEach { key ->
        when (val value = configs.opt(key)) {
          is String -> put(key, value)
          is Boolean, is Number -> put(key, value.toString())
        }
      }
    }
  }.getOrNull()

  fun patchABConfigResponse(url: HttpUrl, method: String, body: ByteArray): ByteArray? =
    patchABConfigResponse(url, method, body, mockOverride(AB_CONFIG_MOCK_ID))

  internal fun isABConfigRequest(url: HttpUrl, method: String): Boolean =
    isAllowedApiHost(url.host) &&
      method.equals("POST", ignoreCase = true) &&
      url.encodedPath == AB_CONFIG_PATH

  fun shouldMockABConfigRequest(url: HttpUrl, method: String): Boolean {
    if (!isABConfigRequest(url, method)) return false
    val override = mockOverride(AB_CONFIG_MOCK_ID)
    return override.enabled && override.values.isNotEmpty()
  }

  internal fun patchABConfigResponse(
    url: HttpUrl,
    method: String,
    body: ByteArray,
    override: MobileDiagnosticsMockOverride,
  ): ByteArray? {
    if (!isABConfigRequest(url, method)) return null
    if (!override.enabled || override.values.isEmpty()) return null

    return runCatching {
      val root = JSONObject(body.toString(Charsets.UTF_8))
      val data = root.optJSONObject("data") ?: return null
      val configs = data.optJSONObject("configs") ?: return null
      override.values.forEach { (key, value) -> configs.put(key, value) }
      root.toString().toByteArray(Charsets.UTF_8)
    }.getOrNull()
  }

  private fun readMockRoot(): JSONObject? = preferences()
    ?.getString(MOCK_OVERRIDES_KEY, null)
    ?.let { raw -> runCatching { JSONObject(raw) }.getOrNull() }

  private fun preferences() = applicationContext?.getSharedPreferences(
    PREFERENCES_NAME,
    Context.MODE_PRIVATE,
  )

  internal fun isAllowedApiHost(host: String): Boolean {
    val normalized = host.lowercase(Locale.ROOT)
    return normalized == "api.tipsy.chat" ||
      normalized == "api.dev.fantacy.live" ||
      normalized.endsWith(".api.dev.fantacy.live")
  }
}

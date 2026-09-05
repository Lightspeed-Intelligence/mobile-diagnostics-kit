package com.mobilediagnosticskit

internal data class MobileDiagnosticsMockEndpoint(
  val identifier: String,
  val titleResource: Int,
  val descriptionResource: Int,
  val method: String,
  val path: String,
)

internal object MobileDiagnosticsMockRegistry {
  val endpoints: List<MobileDiagnosticsMockEndpoint> = listOf(
    MobileDiagnosticsMockEndpoint(
      identifier = MobileDiagnosticsOverrides.AB_CONFIG_MOCK_ID,
      titleResource = R.string.mobile_diagnostics_ab_mock_title,
      descriptionResource = R.string.mobile_diagnostics_ab_mock_description,
      method = "POST",
      path = MobileDiagnosticsOverrides.AB_CONFIG_PATH,
    ),
  )
}

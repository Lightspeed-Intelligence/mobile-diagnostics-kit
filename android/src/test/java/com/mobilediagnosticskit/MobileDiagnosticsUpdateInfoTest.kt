package com.mobilediagnosticskit

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MobileDiagnosticsUpdateInfoTest {
  @Test
  fun readsBranchFromExpoManifestMetadata() {
    val manifest = """
      {"metadata":{"branchName":"release/1.4.6"}}
    """.trimIndent()

    assertEquals(
      "release/1.4.6",
      MobileDiagnosticsUpdateInfo.sourceBranch(manifest),
    )
  }

  @Test
  fun fallsBackToCustomSourceBranch() {
    val manifest = """
      {"extra":{"sourceBranch":"feature/debug-tools"}}
    """.trimIndent()

    assertEquals(
      "feature/debug-tools",
      MobileDiagnosticsUpdateInfo.sourceBranch(manifest),
    )
  }

  @Test
  fun readsExplicitSourceBranchFromExpoClientConfig() {
    val manifest = """
      {
        "metadata":{"branchName":"fe-release-1-4-6-debug"},
        "extra":{"expoClient":{"extra":{"sourceBranch":"release/1.4.6"}}}
      }
    """.trimIndent()

    assertEquals(
      "release/1.4.6",
      MobileDiagnosticsUpdateInfo.sourceBranch(manifest),
    )
  }

  @Test
  fun ignoresMalformedOrMissingManifestData() {
    assertNull(MobileDiagnosticsUpdateInfo.sourceBranch(null))
    assertNull(MobileDiagnosticsUpdateInfo.sourceBranch("not-json"))
    assertNull(MobileDiagnosticsUpdateInfo.sourceBranch("{}"))
  }
}

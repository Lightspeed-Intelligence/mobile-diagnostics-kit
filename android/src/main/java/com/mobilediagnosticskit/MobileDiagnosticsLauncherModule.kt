package com.mobilediagnosticskit

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

internal class MobileDiagnosticsLauncherModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "MobileDiagnosticsLauncher"

  @ReactMethod
  fun showToolPanel() = MobileDiagnosticsDoKit.showToolPanel()

  @ReactMethod
  fun restoreMainIcon() = Unit

  @ReactMethod
  fun returnToToolPanel() = MobileDiagnosticsDoKit.requestToolPanelRestore()
}

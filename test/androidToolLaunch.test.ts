import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

describe('Android DoKit tool launch contract', () => {
  it('lets DoKit dismiss its panel once before opening React Native tools', () => {
    const {
      renderMobileDiagnosticsDoKitSource,
      renderMobileDiagnosticsLauncherSource,
    } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')
    const destinationKit = source.slice(
      source.indexOf('internal object MobileDiagnosticsDoKit'),
      source.length
    )
    const launcher = renderMobileDiagnosticsLauncherSource('com.example.app')

    expect(destinationKit).not.toContain('DoKit.hideToolPanel()')
    expect(destinationKit).toContain(
      'MobileDiagnosticsLauncher.openAfterPanelDismiss(activity, destination)'
    )
    expect(launcher).toContain('activity.window.decorView.post')
    expect(launcher).toContain('.emit(OPEN_EVENT, payload)')
    expect(launcher).not.toContain('DoKit.hideToolPanel()')
  })

  it('hides the system launcher while an RN tool owns the screen and restores one on close', () => {
    const {
      renderMobileDiagnosticsDoKitSource,
      renderMobileDiagnosticsLauncherSource,
      renderMobileDiagnosticsNetworkPackageSource,
    } = require('../plugin/withDoKit.js')

    const doKit = renderMobileDiagnosticsDoKitSource('com.example.app')
    const launcher = renderMobileDiagnosticsLauncherSource('com.example.app')
    const reactPackage =
      renderMobileDiagnosticsNetworkPackageSource('com.example.app')

    expect(launcher).toContain(
      'MobileDiagnosticsDoKit.hideLauncherForInspector()'
    )
    expect(launcher.indexOf('hideLauncherForInspector()')).toBeLessThan(
      launcher.indexOf('.emit(OPEN_EVENT, payload)')
    )
    expect(launcher).toContain('@ReactMethod')
    expect(launcher).toContain('fun restoreMainIcon()')
    expect(launcher).toContain('reactApplicationContext.runOnUiQueueThread')
    expect(launcher).toContain(
      'MobileDiagnosticsDoKit.restoreLauncherAfterInspector()'
    )
    expect(reactPackage).toContain('MobileDiagnosticsLauncherModule(reactContext)')
    expect(doKit).toContain('MobileDiagnosticsMainIconDoKitView::class.java')
    expect(doKit).toContain('DoKit.removeFloating')
    expect(doKit).toContain('DoKit.launchFloating')
  })

  it('uses a bounded custom system launcher so off-icon taps reach the app', () => {
    const {
      renderMobileDiagnosticsDoKitSource,
      addDoKitToMainApplication,
    } = require('../plugin/withDoKit.js')

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')
    const application = addDoKitToMainApplication(`package com.example.app

import android.app.Application
import com.facebook.react.PackageList

class MainApplication : Application() {
  fun packages() {
    PackageList(this).packages.apply {
    }
  }

  override fun onCreate() {
    super.onCreate()
  }
}`)

    expect(application).toContain('DoKitManager.ALWAYS_SHOW_MAIN_ICON = false')
    expect(application).toContain('DoKitManager.IS_NORMAL_FLOAT_MODE = true')
    expect(source).toContain('class MobileDiagnosticsMainIconDoKitView')
    expect(source).toContain('params.width = launcherSize')
    expect(source).toContain('params.height = launcherSize')
    expect(source).toContain('doKitView?.setOnClickListener')
    expect(source).toContain('DoKit.APPLICATION.resources.displayMetrics.density')
    expect(source).not.toContain('view.setOnClickListener')
    expect(source).not.toContain('DoKitViewLayoutParams.MATCH_PARENT')
    expect(source).not.toContain('DoKit.show()')
    expect(source).not.toContain('DoKit.isMainIconShow')
  })

  it('generates an app-owned vector icon for Expo Update', () => {
    const {
      renderMobileDiagnosticsDoKitSource,
      renderMobileDiagnosticsExpoUpdateIcon,
    } = require('../plugin/withDoKit.js')

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')
    const icon = renderMobileDiagnosticsExpoUpdateIcon()

    expect(source).toContain(
      '"ota" -> R.drawable.mobile_diagnostics_expo_update'
    )
    expect(icon).toContain('<vector')
    expect(icon).toContain('android:pathData=')
  })
})

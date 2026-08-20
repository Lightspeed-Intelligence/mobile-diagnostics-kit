import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const APP_BUILD_GRADLE = `
plugins {}

dependencies {
    implementation("com.facebook.react:react-android")
}
`

const MAIN_APPLICATION = `
package com.example.app

import android.app.Application
import com.facebook.react.ReactApplication

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
  }
}
`

const PREVIOUSLY_GENERATED_MAIN_APPLICATION = `
package com.example.app

import android.app.Application
import com.didichuxing.doraemonkit.DoKit
import com.didichuxing.doraemonkit.aop.DokitPluginConfig
import com.didichuxing.doraemonkit.kit.network.okhttp.interceptor.DokitCapInterceptor
import com.facebook.react.ReactApplication
import com.facebook.react.modules.network.OkHttpClientProvider

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    DokitPluginConfig.SWITCH_DOKIT_PLUGIN = true
    DokitPluginConfig.SWITCH_NETWORK = true
    DoKit.Builder(this)
      .customKits(MobileDiagnosticsDoKit.kits())
      .disableUpload()
      .build()
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(this)
        .addInterceptor(DokitCapInterceptor())
        .build()
    }
  }
}
`

describe('DoKit Expo config plugin', () => {
  it('exports the conventional Expo plugin entry when package exports are enabled', () => {
    const packageJson = require('../package.json')

    expect(packageJson.exports['./app.plugin.js']).toBe('./app.plugin.js')
    expect(require('../app.plugin.js')).toBeTypeOf('function')
  })

  it('adds DoKit, React Native network capture, and release keep rules once', () => {
    const {
      addDoKitDependencies,
      addDoKitProguardRules,
      addDoKitToMainApplication,
    } = require('../plugin/withDoKit.js')

    const buildGradle = addDoKitDependencies(
      addDoKitDependencies(APP_BUILD_GRADLE)
    )
    const application = addDoKitToMainApplication(
      addDoKitToMainApplication(MAIN_APPLICATION)
    )
    const proguard = addDoKitProguardRules(
      addDoKitProguardRules('# host rules\n')
    )
    const upgradedProguard = addDoKitProguardRules(
      '# mobile-diagnostics-kit: DoKit runtime\n' +
        '-keep class com.didichuxing.doraemonkit.** { *; }\n'
    )

    expect(buildGradle.match(/dokitx:3\.7\.11/g)).toHaveLength(1)
    expect(buildGradle.match(/dokitx-okhttp-v4:3\.7\.11/g)).toHaveLength(1)
    expect(application.match(/disableUpload\(\)/g)).toHaveLength(1)
    expect(application.match(/DokitCapInterceptor/g)).toHaveLength(2)
    expect(application.match(/SWITCH_DOKIT_PLUGIN = true/g)).toHaveLength(1)
    expect(application.match(/SWITCH_NETWORK = true/g)).toHaveLength(1)
    expect(application.match(/NetworkManager\.get\(\)\.startMonitor\(\)/g)).toHaveLength(1)
    expect(application).toContain('MobileDiagnosticsDoKit.scheduleNetworkKitCleanup()')
    expect(
      application.match(/MobileDiagnosticsDoKit\.installLifecycleRestore\(this\)/g)
    ).toHaveLength(1)
    expect(application.match(/customKits\(MobileDiagnosticsDoKit\.kits\(\)\)/g)).toHaveLength(1)
    expect(proguard.match(/com\.didichuxing\.doraemonkit/g)).toHaveLength(1)
    expect(proguard.match(/-dontwarn coil\.\*\*/g)).toHaveLength(1)
    expect(
      proguard.match(/-dontwarn com\.nostra13\.universalimageloader\.\*\*/g)
    ).toHaveLength(1)
    expect(proguard.match(/-dontwarn com\.squareup\.picasso\.\*\*/g)).toHaveLength(1)
    expect(proguard.match(/-dontwarn com\.tencent\.smtt\.\*\*/g)).toHaveLength(1)
    expect(upgradedProguard).toContain('-dontwarn coil.**')
  })

  it('upgrades an existing generated application to start network capture', () => {
    const { addDoKitToMainApplication } = require('../plugin/withDoKit.js')

    const application = addDoKitToMainApplication(
      PREVIOUSLY_GENERATED_MAIN_APPLICATION
    )

    expect(application).toContain(
      'import com.didichuxing.doraemonkit.kit.network.NetworkManager'
    )
    expect(application.match(/NetworkManager\.get\(\)\.startMonitor\(\)/g)).toHaveLength(1)
    expect(application.match(/scheduleNetworkKitCleanup\(\)/g)).toHaveLength(1)
    expect(application.match(/installLifecycleRestore\(this\)/g)).toHaveLength(1)
  })

  it('generates host-neutral DoKit kits that open the RN diagnostics destinations', () => {
    const {
      renderMobileDiagnosticsDoKitSource,
      renderMobileDiagnosticsLauncherSource,
    } = require('../plugin/withDoKit.js')

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')
    const launcherSource = renderMobileDiagnosticsLauncherSource('com.example.app')

    expect(source).toContain('class DestinationKit')
    expect(source).toContain('AbstractKit()')
    expect(source).toContain('override val name: Int')
    expect(source).toContain('override val icon: Int')
    expect(source).toContain('override fun onAppInit(context: Context?)')
    expect(source).not.toContain('override fun getName()')
    expect(source).not.toContain('override fun getIcon()')
    expect(launcherSource).toContain('mobile-diagnostics-kit.open')
    expect(source).toContain('"storage"')
    expect(source).toContain('"ota"')
    expect(source).toContain('"network"')
    expect(launcherSource).toContain('RCTDeviceEventEmitter')
    expect(launcherSource).toContain('reactApplication?.reactHost?.currentReactContext')
    expect(launcherSource).toContain('reactApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext')
    expect(source).not.toContain('Tipsy')
    expect(launcherSource).not.toContain('Tipsy')
  })

  it('generates an Android network kit with its own modern inspector', () => {
    const { renderMobileDiagnosticsDoKitSource, renderMobileDiagnosticsResources } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')

    expect(source).toContain('MobileDiagnosticsNetworkFragment')
    expect(source).toContain('NetworkManager.get().records')
    expect(source).toContain('dokit_sdk_performance_ck_network')
    expect(source.match(/GLOBAL_KITS\.values\.forEach/g)).toHaveLength(1)
    expect(source.match(/GLOBAL_SYSTEM_KITS\.values\.forEach/g)).toHaveLength(1)
    expect(source).not.toContain('GLOBAL_KITS.values.any')
    expect(source).toContain('MDKNetworkFilter')
    expect(source).toContain('curlCommand')
    expect(source).toContain('WindowInsetsCompat.Type.systemBars()')
    expect(source).toContain('LinearLayout.LayoutParams(dp(44), dp(44))')
    expect(source).toContain('override fun onBackPressed(): Boolean')
    expect(source).toContain('finish()')
    expect(source).not.toContain('NetWorkMonitorFragment')
    expect(source).not.toContain('Tipsy')
    expect(renderMobileDiagnosticsResources()).toContain(
      'name="mobile_diagnostics_network">Network'
    )
  })

  it('keeps the Android network inspector aligned with the iOS information hierarchy', () => {
    const { renderMobileDiagnosticsDoKitSource } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')

    expect(source).toContain('private fun summaryCard(')
    expect(source).toContain('"Requests"')
    expect(source).toContain('"Received"')
    expect(source).toContain('"Capture"')
    expect(source).toContain('addTextChangedListener')
    expect(source).toContain('Search host, path, method, or status')
    expect(source).toContain('private fun requestHost(')
    expect(source).toContain('private fun requestPath(')
    expect(source).toContain('private fun requestMetadata(')
    expect(source).toContain('private enum class MDKNetworkDetailTab')
    expect(source).toContain('"Request"')
    expect(source).toContain('"Response"')
    expect(source).toContain('private fun bodySection(')
    expect(source).toContain('private fun iconButton(')
    expect(source).toContain('private fun isDarkTheme(')
    expect(source).toContain('androidx.appcompat.R.drawable.abc_ic_ab_back_material')
    expect(source).toContain('androidx.appcompat.R.drawable.abc_ic_menu_copy_mtrl_am_alpha')
    expect(source).toContain('setCompoundDrawablesWithIntrinsicBounds(android.R.drawable.ic_menu_search')
    expect(source).toContain('trackTintList = captureTrackColors()')
  })

  it('restores the single DoKit entry across activity and inspector lifecycles', () => {
    const { renderMobileDiagnosticsDoKitSource } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')

    expect(source).toContain('fun installLifecycleRestore(application: Application)')
    expect(source).toContain('application.registerActivityLifecycleCallbacks')
    expect(source).toContain('override fun onActivityResumed(activity: Activity)')
    expect(source).toContain('DoKit.show()')
    expect(source).toContain('override fun onDestroyView()')
    expect(source).toContain('private fun closeInspector()')
    expect(source).toContain('header("Network", false) { closeInspector() }')
  })

  it('throttles network updates and pages the filtered record set without losing totals', () => {
    const { renderMobileDiagnosticsDoKitSource } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')

    expect(source).toContain('private const val NETWORK_PAGE_SIZE = 100')
    expect(source).toContain('private const val NETWORK_REFRESH_INTERVAL_MS = 500L')
    expect(source).toContain('AtomicBoolean(false)')
    expect(source).toContain('mainHandler.postDelayed(listRefreshRunnable, NETWORK_REFRESH_INTERVAL_MS)')
    expect(source).not.toContain(
      'mainHandler.post {\n        if (isAdded && selected == null) renderList()'
    )
    expect(source).toContain('val page = visible.take(visibleLimit)')
    expect(source).toContain('showingLabel?.text = "Showing ${page.size} of ${visible.size} matching"')
    expect(source).toContain('requestCountLabel?.text = records.size.toString()')
    expect(source).toContain('text("Load older"')
    expect(source).toContain('visibleLimit += NETWORK_PAGE_SIZE')
    expect(source).toContain('page.forEach { record -> content.addView(requestCard(record)) }')
  })

  it('fails clearly when generated Android files have an unsupported shape', () => {
    const { addDoKitDependencies, addDoKitToMainApplication } = require(
      '../plugin/withDoKit.js'
    )

    expect(() => addDoKitDependencies('plugins {}')).toThrow(
      'dependencies block'
    )
    expect(() => addDoKitToMainApplication('class MainApplication')).toThrow(
      'imports not found'
    )
  })
})

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
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactPackage

class MainApplication : Application(), ReactApplication {
  fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
    }

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
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactPackage
import com.facebook.react.modules.network.OkHttpClientProvider

class MainApplication : Application(), ReactApplication {
  fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
    }

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
    expect(
      application.match(/DoKitManager\.IS_NORMAL_FLOAT_MODE = false/g)
    ).toHaveLength(1)
    expect(
      application.indexOf('DoKitManager.IS_NORMAL_FLOAT_MODE = false')
    ).toBeGreaterThan(application.indexOf('.build()'))
    expect(
      application.indexOf('DoKitManager.IS_NORMAL_FLOAT_MODE = false')
    ).toBeLessThan(
      application.indexOf('MobileDiagnosticsDoKit.installLifecycleRestore(this)')
    )
    expect(application.match(/NetworkManager\.get\(\)\.startMonitor\(\)/g)).toHaveLength(1)
    expect(application).toContain('MobileDiagnosticsDoKit.scheduleNetworkKitCleanup()')
    expect(
      application.match(/MobileDiagnosticsDoKit\.installLifecycleRestore\(this\)/g)
    ).toHaveLength(1)
    expect(application.match(/customKits\(MobileDiagnosticsDoKit\.kits\(\)\)/g)).toHaveLength(1)
    expect(
      application.match(/add\(MobileDiagnosticsNetworkPackage\(\)\)/g)
    ).toHaveLength(1)
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
    expect(application).toContain('DoKitManager.IS_NORMAL_FLOAT_MODE = false')
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

  it('routes the Android Network kit to the shared React Native inspector', () => {
    const { renderMobileDiagnosticsDoKitSource, renderMobileDiagnosticsResources } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')

    expect(source).toContain('DestinationKit("network")')
    expect(source).toContain(
      'MobileDiagnosticsLauncher.openAfterPanelDismiss(activity, destination)'
    )
    expect(source).toContain('dokit_sdk_performance_ck_network')
    expect(source.match(/GLOBAL_KITS\.values\.forEach/g)).toHaveLength(1)
    expect(source.match(/GLOBAL_SYSTEM_KITS\.values\.forEach/g)).toHaveLength(1)
    expect(source).not.toContain('MobileDiagnosticsNetworkFragment')
    expect(source).not.toContain('BaseFragment')
    expect(source).not.toContain('NetWorkMonitorFragment')
    expect(source).not.toContain('Tipsy')
    expect(renderMobileDiagnosticsResources()).toContain(
      'name="mobile_diagnostics_network">Network'
    )
  })

  it('restores the single DoKit entry across activity and inspector lifecycles', () => {
    const { renderMobileDiagnosticsDoKitSource } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')

    expect(source).toContain('fun installLifecycleRestore(application: Application)')
    expect(source).toContain('application.registerActivityLifecycleCallbacks')
    expect(source).toContain('override fun onActivityResumed(activity: Activity)')
    expect(source).toContain('DoKitManager.MAIN_ICON_HAS_SHOW = false')
    expect(source).toContain('DoKit.launchFloating(MobileDiagnosticsMainIconDoKitView::class.java)')
    expect(source).not.toContain('DoKit.show()')
    expect(source).toContain('DestinationKit("network")')
  })

  it('generates an opt-in Android bridge for exact DoKit captures', () => {
    const {
      renderMobileDiagnosticsNetworkModuleSource,
      renderMobileDiagnosticsNetworkPackageSource,
    } = require('../plugin/withDoKit.js')
    const source = renderMobileDiagnosticsNetworkModuleSource('com.example.app')
    const reactPackage =
      renderMobileDiagnosticsNetworkPackageSource('com.example.app')
    const nativeConfig = require('../react-native.config.js')

    expect(source).toContain('NetworkManager.get().records')
    expect(source).toContain('putArray("requestHeaders"')
    expect(source).toContain('putString("requestBody"')
    expect(source).toContain('putString("responseBody"')
    expect(source).not.toContain('redact')
    expect(reactPackage).toContain('MobileDiagnosticsNetworkModule')
    expect(nativeConfig.dependency.platforms).toEqual({
      android: null,
      ios: null,
    })
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

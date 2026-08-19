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

    expect(buildGradle.match(/dokitx:3\.7\.11/g)).toHaveLength(1)
    expect(buildGradle.match(/dokitx-okhttp-v4:3\.7\.11/g)).toHaveLength(1)
    expect(application.match(/disableUpload\(\)/g)).toHaveLength(1)
    expect(application.match(/DokitCapInterceptor/g)).toHaveLength(2)
    expect(application.match(/SWITCH_DOKIT_PLUGIN = true/g)).toHaveLength(1)
    expect(application.match(/SWITCH_NETWORK = true/g)).toHaveLength(1)
    expect(application.match(/customKits\(MobileDiagnosticsDoKit\.kits\(\)\)/g)).toHaveLength(1)
    expect(proguard.match(/com\.didichuxing\.doraemonkit/g)).toHaveLength(1)
  })

  it('generates host-neutral DoKit kits that open the RN diagnostics destinations', () => {
    const { renderMobileDiagnosticsDoKitSource } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')

    expect(source).toContain('class DestinationKit')
    expect(source).toContain('AbstractKit()')
    expect(source).toContain('override val name: Int')
    expect(source).toContain('override val icon: Int')
    expect(source).toContain('override fun onAppInit(context: Context?)')
    expect(source).not.toContain('override fun getName()')
    expect(source).not.toContain('override fun getIcon()')
    expect(source).toContain('mobile-diagnostics-kit.open')
    expect(source).toContain('"storage"')
    expect(source).toContain('"ota"')
    expect(source).toContain('RCTDeviceEventEmitter')
    expect(source).toContain('reactApplication?.reactHost?.currentReactContext')
    expect(source).toContain('reactApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext')
    expect(source).not.toContain('Tipsy')
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

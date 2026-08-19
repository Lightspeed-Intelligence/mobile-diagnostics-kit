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
    expect(proguard.match(/com\.didichuxing\.doraemonkit/g)).toHaveLength(1)
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

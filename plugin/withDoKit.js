const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins')
const fs = require('node:fs')
const path = require('node:path')

const DOKIT_VERSION = '3.7.11'
const DOKIT_DEPENDENCIES = [
  `io.github.didi.dokit:dokitx:${DOKIT_VERSION}`,
  `io.github.didi.dokit:dokitx-okhttp-v4:${DOKIT_VERSION}`,
  // DoKit references Volley 1.1.1, which is absent from modern repositories.
  'com.android.volley:volley:1.2.1',
]
const DOKIT_IMPORTS = [
  'import com.didichuxing.doraemonkit.DoKit',
  'import com.didichuxing.doraemonkit.kit.network.okhttp.interceptor.DokitCapInterceptor',
  'import com.facebook.react.modules.network.OkHttpClientProvider',
]
const DOKIT_INIT_MARKER = 'customKits(MobileDiagnosticsDoKit.kits())'
const LEGACY_DOKIT_INIT = 'DoKit.Builder(this).disableUpload().build()'
const GENERATED_SOURCE_NAME = 'MobileDiagnosticsDoKit.kt'
const GENERATED_RESOURCES_NAME = 'mobile_diagnostics_kit.xml'
const PROGUARD_MARKER = '# mobile-diagnostics-kit: DoKit runtime'
const PROGUARD_RULE = '-keep class com.didichuxing.doraemonkit.** { *; }'

function addDoKitDependencies(contents) {
  const missing = DOKIT_DEPENDENCIES.filter(
    (dependency) =>
      !contents.includes(`implementation("${dependency}")`) &&
      !contents.includes(`implementation '${dependency}'`)
  )
  if (missing.length === 0) return contents

  const match = contents.match(/dependencies\s*{\r?\n/)
  if (!match) {
    throw new Error('withDoKit: app build.gradle dependencies block not found')
  }

  const insertAt = match.index + match[0].length
  const dependencyLines = missing
    .map((dependency) => `    implementation("${dependency}")\n`)
    .join('')
  return contents.slice(0, insertAt) + dependencyLines + contents.slice(insertAt)
}

function addImport(contents, importLine) {
  if (contents.includes(importLine)) return contents
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const lines = contents.split(/\r?\n/)
  const lastImportIndex = lines.reduce(
    (lastIndex, line, index) =>
      line.startsWith('import ') ? index : lastIndex,
    -1
  )
  if (lastImportIndex < 0) {
    throw new Error('withDoKit: MainApplication imports not found')
  }
  lines.splice(lastImportIndex + 1, 0, importLine)
  return lines.join(eol)
}

function addDoKitToMainApplication(contents) {
  if (contents.includes(DOKIT_INIT_MARKER)) return contents

  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const next = DOKIT_IMPORTS.reduce(addImport, contents)
  if (next.includes(LEGACY_DOKIT_INIT)) {
    const legacyLine = new RegExp(
      `^(\\s*)${LEGACY_DOKIT_INIT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'm'
    )
    return next.replace(legacyLine, (_line, indent) =>
      renderDoKitInitialization(indent, eol)
    )
  }
  const marker = /^(\s*)super\.onCreate\(\)\s*$/m
  const match = next.match(marker)
  if (!match) {
    throw new Error(
      'withDoKit: MainApplication.onCreate super.onCreate() call not found'
    )
  }

  const indent = match[1]
  const block = [
    `${indent}// On-device diagnostics. DoKit telemetry is disabled.`,
    renderDoKitInitialization(indent, eol),
    `${indent}OkHttpClientProvider.setOkHttpClientFactory {`,
    `${indent}  OkHttpClientProvider.createClientBuilder(this)`,
    `${indent}    .addInterceptor(DokitCapInterceptor())`,
    `${indent}    .build()`,
    `${indent}}`,
  ].join(eol)
  return next.replace(marker, `$&${eol}${block}`)
}

function renderDoKitInitialization(indent, eol) {
  return [
    `${indent}DoKit.Builder(this)`,
    `${indent}  .customKits(MobileDiagnosticsDoKit.kits())`,
    `${indent}  .disableUpload()`,
    `${indent}  .build()`,
  ].join(eol)
}

function renderMobileDiagnosticsDoKitSource(packageName) {
  return `package ${packageName}

import android.app.Activity
import android.content.Context
import android.widget.Toast
import com.didichuxing.doraemonkit.DoKit
import com.didichuxing.doraemonkit.kit.AbstractKit
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.LinkedHashMap

internal object MobileDiagnosticsDoKit {
  private const val OPEN_EVENT = "mobile-diagnostics-kit.open"

  fun kits(): LinkedHashMap<String, List<AbstractKit>> = linkedMapOf(
    "Application Tools" to listOf(
      DestinationKit("storage"),
      DestinationKit("ota"),
    ),
  )

  private class DestinationKit(
    private val destination: String,
  ) : AbstractKit() {
    override val name: Int
      get() = when (destination) {
      "ota" -> R.string.mobile_diagnostics_expo_update
      else -> R.string.mobile_diagnostics_local_state
    }

    override val icon: Int
      get() = when (destination) {
      "ota" -> android.R.drawable.ic_popup_sync
      else -> android.R.drawable.ic_menu_edit
    }

    override fun onAppInit(context: Context?) = Unit

    override fun onClickWithReturn(activity: Activity): Boolean {
      val reactApplication = activity.application as? ReactApplication
      val reactContext = reactApplication
        ?.reactNativeHost
        ?.reactInstanceManager
        ?.currentReactContext
      if (reactContext == null) {
        Toast.makeText(
          activity,
          R.string.mobile_diagnostics_runtime_unavailable,
          Toast.LENGTH_SHORT,
        ).show()
        return false
      }

      val payload = Arguments.createMap().apply {
        putString("destination", destination)
      }
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(OPEN_EVENT, payload)
      DoKit.hideToolPanel()
      return true
    }
  }
}
`
}

function renderMobileDiagnosticsResources() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="mobile_diagnostics_local_state">Local State</string>
  <string name="mobile_diagnostics_expo_update">Expo Update</string>
  <string name="mobile_diagnostics_runtime_unavailable">Diagnostics runtime is not ready</string>
</resources>
`
}

function readPackageName(mainApplicationContents) {
  const match = mainApplicationContents.match(/^package\s+([A-Za-z0-9_.]+)\s*$/m)
  if (!match) {
    throw new Error('withDoKit: MainApplication package declaration not found')
  }
  return match[1]
}

function addDoKitProguardRules(contents) {
  if (contents.includes(PROGUARD_RULE)) return contents
  const separator = contents.endsWith('\n') || contents.length === 0 ? '' : '\n'
  return `${contents}${separator}${PROGUARD_MARKER}\n${PROGUARD_RULE}\n`
}

function findMainApplicationFile(javaRoot) {
  if (!fs.existsSync(javaRoot)) return null
  const directories = [javaRoot]
  while (directories.length > 0) {
    const current = directories.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) directories.push(fullPath)
      else if (entry.name === 'MainApplication.kt') return fullPath
    }
  }
  return null
}

function writeTransformedFile(file, transform) {
  const contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const next = transform(contents)
  if (next !== contents) fs.writeFileSync(file, next)
}

function withDoKit(config) {
  const withDependencies = withAppBuildGradle(config, (nextConfig) => {
    const buildGradle = nextConfig.modResults
    if (buildGradle.language !== 'groovy') {
      throw new Error('withDoKit: only Groovy app build.gradle is supported')
    }
    buildGradle.contents = addDoKitDependencies(buildGradle.contents)
    return nextConfig
  })

  return withDangerousMod(withDependencies, [
    'android',
    async (nextConfig) => {
      const projectRoot = nextConfig.modRequest.platformProjectRoot
      const mainApplication = findMainApplicationFile(
        path.join(projectRoot, 'app', 'src', 'main', 'java')
      )
      if (!mainApplication) {
        throw new Error('withDoKit: generated MainApplication.kt not found')
      }
      const mainApplicationContents = fs.readFileSync(mainApplication, 'utf8')
      const packageName = readPackageName(mainApplicationContents)
      writeTransformedFile(mainApplication, addDoKitToMainApplication)
      writeTransformedFile(
        path.join(path.dirname(mainApplication), GENERATED_SOURCE_NAME),
        () => renderMobileDiagnosticsDoKitSource(packageName)
      )
      writeTransformedFile(
        path.join(
          projectRoot,
          'app',
          'src',
          'main',
          'res',
          'values',
          GENERATED_RESOURCES_NAME
        ),
        renderMobileDiagnosticsResources
      )
      writeTransformedFile(
        path.join(projectRoot, 'app', 'proguard-rules.pro'),
        addDoKitProguardRules
      )
      return nextConfig
    },
  ])
}

module.exports = withDoKit
module.exports.addDoKitDependencies = addDoKitDependencies
module.exports.addDoKitProguardRules = addDoKitProguardRules
module.exports.addDoKitToMainApplication = addDoKitToMainApplication
module.exports.renderMobileDiagnosticsDoKitSource =
  renderMobileDiagnosticsDoKitSource
module.exports.renderMobileDiagnosticsResources = renderMobileDiagnosticsResources

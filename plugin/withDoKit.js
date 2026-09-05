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
  'import com.didichuxing.doraemonkit.aop.DokitPluginConfig',
  'import com.didichuxing.doraemonkit.kit.core.DoKitManager',
  'import com.didichuxing.doraemonkit.kit.network.NetworkManager',
  'import com.didichuxing.doraemonkit.kit.network.okhttp.interceptor.DokitCapInterceptor',
  'import com.mobilediagnosticskit.MobileDiagnosticsImageInterceptor',
  'import com.facebook.react.modules.network.OkHttpClientProvider',
]
const DOKIT_INIT_MARKER = 'customKits(MobileDiagnosticsDoKit.kits(this))'
const LEGACY_DOKIT_INIT_MARKER =
  'customKits(MobileDiagnosticsDoKit.kits())'
const LEGACY_DOKIT_INIT = 'DoKit.Builder(this).disableUpload().build()'
const NETWORK_MONITOR_START = 'NetworkManager.get().startMonitor()'
const BUILT_IN_KIT_CLEANUP =
  'MobileDiagnosticsDoKit.scheduleUnsupportedBuiltInKitCleanup()'
const LEGACY_NETWORK_KIT_CLEANUP =
  'MobileDiagnosticsDoKit.scheduleNetworkKitCleanup()'
const DOKIT_NORMAL_FLOAT_MODE = 'DoKitManager.IS_NORMAL_FLOAT_MODE = true'
const LEGACY_DOKIT_SYSTEM_FLOAT_MODE =
  'DoKitManager.IS_NORMAL_FLOAT_MODE = false'
const DOKIT_NORMAL_FLOAT_PREFERENCE =
  '.putString("float_start_mode", "normal")'
const LIFECYCLE_RESTORE_INSTALL =
  'MobileDiagnosticsDoKit.installLifecycleRestore(this)'
const GENERATED_SOURCE_NAME = 'MobileDiagnosticsDoKit.kt'
const GENERATED_LAUNCHER_SOURCE_NAME = 'MobileDiagnosticsLauncher.kt'
const GENERATED_NETWORK_MODULE_SOURCE_NAME =
  'MobileDiagnosticsNetworkModule.kt'
const GENERATED_NETWORK_PACKAGE_SOURCE_NAME =
  'MobileDiagnosticsNetworkPackage.kt'
const GENERATED_RESOURCES_NAME = 'mobile_diagnostics_kit.xml'
const GENERATED_EXPO_UPDATE_ICON_NAME = 'mobile_diagnostics_expo_update.xml'
const GENERATED_ANDROID_TEMPLATE = path.join(
  __dirname,
  'android',
  'MobileDiagnosticsDoKit.kt.template'
)
const GENERATED_LAUNCHER_TEMPLATE = path.join(
  __dirname,
  'android',
  'MobileDiagnosticsLauncher.kt.template'
)
const GENERATED_NETWORK_MODULE_TEMPLATE = path.join(
  __dirname,
  'android',
  'MobileDiagnosticsNetworkModule.kt.template'
)
const GENERATED_NETWORK_PACKAGE_TEMPLATE = path.join(
  __dirname,
  'android',
  'MobileDiagnosticsNetworkPackage.kt.template'
)
const PROGUARD_MARKER = '# mobile-diagnostics-kit: DoKit runtime'
const PROGUARD_RULES = [
  '-keep class com.didichuxing.doraemonkit.** { *; }',
  '-dontwarn coil.**',
  '-dontwarn com.nostra13.universalimageloader.**',
  '-dontwarn com.squareup.picasso.**',
  '-dontwarn com.tencent.smtt.**',
]

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
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const next = addImageInterceptor(
    DOKIT_IMPORTS.reduce(addImport, contents)
      .replaceAll(LEGACY_NETWORK_KIT_CLEANUP, BUILT_IN_KIT_CLEANUP)
      .replaceAll(LEGACY_DOKIT_INIT_MARKER, DOKIT_INIT_MARKER),
    eol
  )
  if (next.includes(DOKIT_INIT_MARKER)) {
    return addMobileDiagnosticsNetworkPackage(
      addNetworkMonitorStart(addNormalFloatMode(next, eol), eol),
      eol
    )
  }
  if (next.includes(LEGACY_DOKIT_INIT)) {
    const legacyLine = new RegExp(
      `^(\\s*)${LEGACY_DOKIT_INIT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'm'
    )
    return addMobileDiagnosticsNetworkPackage(
      next.replace(legacyLine, (_line, indent) =>
        renderDoKitInitialization(indent, eol)
      ),
      eol
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
    `${indent}DokitPluginConfig.SWITCH_DOKIT_PLUGIN = true`,
    `${indent}DokitPluginConfig.SWITCH_NETWORK = true`,
    renderDoKitInitialization(indent, eol),
    `${indent}OkHttpClientProvider.setOkHttpClientFactory {`,
    `${indent}  OkHttpClientProvider.createClientBuilder(this)`,
    `${indent}    .addInterceptor(MobileDiagnosticsImageInterceptor())`,
    `${indent}    .addInterceptor(DokitCapInterceptor())`,
    `${indent}    .build()`,
    `${indent}}`,
  ].join(eol)
  return addMobileDiagnosticsNetworkPackage(
    next.replace(marker, `$&${eol}${block}`),
    eol
  )
}

function addImageInterceptor(contents, eol) {
  const imageInterceptor =
    '.addInterceptor(MobileDiagnosticsImageInterceptor())'
  if (contents.includes(imageInterceptor)) return contents

  const doKitInterceptor = '.addInterceptor(DokitCapInterceptor())'
  const doKitIndex = contents.indexOf(doKitInterceptor)
  if (doKitIndex < 0) return contents

  const lineStart = contents.lastIndexOf(eol, doKitIndex) + eol.length
  const indent = contents.slice(lineStart, doKitIndex)
  return `${contents.slice(0, lineStart)}${indent}${imageInterceptor}${eol}${contents.slice(lineStart)}`
}

function addMobileDiagnosticsNetworkPackage(contents, eol) {
  const registration = 'add(MobileDiagnosticsNetworkPackage())'
  if (contents.includes(registration)) return contents

  const marker = /^(\s*)PackageList\(this\)\.packages\.apply\s*\{\s*$/m
  const match = contents.match(marker)
  if (!match || match.index === undefined) {
    throw new Error(
      'withDoKit: MainApplication PackageList(this).packages.apply block not found'
    )
  }
  const insertAt = match.index + match[0].length
  return `${contents.slice(0, insertAt)}${eol}${match[1]}  ${registration}${contents.slice(insertAt)}`
}

function renderDoKitInitialization(indent, eol) {
  return [
    `${indent}getSharedPreferences(`,
    `${indent}  "shared_prefs_doraemon",`,
    `${indent}  android.content.Context.MODE_PRIVATE,`,
    `${indent})`,
    `${indent}  .edit()`,
    `${indent}  ${DOKIT_NORMAL_FLOAT_PREFERENCE}`,
    `${indent}  .commit()`,
    `${indent}${DOKIT_NORMAL_FLOAT_MODE}`,
    `${indent}DoKit.Builder(this)`,
    `${indent}  .customKits(MobileDiagnosticsDoKit.kits(this))`,
    `${indent}  .disableUpload()`,
    `${indent}  .build()`,
    `${indent}DoKitManager.ALWAYS_SHOW_MAIN_ICON = false`,
    `${indent}${LIFECYCLE_RESTORE_INSTALL}`,
    `${indent}${BUILT_IN_KIT_CLEANUP}`,
    `${indent}// DoKit's storage permission gate is obsolete on Android 13+.`,
    `${indent}${NETWORK_MONITOR_START}`,
  ].join(eol)
}

function addNormalFloatMode(contents, eol) {
  const legacyModeLine = new RegExp(
    `^[\\t ]*${LEGACY_DOKIT_SYSTEM_FLOAT_MODE.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )}\\r?\\n?`,
    'gm'
  )
  const next = contents.replace(legacyModeLine, '')
  const needsPreference = !next.includes(DOKIT_NORMAL_FLOAT_PREFERENCE)
  const needsMode = !next.includes(DOKIT_NORMAL_FLOAT_MODE)
  if (!needsPreference && !needsMode) return next

  const markerIndex = next.indexOf(DOKIT_INIT_MARKER)
  const builderIndex = next.lastIndexOf('DoKit.Builder(this)', markerIndex)
  if (builderIndex < 0) {
    throw new Error('withDoKit: existing DoKit initialization is unsupported')
  }
  const builderLineStart = next.lastIndexOf(eol, builderIndex) + eol.length
  const indent = next.slice(builderLineStart, builderIndex)
  const lines = []
  if (needsPreference) {
    lines.push(
      `${indent}getSharedPreferences(`,
      `${indent}  "shared_prefs_doraemon",`,
      `${indent}  android.content.Context.MODE_PRIVATE,`,
      `${indent})`,
      `${indent}  .edit()`,
      `${indent}  ${DOKIT_NORMAL_FLOAT_PREFERENCE}`,
      `${indent}  .commit()`
    )
  }
  if (needsMode) lines.push(`${indent}${DOKIT_NORMAL_FLOAT_MODE}`)
  return `${next.slice(0, builderLineStart)}${lines.join(eol)}${eol}${next.slice(builderLineStart)}`
}

function addNetworkMonitorStart(contents, eol) {
  const needsNetworkStart = !contents.includes(NETWORK_MONITOR_START)
  const needsBuiltInKitCleanup = !contents.includes(BUILT_IN_KIT_CLEANUP)
  const needsLifecycleRestore = !contents.includes(LIFECYCLE_RESTORE_INSTALL)
  if (
    !needsNetworkStart &&
    !needsBuiltInKitCleanup &&
    !needsLifecycleRestore
  ) {
    return contents
  }

  const markerIndex = contents.indexOf(DOKIT_INIT_MARKER)
  const builderIndex = contents.lastIndexOf('DoKit.Builder(this)', markerIndex)
  const buildIndex = contents.indexOf('.build()', markerIndex)
  if (builderIndex < 0 || buildIndex < 0) {
    throw new Error('withDoKit: existing DoKit initialization is unsupported')
  }

  const builderLineStart = contents.lastIndexOf(eol, builderIndex) + eol.length
  const indent = contents.slice(builderLineStart, builderIndex)
  const buildLineEnd = contents.indexOf(eol, buildIndex)
  const insertAt = buildLineEnd < 0 ? contents.length : buildLineEnd
  const lines = []
  if (needsLifecycleRestore) {
    lines.push(`${indent}${LIFECYCLE_RESTORE_INSTALL}`)
  }
  if (needsBuiltInKitCleanup) {
    lines.push(`${indent}${BUILT_IN_KIT_CLEANUP}`)
  }
  if (needsNetworkStart) {
    lines.push(
      `${indent}// DoKit's storage permission gate is obsolete on Android 13+.`,
      `${indent}${NETWORK_MONITOR_START}`
    )
  }
  return `${contents.slice(0, insertAt)}${eol}${lines.join(eol)}${contents.slice(insertAt)}`
}

function renderMobileDiagnosticsDoKitSource(packageName) {
  const template = fs.readFileSync(GENERATED_ANDROID_TEMPLATE, 'utf8')
  return template.replace(/^package __PACKAGE__$/m, `package ${packageName}`)
}

function renderMobileDiagnosticsLauncherSource(packageName) {
  const template = fs.readFileSync(GENERATED_LAUNCHER_TEMPLATE, 'utf8')
  return template.replace(/^package __PACKAGE__$/m, `package ${packageName}`)
}

function renderMobileDiagnosticsNetworkModuleSource(packageName) {
  const template = fs.readFileSync(GENERATED_NETWORK_MODULE_TEMPLATE, 'utf8')
  return template.replace(/^package __PACKAGE__$/m, `package ${packageName}`)
}

function renderMobileDiagnosticsNetworkPackageSource(packageName) {
  const template = fs.readFileSync(GENERATED_NETWORK_PACKAGE_TEMPLATE, 'utf8')
  return template.replace(/^package __PACKAGE__$/m, `package ${packageName}`)
}

function renderMobileDiagnosticsResources() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="mobile_diagnostics_application_tools">Application Tools</string>
  <string name="mobile_diagnostics_network">Network</string>
  <string name="mobile_diagnostics_local_state">Local State</string>
  <string name="mobile_diagnostics_expo_update">Expo Update</string>
  <string name="mobile_diagnostics_api_environment">API Environment</string>
  <string name="mobile_diagnostics_interface_mock">Interface Mock</string>
  <string name="mobile_diagnostics_runtime_unavailable">Diagnostics runtime is not ready</string>
</resources>
`
}

function renderMobileDiagnosticsChineseResources() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="mobile_diagnostics_application_tools">应用工具</string>
  <string name="mobile_diagnostics_network">网络抓包</string>
  <string name="mobile_diagnostics_local_state">本地状态</string>
  <string name="mobile_diagnostics_expo_update">Expo 热更新</string>
  <string name="mobile_diagnostics_api_environment">API 环境</string>
  <string name="mobile_diagnostics_interface_mock">接口 Mock</string>
  <string name="mobile_diagnostics_runtime_unavailable">诊断运行时尚未就绪</string>
</resources>
`
}

function renderMobileDiagnosticsExpoUpdateIcon() {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="#168A5B"
    android:pathData="M12,4V1L8,5l4,4V6c3.31,0 6,2.69 6,6 0,1.01 -0.25,1.97 -0.7,2.8l1.46,1.46A7.9,7.9 0,0 0,20 12c0,-4.42 -3.58,-8 -8,-8zM6,12c0,-1.01 0.25,-1.97 0.7,-2.8L5.24,7.74A7.9,7.9 0,0 0,4 12c0,4.42 3.58,8 8,8v3l4,-4 -4,-4v3c-3.31,0 -6,-2.69 -6,-6z" />
</vector>
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
  const missingRules = PROGUARD_RULES.filter((rule) => !contents.includes(rule))
  if (missingRules.length === 0) return contents
  const separator = contents.endsWith('\n') || contents.length === 0 ? '' : '\n'
  const marker = contents.includes(PROGUARD_MARKER)
    ? ''
    : `${PROGUARD_MARKER}\n`
  return `${contents}${separator}${marker}${missingRules.join('\n')}\n`
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
  if (next !== contents) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, next)
  }
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
        path.join(path.dirname(mainApplication), GENERATED_LAUNCHER_SOURCE_NAME),
        () => renderMobileDiagnosticsLauncherSource(packageName)
      )
      writeTransformedFile(
        path.join(
          path.dirname(mainApplication),
          GENERATED_NETWORK_MODULE_SOURCE_NAME
        ),
        () => renderMobileDiagnosticsNetworkModuleSource(packageName)
      )
      writeTransformedFile(
        path.join(
          path.dirname(mainApplication),
          GENERATED_NETWORK_PACKAGE_SOURCE_NAME
        ),
        () => renderMobileDiagnosticsNetworkPackageSource(packageName)
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
        path.join(
          projectRoot,
          'app',
          'src',
          'main',
          'res',
          'values-zh-rCN',
          GENERATED_RESOURCES_NAME
        ),
        renderMobileDiagnosticsChineseResources
      )
      writeTransformedFile(
        path.join(
          projectRoot,
          'app',
          'src',
          'main',
          'res',
          'drawable',
          GENERATED_EXPO_UPDATE_ICON_NAME
        ),
        renderMobileDiagnosticsExpoUpdateIcon
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
module.exports.renderMobileDiagnosticsLauncherSource =
  renderMobileDiagnosticsLauncherSource
module.exports.renderMobileDiagnosticsNetworkModuleSource =
  renderMobileDiagnosticsNetworkModuleSource
module.exports.renderMobileDiagnosticsNetworkPackageSource =
  renderMobileDiagnosticsNetworkPackageSource
module.exports.renderMobileDiagnosticsResources = renderMobileDiagnosticsResources
module.exports.renderMobileDiagnosticsChineseResources =
  renderMobileDiagnosticsChineseResources
module.exports.renderMobileDiagnosticsExpoUpdateIcon =
  renderMobileDiagnosticsExpoUpdateIcon

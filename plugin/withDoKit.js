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
const DOKIT_INIT_MARKER = 'DoKit.Builder(this).disableUpload().build()'
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
    `${indent}${DOKIT_INIT_MARKER}`,
    `${indent}OkHttpClientProvider.setOkHttpClientFactory {`,
    `${indent}  OkHttpClientProvider.createClientBuilder(this)`,
    `${indent}    .addInterceptor(DokitCapInterceptor())`,
    `${indent}    .build()`,
    `${indent}}`,
  ].join(eol)
  return next.replace(marker, `$&${eol}${block}`)
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
      writeTransformedFile(mainApplication, addDoKitToMainApplication)
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

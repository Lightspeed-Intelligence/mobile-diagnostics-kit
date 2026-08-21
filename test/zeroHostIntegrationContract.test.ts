import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function source(relativePath: string): string {
  const path = resolve(root, relativePath)
  expect(existsSync(path), `${relativePath} must be published by the package`).toBe(
    true
  )
  return readFileSync(path, 'utf8')
}

describe('single dependency host integration contract', () => {
  it('publishes standard React Native native projects for both platforms', () => {
    const packageJson = JSON.parse(source('package.json')) as {
      files: string[]
    }
    const nativeConfig = require('../react-native.config.js')

    expect(packageJson.files).toContain('android')
    expect(packageJson.files).toContain('MobileDiagnosticsKit.podspec')
    expect(nativeConfig.dependency.platforms.android).toMatchObject({
      sourceDir: './android',
    })
    expect(nativeConfig.dependency.platforms.ios).toMatchObject({
      podspecPath: './ios/MobileDiagnosticsKit.podspec',
    })
  })

  it('starts Android diagnostics from the merged library manifest', () => {
    const manifest = source('android/src/main/AndroidManifest.xml')
    const provider = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsInitProvider.kt'
    )

    expect(manifest).toContain('.MobileDiagnosticsInitProvider')
    expect(manifest).toContain('.MobileDiagnosticsActivity')
    expect(provider).toContain('class MobileDiagnosticsInitProvider')
    expect(provider).toContain('MobileDiagnosticsDoKit.install(application)')
  })

  it('owns Android DoKit registration and presentation inside the library', () => {
    const gradle = source('android/build.gradle')
    const doKit = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsDoKit.kt'
    )
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )

    expect(gradle).toContain('io.github.didi.dokit:dokitx:3.7.11')
    expect(doKit).toContain('DoKit.Builder(application)')
    expect(doKit).toContain('MobileDiagnosticsActivity.open(')
    expect(activity).toContain('DESTINATION_NETWORK')
    expect(activity).toContain('DESTINATION_STORAGE')
    expect(activity).toContain('DESTINATION_OTA')
    expect(activity).not.toContain('mobile-diagnostics-kit.open')
  })

  it('keeps the Android ReactPackage autolinkable without host registration', () => {
    const reactPackage = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsPackage.kt'
    )

    expect(reactPackage).toContain('class MobileDiagnosticsPackage')
    expect(reactPackage).toContain(': ReactPackage')
  })

  it('starts iOS diagnostics after a scene connects without SceneDelegate code', () => {
    const podspec = source('MobileDiagnosticsKit.podspec')
    const bootstrap = source('ios/Sources/MDKDiagnosticsBootstrap.m')

    expect(podspec).toContain("s.platform = :ios, '15.1'")
    expect(podspec).toContain("s.dependency 'EXUpdates'")
    expect(podspec).toContain("s.dependency 'MMKVCore'")
    expect(bootstrap).toContain('UISceneWillConnectNotification')
    expect(bootstrap).toContain('[MDKMobileDiagnostics install]')
  })

  it('documents dependency presence as the only build-time opt-in', () => {
    const readme = source('README.md')

    expect(readme).toContain('No host source patching')
    expect(readme).toContain('dependency is the opt-in')
  })
})

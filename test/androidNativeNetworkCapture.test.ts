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

describe('Android native network capture contract', () => {
  it('publishes a passive native exchange recorder for non-RN clients', () => {
    const recorder = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsNativeNetwork.kt'
    )

    expect(recorder).toContain('data class MobileDiagnosticsHttpExchange')
    expect(recorder).toContain('object MobileDiagnosticsNativeNetwork')
    expect(recorder).toContain('fun record(exchange: MobileDiagnosticsHttpExchange)')
    expect(recorder).toContain('@JvmStatic')
    expect(recorder).toContain('fun recordHttpExchange(')
    expect(recorder).toContain('if (!NetworkManager.isActive()) return')
    expect(recorder).toContain(
      'fun record(exchange: MobileDiagnosticsHttpExchange) {\n    runCatching {\n      if (!NetworkManager.isActive()) return'
    )
    expect(recorder).toContain('NetworkManager.get().addRecord')
    expect(recorder).toContain('NetworkManager.get().updateRecord')
    expect(recorder).not.toContain('HttpUrlConnectionProxyUtil')
    expect(recorder).toContain(
      'fun install(builder: OkHttpClient.Builder): OkHttpClient.Builder = builder.also'
    )
    expect(recorder).toContain('runCatching {\n      val interceptors')
    expect(recorder).toContain('MobileDiagnosticsOverrideInterceptor')
    expect(recorder).toContain('val alreadyCaptured')
  })

  it('offers an additive OkHttp interceptor that preserves native call results', () => {
    const interceptor = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsOkHttpInterceptor.kt'
    )

    expect(interceptor).toContain('class MobileDiagnosticsOkHttpInterceptor')
    expect(interceptor).toContain(
      'runCatching { captureRequestBody(request) }.getOrNull()'
    )
    expect(interceptor).toContain('chain.proceed(request)')
    expect(interceptor).toContain('throw error')
    expect(interceptor).not.toContain('Response.Builder()')
    expect(interceptor).not.toContain('code(400)')
  })

  it('ships modern AGP instrumentation for OkHttp and HttpURLConnection without host code', () => {
    const expoModuleConfig = JSON.parse(source('expo-module.config.json')) as {
      platforms: string[]
      apple: {
        podspecPath: string
      }
      android: {
        gradlePlugins: Array<{
          id: string
          group: string
          sourceDir: string
        }>
      }
    }
    const gradlePlugin = source(
      'android-gradle-plugin/src/main/java/com/mobilediagnosticskit/gradle/MobileDiagnosticsNetworkCapturePlugin.java'
    )
    const visitor = source(
      'android-gradle-plugin/src/main/java/com/mobilediagnosticskit/gradle/NetworkCaptureClassVisitorFactory.java'
    )
    const urlConnectionCapture = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsHttpUrlConnectionCapture.kt'
    )

    expect(expoModuleConfig.android.gradlePlugins).toContainEqual({
      id: 'mobile-diagnostics-network-capture',
      group: 'com.mobilediagnosticskit',
      sourceDir: 'android-gradle-plugin',
    })
    expect(expoModuleConfig.platforms).toEqual(['apple', 'android'])
    expect(expoModuleConfig.apple.podspecPath).toBe(
      './ios/MobileDiagnosticsKit.podspec'
    )
    expect(gradlePlugin).toContain('InstrumentationScope.ALL')
    expect(gradlePlugin).toContain('selector().all()')
    expect(gradlePlugin).not.toContain('isDebuggable')
    expect(gradlePlugin).not.toContain('Release')
    expect(visitor).toContain('okhttp3/OkHttpClient')
    expect(visitor).toContain('MobileDiagnosticsNativeNetwork')
    expect(visitor).toContain('java/net/HttpURLConnection')
    expect(visitor).toContain('javax/net/ssl/HttpsURLConnection')
    expect(visitor).toContain('replacementForInputStream')
    expect(visitor).toContain('replacementForOutputStream')
    expect(visitor).toContain('replacementForResponseCode')
    expect(visitor).toContain('replacementForDisconnect')
    expect(visitor).not.toContain('HttpUrlConnectionProxyUtil')
    expect(urlConnectionCapture).toContain('throw error')
    expect(urlConnectionCapture).toContain('FilterInputStream')
    expect(urlConnectionCapture).toContain('FilterOutputStream')
    expect(urlConnectionCapture).toContain('`in`.read(bytes)')
    expect(urlConnectionCapture).toContain('out.write(bytes)')
    expect(urlConnectionCapture).toContain(
      'private fun stateFor(connection: HttpURLConnection): CaptureState?'
    )
    expect(urlConnectionCapture).toContain('runCatching { capture.append')
    expect(urlConnectionCapture).not.toContain('Response.Builder()')
    expect(urlConnectionCapture).not.toContain('code(400)')
  })
})

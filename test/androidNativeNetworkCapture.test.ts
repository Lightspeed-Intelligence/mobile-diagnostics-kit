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
})

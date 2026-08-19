import { readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

describe('iOS DoKit wrapper', () => {
  it('owns the pinned DoKit dependency from a public podspec', () => {
    const podspec = read('ios/MobileDiagnosticsKit.podspec')

    expect(podspec).toContain("s.name = 'MobileDiagnosticsKit'")
    expect(podspec).toContain("s.dependency 'DoraemonKit/Core', '~> 3.1.7'")
    expect(podspec).toContain(
      'https://github.com/Lightspeed-Intelligence/mobile-diagnostics-kit'
    )
  })

  it('disables DoKit telemetry before installing the on-device entry', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const disableTelemetry = source.indexOf('method_setImplementation')
    const installDoKit = source.indexOf('DoraemonManager shareInstance')

    expect(disableTelemetry).toBeGreaterThan(-1)
    expect(installDoKit).toBeGreaterThan(disableTelemetry)
    expect(source).toContain('dispatch_once')
  })
})

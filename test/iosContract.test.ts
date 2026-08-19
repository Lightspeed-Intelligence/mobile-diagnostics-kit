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

  it('imports the DoKit cache manager used by the network replacement', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')

    expect(source).toContain(
      '#import <DoraemonKit/DoraemonCacheManager.h>'
    )
  })

  it('disables DoKit telemetry before installing the on-device entry', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const disableUsageUpload = source.indexOf('DoraemonStatisticsUtil')
    const disableTelemetry = source.indexOf('method_setImplementation')
    const installDoKit = source.indexOf('DoraemonManager shareInstance')

    expect(disableUsageUpload).toBeGreaterThan(-1)
    expect(disableTelemetry).toBeGreaterThan(-1)
    expect(source).toContain('setNoUpLoad:')
    expect(installDoKit).toBeGreaterThan(disableUsageUpload)
    expect(installDoKit).toBeGreaterThan(disableTelemetry)
    expect(source).toContain('dispatch_once')
  })

  it('registers local-state and Expo-update destinations inside DoKit', () => {
    const header = read('ios/Sources/MobileDiagnostics.h')
    const source = read('ios/Sources/MobileDiagnostics.m')
    const registerLocalState = source.indexOf('@"Local State"')
    const registerExpoUpdate = source.indexOf('@"Expo Update"')
    const installDoKit = source.indexOf('DoraemonManager shareInstance] install')

    expect(header).toContain('MDKDiagnosticsDestinationLocalState')
    expect(header).toContain('MDKDiagnosticsDestinationExpoUpdate')
    expect(header).toContain('installWithOpenHandler')
    expect(registerLocalState).toBeGreaterThan(-1)
    expect(registerExpoUpdate).toBeGreaterThan(registerLocalState)
    expect(installDoKit).toBeGreaterThan(registerExpoUpdate)
    expect(source).toContain('hiddenHomeWindow')
  })
})

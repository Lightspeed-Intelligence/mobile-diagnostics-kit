import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

describe('iOS DoKit wrapper', () => {
  it('owns pinned DoKit and React bridge dependencies from a public podspec', () => {
    const podspec = read('ios/MobileDiagnosticsKit.podspec')

    expect(podspec).toContain("s.name = 'MobileDiagnosticsKit'")
    expect(podspec).toContain("s.dependency 'DoraemonKit/Core', '~> 3.1.7'")
    expect(podspec).toContain("s.dependency 'React-Core'")
    expect(podspec).toContain(
      'https://github.com/Lightspeed-Intelligence/mobile-diagnostics-kit'
    )
  })

  it('disables DoKit telemetry before installing on-device entries', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const disableUsageUpload = source.indexOf('DoraemonStatisticsUtil')
    const disableTelemetry = source.indexOf('method_setImplementation')
    const installDoKit = source.indexOf('DoraemonManager shareInstance] install')

    expect(disableUsageUpload).toBeGreaterThan(-1)
    expect(disableTelemetry).toBeGreaterThan(-1)
    expect(source).toContain('setNoUpLoad:')
    expect(installDoKit).toBeGreaterThan(disableUsageUpload)
    expect(installDoKit).toBeGreaterThan(disableTelemetry)
    expect(source).toContain('dispatch_once')
  })

  it('registers all three destinations inside DoKit', () => {
    const header = read('ios/Sources/MobileDiagnostics.h')
    const source = read('ios/Sources/MobileDiagnostics.m')
    const registerLocalState = source.indexOf('@"Local State"')
    const registerExpoUpdate = source.indexOf('@"Expo Update"')
    const registerNetwork = source.indexOf('@"Network"')

    expect(header).toContain('MDKDiagnosticsDestinationLocalState')
    expect(header).toContain('MDKDiagnosticsDestinationExpoUpdate')
    expect(header).toContain('MDKDiagnosticsDestinationNetwork')
    expect(registerLocalState).toBeGreaterThan(-1)
    expect(registerExpoUpdate).toBeGreaterThan(registerLocalState)
    expect(registerNetwork).toBeGreaterThan(-1)
    expect(source).toContain('hiddenHomeWindow')
    expect(source).toContain('icon:@"doraemon_file_sync"')
  })

  it('uses a system-managed back item on DoKit child pages', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const installNavigationPatch = source.indexOf(
      'MDKInstallDoKitNavigationPatch();'
    )
    const installDoKit = source.indexOf('DoraemonManager shareInstance] install')

    expect(source).toContain('MDKDoKitViewWillAppear')
    expect(source).toContain('DoraemonBaseViewController')
    expect(source).toContain('DoraemonHomeViewController')
    expect(source).toContain('initWithImage:backImage')
    expect(source).toContain('action:@selector(leftNavBackClick:)')
    expect(source).toContain('navigationItem.leftBarButtonItem = backItem')
    expect(installNavigationPatch).toBeGreaterThan(-1)
    expect(installDoKit).toBeGreaterThan(installNavigationPatch)
  })

  it('replaces DoKit legacy Network with the React Native destination', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const removeLegacy = source.indexOf('removePluginWithPluginName')
    const refreshDoKitCache = source.indexOf('saveKitManagerData')
    const registerReplacement = source.indexOf('pluginName:@"MDKNetworkPlugin"')

    expect(source).toContain('DoraemonNetFlowPlugin')
    expect(refreshDoKitCache).toBeGreaterThan(removeLegacy)
    expect(registerReplacement).toBeGreaterThan(refreshDoKitCache)
    expect(source).toContain('openHandler(MDKDiagnosticsDestinationNetwork)')
    expect(source).not.toContain('MDKNetworkInspectorViewController')
    expect(
      existsSync(
        path.resolve(
          process.cwd(),
          'ios/Sources/MDKNetworkInspectorViewController.m'
        )
      )
    ).toBe(false)
  })

  it('exports complete native request snapshots without redaction', () => {
    const source = read('ios/Sources/MDKNetworkDiagnosticsModule.m')

    expect(source).toContain('RCT_EXPORT_MODULE(MobileDiagnosticsNetwork)')
    expect(source).toContain('DoraemonNetFlowDataSource')
    expect(source).toContain('model.request.allHTTPHeaderFields')
    expect(source).toContain('model.requestBody')
    expect(source).toContain('model.responseBody')
    expect(source).toContain('allHeaderFields')
    expect(source).toContain('@"responseBodyBinary"')
    expect(source).not.toContain('redact')
  })

  it('exposes clear, capture, and copy operations to React Native', () => {
    const source = read('ios/Sources/MDKNetworkDiagnosticsModule.m')

    expect(source).toContain('clearRequests')
    expect(source).toContain('setCaptureEnabled')
    expect(source).toContain('isCaptureEnabled')
    expect(source).toContain('copyToClipboard')
    expect(source).toContain('saveNetFlowSwitch:enabled')
    expect(source).toContain('canInterceptNetFlow:enabled')
    expect(source).toContain('UIPasteboard.generalPasteboard.string')
  })
})

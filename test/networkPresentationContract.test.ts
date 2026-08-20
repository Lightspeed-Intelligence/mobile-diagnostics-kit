import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

describe('cross-platform React Native network inspector', () => {
  it('renders Network as a first-class React Native destination', () => {
    const presentation = read('src/presentation.ts')
    const content = read('src/ui/DiagnosticsContent.tsx')
    const panel = read('src/ui/NetworkPanel.tsx')
    const detail = read('src/ui/NetworkDetail.tsx')
    const labels = read('src/ui/model.ts')

    expect(presentation).toContain("'network' | 'storage' | 'ota'")
    expect(content).toContain("import { NetworkPanel } from './NetworkPanel'")
    expect(content).toContain("tab === 'network'")
    expect(content).toContain('<NetworkPanel')
    expect(panel).toContain('FlatList')
    expect(detail).toContain('createCurlCommand(request)')
    expect(labels).toContain("networkCopyCurl: 'Copy cURL'")
    expect(labels).toContain("networkRequestHeaders: 'Request Headers'")
    expect(labels).toContain("networkResponseBody: 'Response Body'")
  })

  it('keeps Android capture native while removing its native inspector UI', () => {
    const kit = read('plugin/android/MobileDiagnosticsDoKit.kt.template')
    const bridge = read(
      'plugin/android/MobileDiagnosticsNetworkModule.kt.template'
    )

    expect(kit).toContain(
      'MobileDiagnosticsLauncher.openAfterPanelDismiss(activity, destination)'
    )
    expect(kit).not.toContain('MobileDiagnosticsNetworkFragment')
    expect(kit).not.toContain('BaseFragment')
    expect(bridge).toContain('NetworkManager.get().records')
    expect(bridge).toContain('@ReactMethod')
    expect(bridge).toContain('fun getRequests(')
    expect(bridge).toContain('fun clearRequests(')
    expect(bridge).toContain('fun setCaptureEnabled(')
    expect(bridge).toContain('fun isCaptureEnabled(')
    expect(bridge).toContain('fun copyToClipboard(')
  })

  it('keeps iOS capture native while routing Network to the RN surface', () => {
    const header = read('ios/Sources/MobileDiagnostics.h')
    const installer = read('ios/Sources/MobileDiagnostics.m')
    const bridge = read('ios/Sources/MDKNetworkDiagnosticsModule.m')

    expect(header).toContain('MDKDiagnosticsDestinationNetwork')
    expect(installer).toContain('openHandler(MDKDiagnosticsDestinationNetwork)')
    expect(installer).not.toContain('MDKNetworkInspectorViewController')
    expect(bridge).toContain('RCT_EXPORT_MODULE(MobileDiagnosticsNetwork)')
    expect(bridge).toContain('getRequests')
    expect(bridge).toContain('clearRequests')
    expect(bridge).toContain('setCaptureEnabled')
    expect(bridge).toContain('isCaptureEnabled')
    expect(bridge).toContain('copyToClipboard')
    expect(
      existsSync(
        path.resolve(
          process.cwd(),
          'ios/Sources/MDKNetworkInspectorViewController.m'
        )
      )
    ).toBe(false)
  })
})

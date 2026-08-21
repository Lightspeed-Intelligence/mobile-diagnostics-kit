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
    const installDoKit = source.indexOf('[manager install]')

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

  it('localizes custom DoKit entries for Chinese system languages', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')

    expect(source).toContain('NSLocale.preferredLanguages')
    expect(source).toContain('MDKLocalizedString(@"Application Tools", @"应用工具")')
    expect(source).toContain('MDKLocalizedString(@"Network", @"网络抓包")')
    expect(source).toContain('MDKLocalizedString(@"Local State", @"本地状态")')
    expect(source).toContain('MDKLocalizedString(@"Expo Update", @"Expo 热更新")')
  })

  it('matches DoKit language fallback for non-English system languages', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')

    expect(source).toContain('MDKUsesEnglishLanguage')
    expect(source).toContain('hasPrefix:@"en"')
    expect(source).toContain(
      'MDKUsesEnglishLanguage() ? english : chinese'
    )
    expect(source).not.toContain('hasPrefix:@"zh"')
  })

  it('owns generic navigation and RN surface presentation behind an additive API', () => {
    const header = read('ios/Sources/MobileDiagnostics.h')
    const source = read('ios/Sources/MobileDiagnostics.m')

    expect(header).toContain('MDKDiagnosticsSurfaceProvider')
    expect(header).toContain('installInNavigationController:')
    expect(header).toContain('surfaceProvider:')
    expect(header).toContain('NS_SWIFT_NAME(install(in:surfaceProvider:))')
    expect(source).toContain('MDKDiagnosticsSurfaceViewController')
    expect(source).toContain('surfaceProvider(initialDestination)')
    expect(source).toContain('navigationController.topViewController != controller')
    expect(source).toContain('RCT_EXPORT_MODULE(MobileDiagnosticsPresentation)')
    expect(source).toContain('RCT_EXPORT_METHOD(close)')
    expect(source).not.toContain('Tipsy')
  })

  it('uses a system-managed back item on DoKit child pages', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const installNavigationPatch = source.indexOf(
      'MDKInstallDoKitNavigationPatch();'
    )
    const installDoKit = source.indexOf('[manager install]')

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
    const replaceLegacy = source.indexOf('MDKReplaceLegacyNetworkPlugin(')
    const removeLegacy = source.indexOf(
      'removePluginWithPluginName',
      replaceLegacy
    )
    const refreshDoKitCache = source.indexOf(
      'saveKitManagerData',
      removeLegacy
    )
    const registerReplacement = source.indexOf(
      'pluginName:@"MDKNetworkPlugin"',
      refreshDoKitCache
    )

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

  it('removes the unsupported iOS platform-tools group, including late additions', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const installDoKit = source.indexOf('[manager install]')
    const firstCleanup = source.indexOf(
      'MDKRemoveUnsupportedPlatformTools(manager);',
      installDoKit
    )

    expect(source).toContain('@"平台工具"')
    expect(source).toContain('@"Platform"')
    expect(source).toContain('[platformModuleNames containsObject:moduleName]')
    expect(firstCleanup).toBeGreaterThan(installDoKit)
    expect(source).toContain('dispatch_async(dispatch_get_main_queue(), ^{')
    expect(source).toContain('MDKRemoveUnsupportedPlatformTools(manager);')
    expect(source).toContain('removeObjectsAtIndexes:platformModules')
    expect(source).toContain('saveKitManagerData:manager.dataArray')
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

  it('restores the zero-host local-state search and inline detail experience', () => {
    const source = read('ios/Sources/MDKNativeDiagnosticsViewController.mm')

    expect(source).toContain('MDKStorageSecurityTitle')
    expect(source).toContain('MDKStorageSearchPlaceholder')
    expect(source).toContain('filterStorageEntries')
    expect(source).toContain('showStorageDetail:')
    expect(source).toContain('MDKStorageReadOnlyText')
    expect(source).toContain('selectable = YES')
    expect(source).toContain('storageKindForValue:')
    expect(source).toContain('addStorageValueRowsForEntry:')
    expect(source).toContain('toStack:')
    expect(source).toContain('refreshStorage')
    expect(source).toContain('scrollRectToVisible:')
    expect(source).toContain('NSJSONWritingFragmentsAllowed')
    expect(source).toContain('storageTop.axis = UILayoutConstraintAxisHorizontal')
    expect(source).toContain('key.numberOfLines = 2')

    const emptyResult = source.indexOf('emptyStateWithTitle:MDKText(@"No entries available"')
    const enumerateResults = source.indexOf(
      '[_filteredStorageEntries enumerateObjectsUsingBlock:',
      emptyResult
    )
    expect(emptyResult).toBeGreaterThan(-1)
    expect(enumerateResults).toBeGreaterThan(emptyResult)
    expect(source.slice(emptyResult, enumerateResults)).not.toContain('return;')
  })

  it('restores network metrics, capture controls, filters, and full request details', () => {
    const source = read('ios/Sources/MDKNativeDiagnosticsViewController.mm')

    expect(source).toContain('scheduleNetworkRefresh')
    expect(source).toContain('toggleNetworkCapture:')
    expect(source).toContain('confirmClearNetwork')
    expect(source).toContain('filterNetworkModels')
    expect(source).toContain('showNetworkDetail:')
    expect(source).toContain('renderNetworkDetailForModel:')
    expect(source).toContain('responseTab:')
    expect(source).toContain('copyCurl:')
    expect(source).toContain('copyNetworkBody:')
    expect(source).toContain('UIPasteboard.generalPasteboard.string')
    expect(source).toContain('pathLabel.numberOfLines = 2')
    expect(source).toContain('host.numberOfLines = 1')
    expect(source).toContain('renderNetworkDetailHeader')
    expect(source).toContain('collapsibleSectionWithTitle:')
    expect(source).toContain('toggleCollapsibleSection:')
    expect(source).toContain('initiallyExpanded:')
    expect(
      source.match(/top\.alignment = UIStackViewAlignmentCenter/g)?.length
    ).toBeGreaterThanOrEqual(2)
  })

  it('keeps request-detail navigation fixed outside the scrolling content', () => {
    const source = read('ios/Sources/MDKNativeDiagnosticsViewController.mm')

    expect(source).toContain('UIStackView *_bodyStack')
    expect(source).toContain('UIView *_networkDetailHeader')
    expect(source).toContain('[_bodyStack addArrangedSubview:_networkDetailHeader]')
    expect(source).toContain('[_bodyStack addArrangedSubview:_scrollView]')
    expect(source).toContain('_networkDetailHeader.hidden = !visible')
    expect(source).not.toContain(
      '[_content addArrangedSubview:[self renderNetworkDetailHeader]]'
    )
  })

  it('renders current-bundle and update-action cards with the established theme', () => {
    const source = read('ios/Sources/MDKNativeDiagnosticsViewController.mm')

    expect(source).toContain('MDKCurrentBundleTitle')
    expect(source).toContain('MDKOtaActionTitle')
    expect(source).toContain('MDKAccentSurfaceColor')
    expect(source).toContain('MDKBorderColor')
    expect(source).toContain('safeAreaLayoutGuide')
    expect(source).toContain('accessibilityLabel')
  })
})

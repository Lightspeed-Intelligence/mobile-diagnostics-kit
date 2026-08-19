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

  it('replaces DoKit’s legacy network page with the public diagnostics surface', () => {
    const source = read('ios/Sources/MobileDiagnostics.m')
    const networkSource = read(
      'ios/Sources/MDKNetworkInspectorViewController.m'
    )

    expect(source).toContain('DoraemonNetFlowPlugin')
    expect(source).toContain(
      '#import <DoraemonKit/DoraemonHomeWindow.h>'
    )
    expect(source).toContain('removePluginWithPluginName')
    expect(source).toContain('saveKitManagerData')
    expect(source).toContain('MDKNetworkPlugin')

    const removeLegacy = source.indexOf('removePluginWithPluginName')
    const refreshDoKitCache = source.indexOf('saveKitManagerData')
    const registerReplacement = source.indexOf('pluginName:@"MDKNetworkPlugin"')
    expect(refreshDoKitCache).toBeGreaterThan(removeLegacy)
    expect(registerReplacement).toBeGreaterThan(refreshDoKitCache)
    expect(networkSource).toContain('DoraemonNetFlowDataSource')
    expect(networkSource).toContain(
      '#import <DoraemonKit/DoraemonCacheManager.h>'
    )
    expect(networkSource).toContain(
      '#import <DoraemonKit/DoraemonHomeWindow.h>'
    )
    expect(networkSource).toContain(
      '#import <DoraemonKit/DoraemonNetFlowDataSource.h>'
    )
    expect(networkSource).toContain(
      '#import <DoraemonKit/DoraemonNetFlowHttpModel.h>'
    )
    expect(networkSource).toContain(
      '#import <DoraemonKit/DoraemonNetFlowManager.h>'
    )
    expect(networkSource).not.toContain('NSString *copyContent')
    expect(networkSource).toContain('MDKNetworkRequestCell')
    expect(networkSource).toContain('MDKNetworkDetailViewController')
    expect(networkSource).toContain('Network')
    expect(networkSource).toContain('Network list')
    expect(networkSource).toContain('Network summary')
    expect(networkSource).toContain('UIContentSizeCategoryDidChangeNotification')
  })

  it('preserves DoKit network data semantics in the custom presentation', () => {
    const networkSource = read(
      'ios/Sources/MDKNetworkInspectorViewController.m'
    )

    // Transport errors are stored by DoKit as localized, non-numeric status
    // strings. They must remain visible in the Errors filter and summary.
    expect(networkSource).toContain('MDKParseHTTPStatusCode')
    expect(networkSource).toContain('scanner.isAtEnd')
    expect(networkSource).toContain('return !MDKParseHTTPStatusCode')

    // Display formatting must not replace the exact captured body copied by
    // the tester, and binary responses must not be mislabeled as empty.
    expect(networkSource).toContain('displayContent:')
    expect(networkSource).toContain('copyContent:')
    expect(networkSource).toContain('MDKResponseBodyDisplay')
    expect(networkSource).toContain('Binary response body')
    expect(networkSource).toContain('self.model.responseBody')

    // DoKit clears its data source when capture is disabled; the visible
    // snapshot must be refreshed in the same action.
    const captureChanged = networkSource.indexOf(
      '- (void)captureSwitchChanged'
    )
    const refreshAfterCapture = networkSource.indexOf(
      '[self refreshRequests]',
      captureChanged
    )
    expect(refreshAfterCapture).toBeGreaterThan(captureChanged)
  })

  it('keeps request chips compact and the DoKit entry clear of inspector controls', () => {
    const networkSource = read(
      'ios/Sources/MDKNetworkInspectorViewController.m'
    )

    expect(networkSource).toContain(
      '[_methodLabel setContentHuggingPriority:UILayoutPriorityRequired'
    )

    const detailController = networkSource.indexOf(
      '@implementation MDKNetworkDetailViewController'
    )
    const listController = networkSource.indexOf(
      '@implementation MDKNetworkInspectorViewController'
    )
    const detailSource = networkSource.slice(detailController, listController)
    const listSource = networkSource.slice(listController)

    expect(detailSource).toContain(
      '[[DoraemonManager shareInstance] hiddenDoraemon]'
    )
    expect(listSource).toContain(
      '[[DoraemonManager shareInstance] hiddenDoraemon]'
    )
    expect(listSource).toContain(
      '[[DoraemonManager shareInstance] showDoraemon]'
    )
  })

  it('classifies captured requests by response type before request semantics', () => {
    const networkSource = read(
      'ios/Sources/MDKNetworkInspectorViewController.m'
    )

    expect(networkSource).toContain('MDKNetworkResourceTypeFetch')
    expect(networkSource).toContain('MDKNetworkResourceTypeImage')
    expect(networkSource).toContain('MDKNetworkResourceTypeMedia')
    expect(networkSource).toContain('MDKNetworkResourceTypeOther')

    const classifierStart = networkSource.indexOf(
      'MDKResourceTypeForModel(DoraemonNetFlowHttpModel *model)'
    )
    const classifierEnd = networkSource.indexOf(
      '#pragma mark - Request cell',
      classifierStart
    )
    const classifier = networkSource.slice(classifierStart, classifierEnd)
    const imageCheck = classifier.indexOf('hasPrefix:@"image/"')
    const videoCheck = classifier.indexOf('hasPrefix:@"video/"')
    const audioCheck = classifier.indexOf('hasPrefix:@"audio/"')
    const fetchFallback = classifier.indexOf('MDKNetworkResourceTypeFetch')

    expect(classifierStart).toBeGreaterThan(-1)
    expect(imageCheck).toBeGreaterThan(-1)
    expect(videoCheck).toBeGreaterThan(imageCheck)
    expect(audioCheck).toBeGreaterThan(videoCheck)
    expect(fetchFallback).toBeGreaterThan(audioCheck)
    expect(classifier).toContain('pathExtension.lowercaseString')
    expect(classifier).toContain('containsString:@"+json"')
    expect(classifier).toContain('HTTPMethod.uppercaseString')
  })

  it('offers a horizontally scrollable DevTools-style type filter', () => {
    const networkSource = read(
      'ios/Sources/MDKNetworkInspectorViewController.m'
    )

    expect(networkSource).toContain(
      'initWithItems:@[ @"All", @"Fetch", @"Image", @"Media", @"Other", @"Errors" ]'
    )
    expect(networkSource).toContain('filterScrollView')
    expect(networkSource).toContain('showsHorizontalScrollIndicator = NO')
    expect(networkSource).toContain('MDKResourceTypeForModel(model)')
    expect(networkSource).toContain('mobileDiagnostics.network.filterControl')
    expect(networkSource).toContain('self.accessibilityValue = MDKResourceTypeTitle')
  })

  it('presents request details as structured DevTools-style sections', () => {
    const networkSource = read(
      'ios/Sources/MDKNetworkInspectorViewController.m'
    )

    expect(networkSource).toContain('MDKNetworkKeyValueSectionView')
    expect(networkSource).toContain('MDKHeaderRows')
    expect(networkSource).toContain('@"General"')
    expect(networkSource).toContain('@"Request Headers"')
    expect(networkSource).toContain('@"Payload"')
    expect(networkSource).toContain('@"Response Headers"')
    expect(networkSource).toContain('@"Response Body"')
    expect(networkSource).toContain('initiallyExpanded:NO')
    expect(networkSource).toContain('toggleExpanded')
    expect(networkSource).toContain('MDKAttributedBody')
    expect(networkSource).toContain(
      'initWithArrangedSubviews:@[heading, _divider, _rowsStack]'
    )

    // This is an on-device QA tool: display and copy preserve the raw capture.
    expect(networkSource).not.toContain('MDKRedact')
    expect(networkSource).toContain('copyContent:body')
  })
})

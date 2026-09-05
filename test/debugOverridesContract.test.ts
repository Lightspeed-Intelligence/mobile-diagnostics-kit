import { readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

describe('runtime override diagnostics contract', () => {
  it('exposes API environment and generic interface-mock tools on both platforms', () => {
    const activity = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt')
    const dokit = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsDoKit.kt')
    const nativeNetwork = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsNativeNetwork.kt')
    const template = read('plugin/android/MobileDiagnosticsDoKit.kt.template')
    const iosHeader = read('ios/Sources/MobileDiagnostics.h')
    const ios = read('ios/Sources/MobileDiagnostics.m')

    expect(activity).toContain('DESTINATION_API')
    expect(activity).toContain('DESTINATION_MOCKS')
    expect(dokit).toContain('DESTINATION_API')
    expect(dokit).toContain('DESTINATION_MOCKS')
    expect(dokit).toContain('MobileDiagnosticsNativeNetwork.installOverrides(')
    expect(nativeNetwork).toContain('fun installOverrides(')
    expect(template).toContain('"api"')
    expect(template).toContain('"mocks"')
    expect(template).toContain('MobileDiagnosticsActivity.open')
    expect(iosHeader).toContain('MDKDiagnosticsDestinationAPI')
    expect(iosHeader).toContain('MDKDiagnosticsDestinationMocks')
    expect(ios).toContain('@"API Environment"')
    expect(ios).toContain('@"Interface Mock"')
  })

  it('persists a versioned extensible mock registry with stable private keys', () => {
    const android = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsOverrides.kt')
    const ios = read('ios/Sources/MDKDiagnosticsOverrides.m')

    expect(android).toContain('mobile_diagnostics_api_base_url')
    expect(android).toContain('mobile_diagnostics_mock_overrides_v1')
    expect(android).toContain('AB_CONFIG_MOCK_ID')
    expect(ios).toContain('mobile_diagnostics_api_base_url')
    expect(ios).toContain('mobile_diagnostics_mock_overrides_v1')
    expect(ios).toContain('MDKABConfigMockIdentifier')
  })

  it('rewrites only the origin of allow-listed versioned first-party API URLs', () => {
    const android = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsOverrides.kt')
    const ios = read('ios/Sources/MDKDiagnosticsOverrides.m')

    for (const source of [android, ios]) {
      expect(source).toContain('api.dev.fantacy.live')
      expect(source).toContain('api.tipsy.chat')
      expect(source).toContain('/api/v[0-9]+')
      expect(source).toContain('https')
    }
    expect(android).toContain('rewriteApiUrl')
    expect(ios).toContain('MDKRewriteAPIURL')
  })

  it('presents API environment input as an origin instead of asking for an API version path', () => {
    const androidStrings = read('android/src/main/res/values/strings.xml')
    const ios = read('ios/Sources/MDKNativeDiagnosticsViewController.mm')

    expect(androidStrings).toContain(
      '<string name="mobile_diagnostics_api_placeholder">https://branch.api.dev.fantacy.live</string>',
    )
    expect(androidStrings).not.toContain(
      '<string name="mobile_diagnostics_api_placeholder">https://branch.api.dev.fantacy.live/api/v2</string>',
    )
    expect(ios).toContain('@"https://branch.api.dev.fantacy.live"]')
    expect(ios).not.toContain('@"https://branch.api.dev.fantacy.live/api/v2"]')
  })

  it('injects the iOS protocol into URL sessions without replacing existing protocols', () => {
    const protocol = read('ios/Sources/MDKDiagnosticsURLProtocol.m')

    expect(protocol).toContain('defaultSessionConfiguration')
    expect(protocol).toContain('ephemeralSessionConfiguration')
    expect(protocol).toContain('method_exchangeImplementations')
    expect(protocol).toContain('configuration.protocolClasses')
  })

  it('shows the effective rewritten URL in the iOS capture view', () => {
    const networkView = read('ios/Sources/MDKNativeDiagnosticsViewController.mm')
    const networkModule = read('ios/Sources/MDKNetworkDiagnosticsModule.m')

    expect(networkView).toContain('MDKRewriteAPIURL')
    expect(networkModule).toContain('MDKRewriteAPIURL')
  })

  it('patches only the dedicated AB bundle response and never user info', () => {
    const android = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsOverrides.kt')
    const interceptor = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsOverrideInterceptor.kt')
    const ios = read('ios/Sources/MDKDiagnosticsOverrides.m')
    const protocol = read('ios/Sources/MDKDiagnosticsURLProtocol.m')

    for (const source of [android, interceptor, ios, protocol]) {
      expect(source).not.toContain('/user/info')
    }
    expect(android).toContain('/api/v1/ab_config/get_bundle_configs')
    expect(android).toContain('patchABConfigResponse')
    expect(android).toContain('isAllowedApiHost(url.host)')
    expect(android).toContain('optJSONObject("configs")')
    expect(interceptor).toContain('response.newBuilder()')
    expect(ios).toContain('/api/v1/ab_config/get_bundle_configs')
    expect(ios).toContain('MDKPatchABConfigResponse')
    expect(ios).toContain('MDKIsAllowedAPIHost(request.URL.host')
    expect(protocol).toContain('MDKPatchABConfigResponse')
    expect(protocol).toContain('caseInsensitiveCompare:@"Content-Length"')
  })

  it('lets developers manage multiple AB experiment key/value rows without widening the mock match', () => {
    const android = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt')
    const ios = read('ios/Sources/MDKNativeDiagnosticsViewController.mm')
    const overrides = read('android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsOverrides.kt')
    const iosOverrides = read('ios/Sources/MDKDiagnosticsOverrides.m')

    expect(android).toContain('addABMockRow')
    expect(android).toContain('removeABMockRow')
    expect(android).toContain('current.values.entries')
    expect(android).toContain('saveMockOverride(endpoint.identifier, enabled.isChecked, values)')
    expect(ios).toContain('addABMockRowWithKey')
    expect(ios).toContain('removeABMockRow:')
    expect(ios).toContain('MDKSaveMockOverride')
    expect(iosOverrides).toContain('trimmedKey')
    expect(overrides).toContain('normalizeMockValues')
    expect(overrides).toContain('values.forEach')
  })
})

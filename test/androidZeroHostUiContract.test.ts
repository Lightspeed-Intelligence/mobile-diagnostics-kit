import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('Android zero-host diagnostics UI contract', () => {
  it('hides the launcher while a React Native modal owns the screen', () => {
    const launcher = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsLauncherOverlay.kt'
    )

    expect(launcher).toContain('ReactModalHostView')
    expect(launcher).toContain('getDialog')
    expect(launcher).toContain('OnGlobalLayoutListener')
    expect(launcher).toContain('dk_main_launch_icon')
    expect(launcher).toContain('if (hasVisibleReactModal(')
    expect(launcher).toContain('detachLauncher()')
    expect(launcher).not.toContain('dialog.window?.decorView')
    expect(launcher).not.toContain('text = "D"')
  })

  it('matches the established diagnostics header and local-state workflow', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )

    expect(activity).toContain('RippleDrawable')
    expect(activity).toContain('roundedBackground(')
    expect(activity).toContain('Typeface.MONOSPACE')
    expect(activity).toContain('mobile_diagnostics_eyebrow')
    expect(activity).toContain('EditText')
    expect(activity).toContain('filterStorageEntries(')
    expect(activity).toContain('renderStorageDetail(')
    expect(activity).toContain('maxLines = 3')
    expect(activity).not.toContain('android.widget.Button')
  })

  it('edits and deletes non-sensitive MMKV entries without changing their native type', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )
    const storage = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsStorage.kt'
    )
    const nativeStorage = source(
      'android/src/main/cpp/MobileDiagnosticsStorage.cpp'
    )

    expect(activity).toContain('saveStorageEntry(')
    expect(activity).toContain('confirmDeleteStorageEntry(')
    expect(storage).toContain('entry.kind')
    expect(storage).toContain('!containsSensitiveField(parsed)')
    expect(storage).toContain('writeDefaultNative(')
    expect(storage).toContain('removeDefaultNative(')
    expect(nativeStorage).toContain('storage->set(number_value, key)')
    expect(nativeStorage).toContain('storage->set(boolean_value, key)')
    expect(nativeStorage).toContain('storage->set(value, key)')
    expect(nativeStorage).toContain('storage->removeValueForKey(key)')
  })

  it('restores the established network toolbar, filters, and request detail', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )

    expect(activity).toContain('NetworkManager.isActive()')
    expect(activity).toContain('NetworkManager.get().startMonitor()')
    expect(activity).toContain('NetworkManager.get().stopMonitor()')
    expect(activity).toContain('mobile_diagnostics_network_requests')
    expect(activity).toContain('mobile_diagnostics_network_errors')
    expect(activity).toContain('mobile_diagnostics_network_received')
    expect(activity).toContain('mobile_diagnostics_network_search')
    expect(activity).toContain('filterNetworkRecords(')
    expect(activity).toContain('renderNetworkDetail(')
    expect(activity).toContain('createCurlCommand(')
    expect(activity).toContain('copyToClipboard(')
    expect(activity).toContain('collapsibleSection(')
  })

  it('keeps current-build information and the established OTA action card', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )

    expect(activity).toContain('runtimeInfoRow(')
    expect(activity).toContain('mobile_diagnostics_ota_title')
    expect(activity).toContain('mobile_diagnostics_ota_description')
    expect(activity).toContain('mobile_diagnostics_network_privacy_title')
  })

  it('localizes OTA and network detail labels on Android', () => {
    const english = source('android/src/main/res/values/strings.xml')
    const chinese = source('android/src/main/res/values-zh-rCN/strings.xml')
    const requiredNames = [
      'mobile_diagnostics_branch',
      'mobile_diagnostics_update_id',
      'mobile_diagnostics_published',
      'mobile_diagnostics_channel',
      'mobile_diagnostics_runtime',
      'mobile_diagnostics_source',
      'mobile_diagnostics_request_headers',
      'mobile_diagnostics_response_body',
      'mobile_diagnostics_network_search',
      'mobile_diagnostics_filter_errors',
      'mobile_diagnostics_copy_curl',
      'mobile_diagnostics_storage_search',
      'mobile_diagnostics_storage_save',
      'mobile_diagnostics_storage_delete',
      'mobile_diagnostics_ota_description',
    ]

    for (const name of requiredNames) {
      expect(english).toContain(`name="${name}"`)
      expect(chinese).toContain(`name="${name}"`)
    }
  })
})

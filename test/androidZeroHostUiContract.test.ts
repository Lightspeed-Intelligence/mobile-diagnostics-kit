import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('Android zero-host diagnostics UI contract', () => {
  it('keeps the launcher attached behind a React Native modal', () => {
    const launcher = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsLauncherOverlay.kt'
    )

    expect(launcher).toContain('dk_main_launch_icon')
    expect(launcher).toContain('val target = root as? ViewGroup ?: return')
    expect(launcher).toContain('detachLauncher()')
    expect(launcher).not.toContain('ReactModalHostView')
    expect(launcher).not.toContain('hasVisibleReactModal')
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

  it('places local-state details directly after the selected entry', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )
    const loop = activity.slice(
      activity.indexOf('filtered.forEach { entry ->'),
      activity.indexOf('private fun storageCard(')
    )

    expect(loop).toContain('if (entry.key == selectedStorageKey) {')
    expect(loop).toContain('container.addView(renderStorageDetail(entry))')
    expect(loop).not.toContain('scrollView.smoothScrollTo(0, container.bottom)')
    expect(loop).not.toContain(
      'entries.firstOrNull { it.key == selectedStorageKey }'
    )
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
    const strings = source('android/src/main/res/values/strings.xml')
    const localizedStrings = source(
      'android/src/main/res/values-zh-rCN/strings.xml'
    )
    const toolbar = activity.slice(
      activity.indexOf('private fun renderNetwork()'),
      activity.indexOf('private fun networkMetricsCard()')
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
    expect(activity).toContain('private var networkNewestFirst = true')
    expect(activity).toContain('private fun toggleNetworkSortOrder(')
    expect(activity).toContain(
      'if (networkNewestFirst) captured.asReversed() else captured'
    )
    expect(toolbar).toContain('orientation = LinearLayout.HORIZONTAL')
    expect(toolbar.match(/addView\(actionButton/g)?.length).toBe(3)
    expect(toolbar).toContain('toggleNetworkSortOrder(')
    expect(strings).toContain('name="mobile_diagnostics_sort_newest_first"')
    expect(strings).toContain('name="mobile_diagnostics_sort_oldest_first"')
    expect(localizedStrings).toContain('>倒序</string>')
    expect(localizedStrings).toContain('>正序</string>')
  })

  it('previews image responses without decoding an unbounded payload', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )
    const interceptor = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsImageInterceptor.kt'
    )
    const store = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsImageStore.kt'
    )
    const doKit = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsDoKit.kt'
    )

    expect(activity).toContain('ImageView')
    expect(activity).toContain('imageResponseContent(')
    expect(activity).toContain('MobileDiagnosticsImageStore.get(record.mRequestId)')
    expect(activity).toContain('BitmapFactory.Options().apply')
    expect(activity).toContain('MobileDiagnosticsImageStore.clear()')
    expect(activity).not.toContain('loadNetworkImagePreview(')
    expect(activity).not.toContain('HttpURLConnection')
    expect(interceptor).toContain('NetworkManager.isActive()')
    expect(interceptor).toContain('response.peekBody(MAX_IMAGE_BYTES + 1L)')
    expect(interceptor).toContain('NetworkInterpreter.get().createRecord(')
    expect(interceptor).toContain('OkHttpInspectorRequest(')
    expect(interceptor).toContain('OkHttpInspectorResponse(')
    expect(interceptor).toContain('MobileDiagnosticsImageStore.put(')
    expect(store).toContain('MAX_TOTAL_BYTES')
    expect(store).toContain('MAX_ENTRIES')
    expect(store).toContain('removeEldestEntry()')
    expect(doKit).toContain('.addInterceptor(MobileDiagnosticsImageInterceptor())')
    expect(
      doKit.indexOf('.addInterceptor(MobileDiagnosticsImageInterceptor())')
    ).toBeLessThan(doKit.indexOf('.addInterceptor(DokitCapInterceptor())'))
  })

  it('keeps current-build information and the established OTA action card', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )

    expect(activity).toContain('runtimeInfoRow(')
    expect(activity).toContain('mobile_diagnostics_ota_title')
    expect(activity).toContain('mobile_diagnostics_ota_description')
    expect(activity).toContain('mobile_diagnostics_network_privacy_title')
    expect(activity).not.toContain('text = "↻"')
  })

  it('shows the relaunch state after an update finishes downloading', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )
    const successPath = activity.slice(
      activity.indexOf('is IUpdatesController.FetchUpdateResult.Success'),
      activity.indexOf('is IUpdatesController.FetchUpdateResult.ErrorResult')
    )

    expect(successPath).toContain(
      'setStatus(status, getString(R.string.mobile_diagnostics_relaunching))'
    )
    expect(successPath.indexOf('mobile_diagnostics_relaunching')).toBeLessThan(
      successPath.indexOf('controller.relaunchReactApplicationForModule()')
    )
    expect(successPath).toContain('renderDestination(DESTINATION_OTA)')
    expect(
      successPath.indexOf('controller.relaunchReactApplicationForModule()')
    ).toBeLessThan(successPath.indexOf('renderDestination(DESTINATION_OTA)'))
    expect(successPath).toContain(
      'setStatus(it, getString(R.string.mobile_diagnostics_up_to_date))'
    )
  })

  it('retries a failed OTA download with a bounded backoff before reporting the final error', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )
    const helperStart = activity.indexOf('private suspend fun fetchUpdateWithRetry(')
    const helperEnd = activity.indexOf('private fun runtimeInfoRow(', helperStart)
    const helper = activity.slice(helperStart, helperEnd)

    expect(helperStart).toBeGreaterThanOrEqual(0)
    expect(helper).toContain('OTA_RETRY_ATTEMPTS')
    expect(helper).toContain('OTA_RETRY_DELAY_MS')
    expect(helper).toContain('delay(OTA_RETRY_DELAY_MS * attempt)')
    expect(helper.match(/controller\.fetchUpdate\(\)/g)).toHaveLength(1)
    expect(helper).toContain('while (true)')
    expect(activity).toContain(
      'error(getString(R.string.mobile_diagnostics_download_failed))'
    )
  })

  it('retries the update check and logs each OTA stage before applying', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )

    expect(activity).toContain(
      'when (checkForUpdateWithRetry(controller)) {'
    )
    const checkHelperStart = activity.indexOf(
      'private suspend fun checkForUpdateWithRetry('
    )
    const checkHelperEnd = activity.indexOf(
      'private suspend fun fetchUpdateWithRetry(',
      checkHelperStart
    )
    const checkHelper = activity.slice(checkHelperStart, checkHelperEnd)

    expect(checkHelperStart).toBeGreaterThanOrEqual(0)
    expect(checkHelper).toContain('OTA_RETRY_ATTEMPTS')
    expect(checkHelper).toContain('OTA_RETRY_DELAY_MS')
    expect(checkHelper).toContain('controller.checkForUpdate()')
    expect(checkHelper).toContain('logOtaStage("check"')
    expect(activity).toContain('logOtaStage("fetch"')
    expect(activity).toContain('logOtaStage("reload"')
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
      'mobile_diagnostics_image_preview_loading',
      'mobile_diagnostics_image_preview_unavailable',
      'mobile_diagnostics_storage_search',
      'mobile_diagnostics_storage_save',
      'mobile_diagnostics_storage_delete',
      'mobile_diagnostics_ota_description',
      'mobile_diagnostics_relaunching',
    ]

    for (const name of requiredNames) {
      expect(english).toContain(`name="${name}"`)
      expect(chinese).toContain(`name="${name}"`)
    }
  })
})

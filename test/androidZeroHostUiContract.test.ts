import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('Android zero-host diagnostics UI contract', () => {
  it('keeps the launcher above React Native modal windows without host UI code', () => {
    const launcher = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsLauncherOverlay.kt'
    )

    expect(launcher).toContain('ReactModalHostView')
    expect(launcher).toContain('getDialog')
    expect(launcher).toContain('OnGlobalLayoutListener')
    expect(launcher).toContain('dk_main_launch_icon')
    expect(launcher).not.toContain('text = "D"')
  })

  it('uses compact styled controls and previews large local values', () => {
    const activity = source(
      'android/src/main/java/com/mobilediagnosticskit/MobileDiagnosticsActivity.kt'
    )

    expect(activity).toContain('RippleDrawable')
    expect(activity).toContain('roundedBackground(')
    expect(activity).toContain('Typeface.MONOSPACE')
    expect(activity).toContain('maxLines = 3')
    expect(activity).toContain('showValueDialog(')
    expect(activity).toContain('runtimeInfoRow(')
    expect(activity).not.toContain('android.widget.Button')
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
    ]

    for (const name of requiredNames) {
      expect(english).toContain(`name="${name}"`)
      expect(chinese).toContain(`name="${name}"`)
    }
  })
})

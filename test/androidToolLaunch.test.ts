import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

describe('Android DoKit tool launch contract', () => {
  it('lets DoKit dismiss its panel once before opening React Native tools', () => {
    const {
      renderMobileDiagnosticsDoKitSource,
      renderMobileDiagnosticsLauncherSource,
    } = require(
      '../plugin/withDoKit.js'
    )

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')
    const destinationKit = source.slice(
      source.indexOf('internal object MobileDiagnosticsDoKit'),
      source.length
    )
    const launcher = renderMobileDiagnosticsLauncherSource('com.example.app')

    expect(destinationKit).not.toContain('DoKit.hideToolPanel()')
    expect(destinationKit).toContain(
      'MobileDiagnosticsLauncher.openAfterPanelDismiss(activity, destination)'
    )
    expect(launcher).toContain('activity.window.decorView.post')
    expect(launcher).toContain('.emit(OPEN_EVENT, payload)')
    expect(launcher).not.toContain('DoKit.hideToolPanel()')
  })

  it('generates an app-owned vector icon for Expo Update', () => {
    const {
      renderMobileDiagnosticsDoKitSource,
      renderMobileDiagnosticsExpoUpdateIcon,
    } = require('../plugin/withDoKit.js')

    const source = renderMobileDiagnosticsDoKitSource('com.example.app')
    const icon = renderMobileDiagnosticsExpoUpdateIcon()

    expect(source).toContain(
      '"ota" -> R.drawable.mobile_diagnostics_expo_update'
    )
    expect(icon).toContain('<vector')
    expect(icon).toContain('android:pathData=')
  })
})

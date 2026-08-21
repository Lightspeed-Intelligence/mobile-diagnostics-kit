import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourcePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/MobileDiagnostics.tsx'
)
const nativeLauncherPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/nativeLauncher.ts'
)
const themePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/ui/theme.ts'
)
const contentPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/ui/DiagnosticsContent.tsx'
)
const networkPanelPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/ui/NetworkPanel.tsx'
)
const modelPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/ui/model.ts'
)
const indexPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/index.ts'
)
const nativePresentationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/nativePresentation.ts'
)

describe('React Native diagnostics presentation contract', () => {
  it('opens DoKit destinations as a full-screen page instead of a drawer', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const modal = source.slice(
      source.indexOf('<Modal'),
      source.indexOf('</Modal>')
    )

    expect(modal).toContain('presentationStyle="fullScreen"')
    expect(modal).toContain('transparent={false}')
    expect(modal).toContain('<MobileDiagnosticsScreen')
    expect(modal).not.toContain('style={styles.sheet}')
  })

  it('provides an always-enabled surface factory for build-time injection', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const index = readFileSync(indexPath, 'utf8')

    expect(source).toContain('export function createMobileDiagnosticsSurface')
    expect(source).toContain('<MobileDiagnosticsScreen')
    expect(source).toContain('enabled')
    expect(index).toContain('createMobileDiagnosticsSurface')
  })

  it('defaults native surface close to the package-owned presenter', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const nativePresentation = readFileSync(nativePresentationPath, 'utf8')

    expect(source).toContain('onClose = nativeDiagnosticsPresentation.close')
    expect(nativePresentation).toContain('MobileDiagnosticsPresentation')
    expect(nativePresentation).toContain('nativeModule?.close()')
    expect(nativePresentation).not.toContain('Tipsy')
  })

  it('returns explicit closes to DoKit after the modal hidden state commits', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const nativeLauncher = readFileSync(nativeLauncherPath, 'utf8')

    expect(source).toContain('const inspectorVisibleRef = useRef(false)')
    expect(source).toContain(
      'const inspectorIsVisible = enabled && presentation.visible'
    )
    expect(source).toContain('if (!inspectorWasVisible || inspectorIsVisible) return')
    expect(source).toContain('launcher.returnToPanel()')
    expect(nativeLauncher).toContain('returnToPanel?(): void')
    expect(nativeLauncher).toContain('returnToToolPanel?(): void')
    expect(nativeLauncher).toContain('nativeModule.returnToToolPanel?.()')
    expect(nativeLauncher).toContain('nativeModule.restoreMainIcon()')
  })

  it('only restores the launcher for disabled or unmounted cleanup', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('launcher.restore?.()')
    expect(source).toContain('launcherRef.current.restore?.()')
  })

  it('keeps full-screen Android content below the status bar', () => {
    const theme = readFileSync(themePath, 'utf8')

    expect(theme).toContain("Platform.OS === 'android'")
    expect(theme).toContain('StatusBar.currentHeight ?? 0')
  })

  it('renders each native-selected tool as its own page', () => {
    const content = readFileSync(contentPath, 'utf8')

    expect(content).not.toContain('accessibilityRole="tablist"')
    expect(content).not.toContain('function TabButton')
    expect(content).toContain("destination === 'network'")
    expect(content).toContain("destination === 'storage'")
    expect(content).toContain('title ?? destinationTitle')
  })

  it('keeps an explicit accessible clear action on the Network page', () => {
    const panel = readFileSync(networkPanelPath, 'utf8')
    const labels = readFileSync(modelPath, 'utf8')

    expect(panel).toContain('accessibilityLabel={labels.networkClear}')
    expect(panel).toContain(
      'testID={`${testIDPrefix}.network.clearButton`}'
    )
    expect(panel).toContain('await client.clearRequests()')
    expect(labels).toContain("networkClear: 'Clear requests'")
  })
})

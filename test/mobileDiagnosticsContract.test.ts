import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourcePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/MobileDiagnostics.tsx'
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

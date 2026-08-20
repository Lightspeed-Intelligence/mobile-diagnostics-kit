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
})

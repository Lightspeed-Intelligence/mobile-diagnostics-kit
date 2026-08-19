import {
  initialDiagnosticsPresentation,
  reduceDiagnosticsPresentation,
} from '../src/presentation'

describe('DoKit-owned diagnostics presentation', () => {
  it('stays hidden until a DoKit destination is requested', () => {
    expect(initialDiagnosticsPresentation).toEqual({
      destination: 'storage',
      visible: false,
    })

    expect(
      reduceDiagnosticsPresentation(initialDiagnosticsPresentation, {
        destination: 'ota',
        type: 'open',
      })
    ).toEqual({ destination: 'ota', visible: true })
  })

  it('closes without creating a second launcher state', () => {
    expect(
      reduceDiagnosticsPresentation(
        { destination: 'storage', visible: true },
        { type: 'close' }
      )
    ).toEqual({ destination: 'storage', visible: false })
  })
})

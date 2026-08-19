import { parseDiagnosticsFlag } from '../src/buildGate'

describe('parseDiagnosticsFlag', () => {
  it('requires the explicit build-time value 1', () => {
    expect(parseDiagnosticsFlag('1')).toBe(true)
    expect(parseDiagnosticsFlag('true')).toBe(false)
    expect(parseDiagnosticsFlag('0')).toBe(false)
    expect(parseDiagnosticsFlag(undefined)).toBe(false)
  })
})

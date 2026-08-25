import {
  DEFAULT_LABELS,
  formatPreview,
  mergeLabels,
  parseJsonInput,
  statusLabel,
  toTestIdSegment,
} from '../src/ui/model'

describe('diagnostics UI model', () => {
  it('merges host copy without removing safe defaults', () => {
    const labels = mergeLabels({ storageTab: 'Local flags' })

    expect(labels.storageTab).toBe('Local flags')
    expect(labels.otaTab).toBe(DEFAULT_LABELS.otaTab)
  })

  it('uses Simplified Chinese defaults for Chinese system locales', () => {
    const labels = mergeLabels({}, 'zh-Hans-CN')

    expect(labels.networkTab).toBe('网络抓包')
    expect(labels.storageTab).toBe('本地状态')
    expect(labels.otaTab).toBe('Expo 热更新')
    expect(labels.otaUnsupported).toBe('此构建未启用 Expo 热更新')
  })

  it('keeps English defaults for non-Chinese locales and host overrides', () => {
    const labels = mergeLabels({ otaTab: 'OTA' }, 'en-US')

    expect(labels.networkTab).toBe('Network')
    expect(labels.storageTab).toBe('Local state')
    expect(labels.otaTab).toBe('OTA')
  })

  it('parses JSON field values without evaluating code', () => {
    expect(parseJsonInput('false')).toBe(false)
    expect(parseJsonInput('{"count":2}')).toEqual({ count: 2 })
    expect(() => parseJsonInput('globalThis.secret')).toThrow('valid JSON')
  })

  it('formats missing and structured values predictably', () => {
    const labels = mergeLabels()
    expect(formatPreview(undefined, labels)).toBe(labels.missingValue)
    expect(formatPreview({ enabled: true }, labels)).toBe('{"enabled":true}')
  })

  it('maps OTA states to stable host-overridable copy', () => {
    const labels = mergeLabels({ otaUpToDate: 'No update available' })
    expect(statusLabel('up-to-date', labels)).toBe('No update available')
    expect(statusLabel('failed', labels)).toBe(labels.otaFailed)
  })

  it('creates deterministic test id segments from configured field names', () => {
    expect(toTestIdSegment('has seen/welcome')).toBe('hasSeenWelcome')
    expect(toTestIdSegment('')).toBe('field')
  })
})

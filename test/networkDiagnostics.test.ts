import {
  createCurlCommand,
  filterNetworkRequests,
  formatNetworkBody,
  networkResourceType,
  sortNetworkRequests,
  type NetworkRequestSnapshot,
} from '../src/networkDiagnostics'

function request(
  overrides: Partial<NetworkRequestSnapshot> = {}
): NetworkRequestSnapshot {
  return {
    duration: 120,
    host: 'api.example.com',
    id: 'request-1',
    method: 'GET',
    mimeType: 'application/json',
    path: '/v1/items?limit=20',
    requestBody: '',
    requestBytes: 32,
    requestHeaders: [{ name: 'Accept', value: 'application/json' }],
    responseBody: '{"ok":true}',
    responseBodyBinary: false,
    responseBytes: 128,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    startTime: 1_700_000_000_000,
    status: '200',
    url: 'https://api.example.com/v1/items?limit=20',
    ...overrides,
  }
}

describe('network diagnostics model', () => {
  it('sorts requests chronologically by default without mutating the input', () => {
    const requests = [
      request({ id: 'newer', startTime: 1_700_000_000_200 }),
      request({ id: 'older', startTime: 1_700_000_000_100 }),
    ]

    expect(sortNetworkRequests(requests).map(({ id }) => id)).toEqual([
      'older',
      'newer',
    ])
    expect(requests.map(({ id }) => id)).toEqual(['newer', 'older'])
  })

  it('supports reverse chronological order', () => {
    const requests = [
      request({ id: 'older', startTime: 1_700_000_000_100 }),
      request({ id: 'newer', startTime: 1_700_000_000_200 }),
    ]

    expect(sortNetworkRequests(requests, 'descending').map(({ id }) => id)).toEqual([
      'newer',
      'older',
    ])
  })

  it('classifies response media before HTTP method semantics', () => {
    expect(
      networkResourceType(
        request({ method: 'GET', mimeType: 'image/webp' })
      )
    ).toBe('image')
    expect(
      networkResourceType(
        request({ method: 'POST', mimeType: 'video/mp4' })
      )
    ).toBe('media')
    expect(networkResourceType(request())).toBe('fetch')
    expect(
      networkResourceType(
        request({ method: 'OPTIONS', mimeType: 'application/octet-stream' })
      )
    ).toBe('other')
  })

  it('filters by type, errors, and browser-style free text', () => {
    const requests = [
      request(),
      request({
        host: 'cdn.example.com',
        id: 'image-1',
        mimeType: 'image/png',
        path: '/covers/hero.png',
        status: '200',
        url: 'https://cdn.example.com/covers/hero.png',
      }),
      request({
        host: 'api.example.com',
        id: 'error-1',
        path: '/v1/profile',
        status: 'Network Error',
        url: 'https://api.example.com/v1/profile',
      }),
    ]

    expect(filterNetworkRequests(requests, 'image', '')).toHaveLength(1)
    expect(filterNetworkRequests(requests, 'errors', '')[0]?.id).toBe(
      'error-1'
    )
    expect(filterNetworkRequests(requests, 'all', 'PROFILE')[0]?.id).toBe(
      'error-1'
    )
  })

  it('pretty prints JSON without changing the raw captured body', () => {
    const raw = '{"nested":{"enabled":true}}'

    expect(formatNetworkBody(raw, false)).toBe(
      '{\n  "nested": {\n    "enabled": true\n  }\n}'
    )
    expect(formatNetworkBody(raw, false)).not.toBe(raw)
    expect(formatNetworkBody('', true, 2048)).toBe(
      'Binary response body - 2.0 KB - text preview unavailable'
    )
  })

  it('creates a shell-safe cURL command from the complete capture', () => {
    const command = createCurlCommand(
      request({
        method: 'POST',
        requestBody: '{"name":"O\'Brien"}',
        requestHeaders: [
          { name: 'Authorization', value: 'Bearer full-value' },
          { name: 'X-Name', value: "O'Brien" },
        ],
      })
    )

    expect(command).toContain("curl 'https://api.example.com/v1/items?limit=20'")
    expect(command).toContain("-X 'POST'")
    expect(command).toContain("-H 'Authorization: Bearer full-value'")
    expect(command).toContain("-H 'X-Name: O'\\''Brien'")
    expect(command).toContain("--data-raw '{\"name\":\"O'\\''Brien\"}'")
    expect(command).not.toContain('[REDACTED]')
  })
})

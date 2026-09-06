export interface NetworkHeader {
  name: string
  value: string
}

export interface NetworkRequestSnapshot {
  duration: number
  host: string
  id: string
  method: string
  mimeType: string
  path: string
  requestBody: string
  requestBytes: number
  requestHeaders: readonly NetworkHeader[]
  responseBody: string
  responseBodyBinary: boolean
  responseBytes: number
  responseHeaders: readonly NetworkHeader[]
  startTime: number
  status: string
  url: string
}

export type NetworkResourceType = 'fetch' | 'image' | 'media' | 'other'
export type NetworkFilter = 'all' | NetworkResourceType | 'errors'

const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|svg|avif|heic)$/i
const MEDIA_EXTENSIONS = /\.(?:mp4|mov|m4v|webm|mp3|m4a|wav|aac|ogg)$/i
const FETCH_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export function networkResourceType(
  request: NetworkRequestSnapshot
): NetworkResourceType {
  const mimeType = request.mimeType.toLowerCase()
  const path = request.url.split('?')[0] ?? request.url
  if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.test(path)) {
    return 'image'
  }
  if (
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    MEDIA_EXTENSIONS.test(path)
  ) {
    return 'media'
  }
  if (
    mimeType.includes('json') ||
    mimeType.startsWith('text/') ||
    mimeType.includes('xml') ||
    FETCH_METHODS.has(request.method.toUpperCase())
  ) {
    return 'fetch'
  }
  return 'other'
}

export function isNetworkError(request: NetworkRequestSnapshot): boolean {
  const status = request.status.trim()
  if (!/^\d+$/.test(status)) return true
  const code = Number(status)
  return code <= 0 || code >= 400
}

export function filterNetworkRequests(
  requests: readonly NetworkRequestSnapshot[],
  filter: NetworkFilter,
  query: string
): NetworkRequestSnapshot[] {
  const needle = query.trim().toLowerCase()
  return requests.filter((request) => {
    const matchesType =
      filter === 'all' ||
      (filter === 'errors'
        ? isNetworkError(request)
        : networkResourceType(request) === filter)
    if (!matchesType) return false
    if (!needle) return true
    return [
      request.url,
      request.host,
      request.path,
      request.method,
      request.status,
      request.mimeType,
      networkResourceType(request),
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })
}

export function formatBytes(bytes: number): string {
  const safeBytes = Math.max(0, bytes)
  if (safeBytes >= 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`
  }
  if (safeBytes >= 1024) return `${(safeBytes / 1024).toFixed(1)} KB`
  return `${Math.round(safeBytes)} B`
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds <= 0) return '-'
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  return `${(milliseconds / 1000).toFixed(2)} s`
}

export function formatNetworkBody(
  body: string,
  binary: boolean,
  byteCount = 0,
  maximumCharacters = 120_000
): string {
  if (binary) {
    return `Binary response body - ${formatBytes(byteCount)} - text preview unavailable`
  }
  if (!body) return 'No body'

  let formatted = body
  try {
    formatted = JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    // Non-JSON bodies remain byte-for-byte readable.
  }
  if (formatted.length <= maximumCharacters) return formatted
  return `${formatted.slice(0, maximumCharacters)}\n\n... truncated for on-device display`
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function createCurlCommand(request: NetworkRequestSnapshot): string {
  const parts = [
    `curl ${shellQuote(request.url)}`,
    `  -X ${shellQuote(request.method.toUpperCase() || 'GET')}`,
    ...request.requestHeaders.map(
      ({ name, value }) => `  -H ${shellQuote(`${name}: ${value}`)}`
    ),
  ]
  if (request.requestBody) {
    parts.push(`  --data-raw ${shellQuote(request.requestBody)}`)
  }
  return parts.join(' \\\n')
}

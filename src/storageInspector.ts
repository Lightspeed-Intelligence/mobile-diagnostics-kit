/** The subset of react-native-mmkv used by this package. */
export interface MMKVStorageLike {
  getAllKeys(): string[]
  getString(key: string): string | undefined
  getNumber(key: string): number | undefined
  getBoolean(key: string): boolean | undefined
  set(key: string, value: string | number | boolean): void
  remove(key: string): void
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export interface StorageEntryConfig {
  /** Exact MMKV key. Wildcards are deliberately unsupported. */
  key: string
  label?: string
  description?: string
  /** Object path inside a JSON value, such as ['state'] for Zustand persist. */
  valuePath?: readonly string[]
  /** When present, only these top-level fields are visible and editable. */
  allowedFields?: readonly string[]
  /** Whole-entry deletion is destructive and requires an explicit opt-in. */
  allowReset?: boolean
  /** Additional host-specific field names that must be redacted. */
  sensitiveFields?: readonly string[]
}

export interface StorageInspectorConfig {
  entries: readonly StorageEntryConfig[]
}

export type StorageValueKind = 'string' | 'number' | 'boolean' | 'missing'

export interface StorageEntrySnapshot {
  key: string
  label: string
  description?: string
  kind: StorageValueKind
  value: JsonValue | undefined
  isObject: boolean
  canReset: boolean
}

export type StorageInspectorErrorCode =
  | 'KEY_NOT_ALLOWED'
  | 'FIELD_NOT_ALLOWED'
  | 'SENSITIVE_FIELD'
  | 'ENTRY_NOT_OBJECT'
  | 'RESET_NOT_ALLOWED'
  | 'INVALID_VALUE'

export class StorageInspectorError extends Error {
  readonly code: StorageInspectorErrorCode

  constructor(
    code: StorageInspectorErrorCode,
    message = 'Storage operation is not allowed'
  ) {
    super(message)
    this.name = 'StorageInspectorError'
    this.code = code
  }
}

export interface StorageInspector {
  listEntries(): StorageEntrySnapshot[]
  getEntry(key: string): StorageEntrySnapshot
  setField(key: string, field: string, value: JsonValue): void
  removeField(key: string, field: string): void
  resetEntry(key: string): void
}

const SENSITIVE_NAME =
  /(^|[_\-.])(access_token|refresh_token|id_token|token|authorization|cookie|secret|password|passwd|api[_-]?key|private[_-]?key|client[_-]?secret|credential|sentry)([_\-.]|$)/i

export const REDACTED = '[REDACTED]'

function normalizeFieldName(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter}`).toLowerCase()
}

function isSensitiveName(name: string, explicit: readonly string[]): boolean {
  const normalized = normalizeFieldName(name)
  return (
    explicit.some((field) => normalizeFieldName(field) === normalized) ||
    SENSITIVE_NAME.test(name) ||
    SENSITIVE_NAME.test(normalized)
  )
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isJsonValue)
  }
  return false
}

function parseStoredString(value: string): JsonValue {
  try {
    const parsed: unknown = JSON.parse(value)
    return isJsonValue(parsed) ? parsed : value
  } catch {
    return value
  }
}

function redactValue(value: JsonValue, explicit: readonly string[]): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, explicit))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        isSensitiveName(key, explicit)
          ? REDACTED
          : redactValue(child, explicit),
      ])
    )
  }
  return value
}

function filterFields(
  value: JsonValue | undefined,
  config: StorageEntryConfig
): JsonValue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value

  const selected = config.allowedFields
    ? Object.fromEntries(
        config.allowedFields
          .filter((field) => Object.prototype.hasOwnProperty.call(value, field))
          .map((field) => [field, value[field]])
      )
    : value

  return redactValue(selected, config.sensitiveFields ?? [])
}

function objectAtPath(
  value: JsonValue | undefined,
  path: readonly string[]
): JsonObject | undefined {
  let current = value
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    current = current[segment]
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    return undefined
  }
  return current
}

function replaceObjectAtPath(
  root: JsonObject,
  path: readonly string[],
  replacement: JsonObject
): JsonObject {
  if (path.length === 0) return replacement
  const [head, ...tail] = path
  const child = root[head]
  if (!child || typeof child !== 'object' || Array.isArray(child)) {
    throw new StorageInspectorError(
      'ENTRY_NOT_OBJECT',
      'The configured MMKV value path is not an object'
    )
  }
  return { ...root, [head]: replaceObjectAtPath(child, tail, replacement) }
}

function readRawValue(
  storage: MMKVStorageLike,
  key: string
): { kind: StorageValueKind; value: JsonValue | undefined } {
  try {
    const value = storage.getString(key)
    if (value !== undefined) return { kind: 'string', value: parseStoredString(value) }
  } catch {
    // MMKV throws when a getter does not match the stored native type.
  }
  try {
    const value = storage.getNumber(key)
    if (value !== undefined) return { kind: 'number', value }
  } catch {
    // Try the remaining supported native type.
  }
  try {
    const value = storage.getBoolean(key)
    if (value !== undefined) return { kind: 'boolean', value }
  } catch {
    // Unreadable values are treated as missing; native errors stay private.
  }
  return { kind: 'missing', value: undefined }
}

function assertJsonValue(value: unknown): asserts value is JsonValue {
  if (!isJsonValue(value)) {
    throw new StorageInspectorError(
      'INVALID_VALUE',
      'The field value must be valid JSON'
    )
  }
}

export function createStorageInspector(
  storage: MMKVStorageLike,
  config: StorageInspectorConfig
): StorageInspector {
  const entryMap = new Map(config.entries.map((entry) => [entry.key, entry]))

  const getConfig = (key: string): StorageEntryConfig => {
    const entry = entryMap.get(key)
    if (!entry) {
      throw new StorageInspectorError('KEY_NOT_ALLOWED')
    }
    return entry
  }

  const assertFieldAllowed = (entry: StorageEntryConfig, field: string) => {
    if (!field.trim()) {
      throw new StorageInspectorError('FIELD_NOT_ALLOWED')
    }
    if (entry.allowedFields && !entry.allowedFields.includes(field)) {
      throw new StorageInspectorError('FIELD_NOT_ALLOWED')
    }
    if (isSensitiveName(field, entry.sensitiveFields ?? [])) {
      throw new StorageInspectorError('SENSITIVE_FIELD')
    }
  }

  const getEntry = (key: string): StorageEntrySnapshot => {
    const entry = getConfig(key)
    const raw = readRawValue(storage, key)
    const target = objectAtPath(raw.value, entry.valuePath ?? [])
    const value = filterFields(target, entry)
    return {
      key,
      label: entry.label ?? key,
      description: entry.description,
      kind: raw.kind,
      value,
      isObject:
        value !== null && typeof value === 'object' && !Array.isArray(value),
      canReset: entry.allowReset === true,
    }
  }

  const updateTarget = (
    key: string,
    transform: (target: JsonObject) => JsonObject
  ) => {
    const entry = getConfig(key)
    const raw = readRawValue(storage, key)
    const root = objectAtPath(raw.value, [])
    const target = objectAtPath(raw.value, entry.valuePath ?? [])
    if (!root || !target) {
      throw new StorageInspectorError('ENTRY_NOT_OBJECT')
    }
    storage.set(
      key,
      JSON.stringify(
        replaceObjectAtPath(root, entry.valuePath ?? [], transform(target))
      )
    )
  }

  return {
    listEntries: () => config.entries.map((entry) => getEntry(entry.key)),
    getEntry,
    setField: (key, field, value) => {
      const entry = getConfig(key)
      assertFieldAllowed(entry, field)
      assertJsonValue(value)
      updateTarget(key, (target) => ({ ...target, [field]: value }))
    },
    removeField: (key, field) => {
      const entry = getConfig(key)
      assertFieldAllowed(entry, field)
      updateTarget(key, (target) => {
        const next = { ...target }
        delete next[field]
        return next
      })
    },
    resetEntry: (key) => {
      const entry = getConfig(key)
      if (!entry.allowReset) {
        throw new StorageInspectorError('RESET_NOT_ALLOWED')
      }
      storage.remove(key)
    },
  }
}

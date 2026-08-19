import {
  createStorageInspector,
  REDACTED,
  StorageInspectorError,
  type MMKVStorageLike,
} from '../src/storageInspector'

type StoredValue = string | number | boolean

function createMemoryStorage(initial: Record<string, StoredValue>) {
  const values = new Map<string, StoredValue>(Object.entries(initial))
  const storage: MMKVStorageLike = {
    getAllKeys: () => [...values.keys()],
    getString: (key) => {
      const value = values.get(key)
      return typeof value === 'string' ? value : undefined
    },
    getNumber: (key) => {
      const value = values.get(key)
      return typeof value === 'number' ? value : undefined
    },
    getBoolean: (key) => {
      const value = values.get(key)
      return typeof value === 'boolean' ? value : undefined
    },
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  }
  return { storage, values }
}

describe('createStorageInspector', () => {
  it('lists only explicitly configured MMKV keys', () => {
    const { storage } = createMemoryStorage({
      'onboarding-storage': JSON.stringify({ hasSeenWelcome: true }),
      'account-storage': JSON.stringify({ displayName: 'Example' }),
    })

    const inspector = createStorageInspector(storage, {
      entries: [{ key: 'onboarding-storage' }],
    })

    expect(inspector.listEntries().map((entry) => entry.key)).toEqual([
      'onboarding-storage',
    ])
  })

  it('recursively redacts common and host-declared sensitive fields', () => {
    const { storage } = createMemoryStorage({
      'onboarding-storage': JSON.stringify({
        hasSeenWelcome: true,
        nested: {
          accessToken: 'hidden',
          sentryDsn: 'hidden',
          internalCredential: 'hidden',
        },
      }),
    })

    const inspector = createStorageInspector(storage, {
      entries: [
        {
          key: 'onboarding-storage',
          sensitiveFields: ['internalCredential'],
        },
      ],
    })

    expect(inspector.getEntry('onboarding-storage').value).toEqual({
      hasSeenWelcome: true,
      nested: {
        accessToken: REDACTED,
        sentryDsn: REDACTED,
        internalCredential: REDACTED,
      },
    })
  })

  it('adds, updates, and removes fields without changing siblings', () => {
    const { storage, values } = createMemoryStorage({
      'onboarding-storage': JSON.stringify({
        hasSeenWelcome: true,
        hasSeenTour: true,
      }),
    })
    const inspector = createStorageInspector(storage, {
      entries: [{ key: 'onboarding-storage' }],
    })

    inspector.setField('onboarding-storage', 'hasSeenWelcome', false)
    inspector.setField('onboarding-storage', 'experimentBucket', 2)
    inspector.removeField('onboarding-storage', 'hasSeenTour')

    expect(JSON.parse(String(values.get('onboarding-storage')))).toEqual({
      hasSeenWelcome: false,
      experimentBucket: 2,
    })
  })

  it('preserves a Zustand envelope when editing a configured value path', () => {
    const { storage, values } = createMemoryStorage({
      'onboarding-storage': JSON.stringify({
        state: {
          onboarding: { hasSeenWelcome: true },
          unrelatedPreference: 'keep-me',
        },
        version: 3,
      }),
    })
    const inspector = createStorageInspector(storage, {
      entries: [
        {
          key: 'onboarding-storage',
          valuePath: ['state', 'onboarding'],
          allowedFields: ['hasSeenWelcome'],
        },
      ],
    })

    inspector.setField('onboarding-storage', 'hasSeenWelcome', false)

    expect(JSON.parse(String(values.get('onboarding-storage')))).toEqual({
      state: {
        onboarding: { hasSeenWelcome: false },
        unrelatedPreference: 'keep-me',
      },
      version: 3,
    })
  })

  it('rejects unknown keys, unknown fields, and sensitive writes', () => {
    const { storage } = createMemoryStorage({
      'onboarding-storage': JSON.stringify({ hasSeenWelcome: true }),
    })
    const inspector = createStorageInspector(storage, {
      entries: [
        {
          key: 'onboarding-storage',
          allowedFields: ['hasSeenWelcome'],
        },
      ],
    })

    expect(() => inspector.setField('unknown', 'flag', true)).toThrowError(
      StorageInspectorError
    )
    expect(() =>
      inspector.setField('onboarding-storage', 'unlistedField', true)
    ).toThrowError(StorageInspectorError)
    expect(() =>
      inspector.setField('onboarding-storage', 'accessToken', 'hidden')
    ).toThrowError(StorageInspectorError)
  })

  it('requires explicit permission before deleting an entire entry', () => {
    const { storage } = createMemoryStorage({
      'onboarding-storage': JSON.stringify({ hasSeenWelcome: true }),
    })
    const inspector = createStorageInspector(storage, {
      entries: [{ key: 'onboarding-storage' }],
    })

    expect(() => inspector.resetEntry('onboarding-storage')).toThrowError(
      StorageInspectorError
    )
  })
})

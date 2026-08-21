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
  it('lists every MMKV key while preserving configured metadata and edit access', () => {
    const { storage } = createMemoryStorage({
      'onboarding-storage': JSON.stringify({ hasSeenWelcome: true }),
      'account-storage': JSON.stringify({ displayName: 'Example' }),
      'single-chat-water-guide:v1:user-123': JSON.stringify({
        hasShownInCycle: true,
      }),
    })

    const inspector = createStorageInspector(storage, {
      entries: [{ key: 'onboarding-storage', label: 'Onboarding flags' }],
    })

    expect(inspector.listEntries()).toMatchObject([
      {
        canEdit: true,
        key: 'onboarding-storage',
        label: 'Onboarding flags',
      },
      {
        canEdit: false,
        canReset: false,
        key: 'account-storage',
        label: 'account-storage',
      },
      {
        canEdit: false,
        canReset: false,
        key: 'single-chat-water-guide:v1:user-123',
        label: 'single-chat-water-guide:v1:user-123',
      },
    ])
  })

  it('keeps automatically discovered entries read only', () => {
    const { storage } = createMemoryStorage({
      'single-chat-water-guide:v1:user-123': JSON.stringify({
        hasShownInCycle: true,
      }),
    })
    const inspector = createStorageInspector(storage, { entries: [] })

    expect(
      inspector.getEntry('single-chat-water-guide:v1:user-123').value
    ).toEqual({ hasShownInCycle: true })
    expect(() =>
      inspector.setField(
        'single-chat-water-guide:v1:user-123',
        'hasShownInCycle',
        false
      )
    ).toThrowError(StorageInspectorError)
    expect(() =>
      inspector.removeField(
        'single-chat-water-guide:v1:user-123',
        'hasShownInCycle'
      )
    ).toThrowError(StorageInspectorError)
    expect(() =>
      inspector.resetEntry('single-chat-water-guide:v1:user-123')
    ).toThrowError(StorageInspectorError)
  })

  it('shows primitive values from automatically discovered entries', () => {
    const { storage } = createMemoryStorage({
      'feature-enabled': true,
      'launch-count': 3,
      theme: 'dark',
    })
    const inspector = createStorageInspector(storage, { entries: [] })

    expect(
      inspector.listEntries().map(({ key, value }) => ({ key, value }))
    ).toEqual([
      { key: 'feature-enabled', value: true },
      { key: 'launch-count', value: 3 },
      { key: 'theme', value: 'dark' },
    ])
  })

  it('redacts the whole value when an automatically discovered key is sensitive', () => {
    const { storage } = createMemoryStorage({
      'session-access-token': 'do-not-show',
    })
    const inspector = createStorageInspector(storage, { entries: [] })

    expect(inspector.getEntry('session-access-token').value).toBe(REDACTED)
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

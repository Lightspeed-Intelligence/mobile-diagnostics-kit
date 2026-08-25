import {
  createOtaController,
  getOtaRuntimeInfo,
  type UpdatesLike,
} from '../src/otaController'

function createUpdates(overrides: Partial<UpdatesLike> = {}): UpdatesLike {
  return {
    isEnabled: true,
    checkForUpdateAsync: async () => ({ isAvailable: true }),
    fetchUpdateAsync: async () => ({ isNew: true }),
    reloadAsync: async () => undefined,
    ...overrides,
  }
}

describe('createOtaController', () => {
  it('checks, fetches, and reloads an available compatible Expo update', async () => {
    const calls: string[] = []
    const controller = createOtaController({
      enabled: true,
      updates: createUpdates({
        checkForUpdateAsync: async () => {
          calls.push('check')
          return { isAvailable: true }
        },
        fetchUpdateAsync: async () => {
          calls.push('fetch')
          return { isNew: true }
        },
        reloadAsync: async () => {
          calls.push('reload')
        },
      }),
    })

    await expect(controller.applyAvailableUpdate()).resolves.toEqual({
      status: 'reloaded',
    })
    expect(calls).toEqual(['check', 'fetch', 'reload'])
  })

  it('does not call Expo Updates when the tool or runtime is disabled', async () => {
    await expect(
      createOtaController({ enabled: false }).applyAvailableUpdate()
    ).resolves.toEqual({ status: 'disabled' })
    await expect(
      createOtaController({
        enabled: true,
        updates: createUpdates({ isEnabled: false }),
      }).applyAvailableUpdate()
    ).resolves.toEqual({ status: 'unsupported' })
  })

  it('returns stable safe error codes instead of provider details', async () => {
    const controller = createOtaController({
      enabled: true,
      updates: createUpdates({
        checkForUpdateAsync: async () => {
          throw new Error('https://updates.invalid/private?token=do-not-return')
        },
      }),
    })

    await expect(controller.applyAvailableUpdate()).resolves.toEqual({
      status: 'failed',
      code: 'CHECK_FAILED',
    })
  })
})

describe('getOtaRuntimeInfo', () => {
  it('reports the exact source branch and currently running Expo update', () => {
    const runtimeInfo = getOtaRuntimeInfo(
      createUpdates({
        channel: 'fe-feat-story-7057850087-debug',
        createdAt: new Date('2026-08-21T08:15:30.000Z'),
        isEmbeddedLaunch: false,
        runtimeVersion: '1.4.4',
        updateId: '11111111-2222-3333-4444-555555555555',
      }),
      'feat/story-7057850087'
    )

    expect(runtimeInfo).toEqual({
      channel: 'fe-feat-story-7057850087-debug',
      createdAt: '2026-08-21T08:15:30.000Z',
      launchSource: 'ota',
      runtimeVersion: '1.4.4',
      sourceBranch: 'feat/story-7057850087',
      updateId: '11111111-2222-3333-4444-555555555555',
    })
  })

  it('uses stable missing values for unavailable or invalid metadata', () => {
    expect(
      getOtaRuntimeInfo(
        createUpdates({
          createdAt: new Date(Number.NaN),
          isEmbeddedLaunch: true,
        }),
        '   '
      )
    ).toEqual({
      channel: null,
      createdAt: null,
      launchSource: 'embedded',
      runtimeVersion: null,
      sourceBranch: null,
      updateId: null,
    })
  })
})

import {
  createOtaController,
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

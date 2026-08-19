export interface UpdatesLike {
  readonly isEnabled?: boolean
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>
  fetchUpdateAsync(): Promise<{ isNew?: boolean }>
  reloadAsync(): Promise<void>
}

export type OtaApplyResult =
  | { status: 'disabled' }
  | { status: 'unsupported' }
  | { status: 'up-to-date' }
  | { status: 'downloaded' }
  | { status: 'reloaded' }
  | {
      status: 'failed'
      code: 'CHECK_FAILED' | 'FETCH_FAILED' | 'RELOAD_FAILED'
    }

export interface OtaController {
  applyAvailableUpdate(): Promise<OtaApplyResult>
}

export interface OtaControllerOptions {
  /** The expo-updates module or a compatible adapter. */
  updates?: UpdatesLike
  /** Must be explicitly enabled by the host build. */
  enabled: boolean
  /** Set false to download now and reload on the next app launch. */
  reloadAfterFetch?: boolean
}

export function createOtaController({
  updates,
  enabled,
  reloadAfterFetch = true,
}: OtaControllerOptions): OtaController {
  return {
    async applyAvailableUpdate() {
      if (!enabled) return { status: 'disabled' }
      if (!updates || updates.isEnabled === false) {
        return { status: 'unsupported' }
      }

      let availability: { isAvailable: boolean }
      try {
        availability = await updates.checkForUpdateAsync()
      } catch {
        return { status: 'failed', code: 'CHECK_FAILED' }
      }
      if (!availability.isAvailable) return { status: 'up-to-date' }

      let fetched: { isNew?: boolean }
      try {
        fetched = await updates.fetchUpdateAsync()
      } catch {
        return { status: 'failed', code: 'FETCH_FAILED' }
      }
      if (fetched.isNew === false || !reloadAfterFetch) {
        return { status: 'downloaded' }
      }

      try {
        await updates.reloadAsync()
        return { status: 'reloaded' }
      } catch {
        return { status: 'failed', code: 'RELOAD_FAILED' }
      }
    },
  }
}

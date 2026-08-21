export interface UpdatesLike {
  readonly isEnabled?: boolean
  readonly updateId?: string | null
  readonly channel?: string | null
  readonly runtimeVersion?: string | null
  readonly createdAt?: Date | null
  readonly isEmbeddedLaunch?: boolean
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>
  fetchUpdateAsync(): Promise<{ isNew?: boolean }>
  reloadAsync(): Promise<void>
}

export interface OtaRuntimeInfo {
  readonly sourceBranch: string | null
  readonly updateId: string | null
  readonly createdAt: string | null
  readonly channel: string | null
  readonly runtimeVersion: string | null
  readonly launchSource: 'embedded' | 'ota' | 'unknown'
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

function optionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function getOtaRuntimeInfo(
  updates?: UpdatesLike,
  sourceBranch?: string
): OtaRuntimeInfo {
  const updateId = optionalText(updates?.updateId)
  const createdAt = updates?.createdAt
  const createdAtTimestamp = createdAt?.getTime()
  const launchSource =
    updates?.isEmbeddedLaunch === true
      ? 'embedded'
      : updates?.isEmbeddedLaunch === false && updateId
        ? 'ota'
        : 'unknown'

  return {
    channel: optionalText(updates?.channel),
    createdAt:
      typeof createdAtTimestamp === 'number' &&
      Number.isFinite(createdAtTimestamp)
        ? createdAt!.toISOString()
        : null,
    launchSource,
    runtimeVersion: optionalText(updates?.runtimeVersion),
    sourceBranch: optionalText(sourceBranch),
    updateId,
  }
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

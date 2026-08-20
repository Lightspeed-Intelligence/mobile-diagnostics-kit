import { DeviceEventEmitter, NativeModules } from 'react-native'
import {
  parseDiagnosticsDestination,
  type DiagnosticsDestination,
} from './presentation'

export const DIAGNOSTICS_OPEN_EVENT = 'mobile-diagnostics-kit.open'

export interface DiagnosticsLauncher {
  restore?(): void
  subscribe(listener: (destination: DiagnosticsDestination) => void): () => void
}

interface NativeDiagnosticsLauncherModule {
  restoreMainIcon(): void
}

const nativeModule = NativeModules.MobileDiagnosticsLauncher as
  | NativeDiagnosticsLauncherModule
  | undefined

export const nativeDiagnosticsLauncher: DiagnosticsLauncher = {
  restore() {
    nativeModule?.restoreMainIcon()
  },
  subscribe(listener) {
    const subscription = DeviceEventEmitter.addListener(
      DIAGNOSTICS_OPEN_EVENT,
      (payload: unknown) => {
        const destination =
          payload && typeof payload === 'object' && 'destination' in payload
            ? (payload as { destination?: unknown }).destination
            : undefined
        listener(parseDiagnosticsDestination(destination))
      }
    )
    return () => subscription.remove()
  },
}

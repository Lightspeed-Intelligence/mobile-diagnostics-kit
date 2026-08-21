import { DeviceEventEmitter, NativeModules } from 'react-native'
import {
  parseDiagnosticsDestination,
  type DiagnosticsDestination,
} from './presentation'

export const DIAGNOSTICS_OPEN_EVENT = 'mobile-diagnostics-kit.open'

export interface DiagnosticsLauncher {
  openPanel?(): void
  restore?(): void
  returnToPanel?(): void
  subscribe(listener: (destination: DiagnosticsDestination) => void): () => void
}

interface NativeDiagnosticsLauncherModule {
  showToolPanel?(): void
  restoreMainIcon(): void
  returnToToolPanel?(): void
}

const nativeModule = NativeModules.MobileDiagnosticsLauncher as
  | NativeDiagnosticsLauncherModule
  | undefined

export const nativeDiagnosticsLauncher: DiagnosticsLauncher = {
  openPanel() {
    nativeModule?.showToolPanel?.()
  },
  restore() {
    nativeModule?.restoreMainIcon()
  },
  returnToPanel() {
    if (!nativeModule) return
    if (nativeModule.returnToToolPanel) {
      nativeModule.returnToToolPanel?.()
      return
    }
    nativeModule.restoreMainIcon()
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

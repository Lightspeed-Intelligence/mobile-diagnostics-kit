import { DeviceEventEmitter } from 'react-native'
import {
  parseDiagnosticsDestination,
  type DiagnosticsDestination,
} from './presentation'

export const DIAGNOSTICS_OPEN_EVENT = 'mobile-diagnostics-kit.open'

export interface DiagnosticsLauncher {
  subscribe(listener: (destination: DiagnosticsDestination) => void): () => void
}

export const nativeDiagnosticsLauncher: DiagnosticsLauncher = {
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

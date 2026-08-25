import { NativeModules } from 'react-native'
import type { NetworkRequestSnapshot } from './networkDiagnostics'

interface NativeNetworkDiagnosticsModule {
  clearRequests(): Promise<void>
  copyToClipboard(value: string): Promise<void>
  getRequests(): Promise<NetworkRequestSnapshot[]>
  isCaptureEnabled(): Promise<boolean>
  setCaptureEnabled(enabled: boolean): Promise<void>
}

export interface NetworkDiagnosticsClient
  extends NativeNetworkDiagnosticsModule {
  available: boolean
}

const nativeModule = NativeModules.MobileDiagnosticsNetwork as
  | NativeNetworkDiagnosticsModule
  | undefined

export const nativeNetworkDiagnostics: NetworkDiagnosticsClient = nativeModule
  ? {
      available: true,
      clearRequests: () => nativeModule.clearRequests(),
      copyToClipboard: (value) => nativeModule.copyToClipboard(value),
      getRequests: () => nativeModule.getRequests(),
      isCaptureEnabled: () => nativeModule.isCaptureEnabled(),
      setCaptureEnabled: (enabled) => nativeModule.setCaptureEnabled(enabled),
    }
  : {
      available: false,
      async clearRequests() {},
      async copyToClipboard() {},
      async getRequests() {
        return []
      },
      async isCaptureEnabled() {
        return false
      },
      async setCaptureEnabled() {},
    }

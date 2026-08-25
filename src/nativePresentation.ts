import { NativeModules } from 'react-native'

export interface DiagnosticsPresentationController {
  close(): void
}

interface NativeDiagnosticsPresentationModule {
  close(): void
}

const nativeModule = NativeModules.MobileDiagnosticsPresentation as
  | NativeDiagnosticsPresentationModule
  | undefined

export const nativeDiagnosticsPresentation: DiagnosticsPresentationController = {
  close() {
    nativeModule?.close()
  },
}

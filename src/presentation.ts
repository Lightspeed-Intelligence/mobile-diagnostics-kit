export type DiagnosticsDestination = 'storage' | 'ota'

export interface DiagnosticsPresentation {
  destination: DiagnosticsDestination
  visible: boolean
}

export type DiagnosticsPresentationAction =
  | { destination: DiagnosticsDestination; type: 'open' }
  | { type: 'close' }

export const initialDiagnosticsPresentation: DiagnosticsPresentation = {
  destination: 'storage',
  visible: false,
}

export function reduceDiagnosticsPresentation(
  state: DiagnosticsPresentation,
  action: DiagnosticsPresentationAction
): DiagnosticsPresentation {
  if (action.type === 'open') {
    return { destination: action.destination, visible: true }
  }
  return { ...state, visible: false }
}

export function parseDiagnosticsDestination(
  value: unknown
): DiagnosticsDestination {
  return value === 'ota' ? 'ota' : 'storage'
}

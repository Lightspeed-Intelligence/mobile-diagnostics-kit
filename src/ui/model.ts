import type { OtaApplyResult } from '../otaController'
import type { JsonValue, StorageEntrySnapshot } from '../storageInspector'

export interface DiagnosticsLabels {
  openPanel: string
  closePanel: string
  eyebrow: string
  networkTab: string
  storageTab: string
  otaTab: string
  securityTitle: string
  securityBody: string
  searchPlaceholder: string
  emptyTitle: string
  emptyBody: string
  missingValue: string
  refresh: string
  refreshStorage: string
  editField: (field: string) => string
  deleteField: (field: string) => string
  deleteConfirmTitle: string
  deleteConfirmBody: (field: string) => string
  cancel: string
  delete: string
  editorTitle: string
  fieldNameLabel: string
  fieldNamePlaceholder: string
  fieldValueLabel: string
  fieldValuePlaceholder: string
  saveField: string
  fieldSaved: string
  fieldRemoved: string
  resetEntry: string
  resetConfirmTitle: string
  resetConfirmBody: string
  resetDone: string
  operationFailedTitle: string
  operationFailedBody: string
  entryNotObject: string
  otaTitle: string
  otaDescription: string
  applyUpdate: string
  otaIdle: string
  otaWorking: string
  otaReloaded: string
  otaDownloaded: string
  otaUpToDate: string
  otaUnsupported: string
  otaDisabled: string
  otaFailed: string
  networkTitle: string
  networkBody: string
  networkSearchPlaceholder: string
  networkRefresh: string
  networkClear: string
  networkCapture: string
  networkRequests: string
  networkErrors: string
  networkReceived: string
  networkShowing: (visible: number, total: number) => string
  networkEmptyTitle: string
  networkEmptyBody: string
  networkUnavailable: string
  networkRequestTab: string
  networkResponseTab: string
  networkCopyCurl: string
  networkCopyBody: string
  networkClearConfirmTitle: string
  networkClearConfirmBody: string
  networkGeneral: string
  networkRequestHeaders: string
  networkPayload: string
  networkResponseHeaders: string
  networkResponseBody: string
}

export const DEFAULT_LABELS: DiagnosticsLabels = {
  openPanel: 'Open diagnostics',
  closePanel: 'Close diagnostics',
  eyebrow: 'ON-DEVICE DIAGNOSTICS',
  networkTab: 'Network',
  storageTab: 'Local state',
  otaTab: 'Expo update',
  securityTitle: 'Private by default',
  securityBody:
    'Only host allow-listed MMKV entries are shown. Credential-like fields are always redacted, and this panel never uploads local content.',
  searchPlaceholder: 'Search configured entries',
  emptyTitle: 'No entries available',
  emptyBody:
    'Add explicit MMKV keys in the host configuration. The default allow-list is empty.',
  missingValue: 'Missing',
  refresh: 'Refresh',
  refreshStorage: 'Refresh local state',
  editField: (field) => `Edit ${field}`,
  deleteField: (field) => `Delete ${field}`,
  deleteConfirmTitle: 'Delete this field?',
  deleteConfirmBody: (field) =>
    `${field} will be removed without changing sibling fields.`,
  cancel: 'Cancel',
  delete: 'Delete',
  editorTitle: 'Add or update a field',
  fieldNameLabel: 'Field name',
  fieldNamePlaceholder: 'hasSeenWelcome',
  fieldValueLabel: 'JSON value',
  fieldValuePlaceholder: 'false, 0, "text", or an object',
  saveField: 'Save field',
  fieldSaved: 'Field saved',
  fieldRemoved: 'Field removed',
  resetEntry: 'Reset entire entry',
  resetConfirmTitle: 'Reset this local entry?',
  resetConfirmBody:
    'This removes only the selected MMKV entry. It does not modify remote account state.',
  resetDone: 'Entry reset',
  operationFailedTitle: 'Operation unavailable',
  operationFailedBody: 'The requested local operation could not be completed.',
  entryNotObject: 'This value is not a JSON object and cannot be edited by field.',
  otaTitle: 'Check for an Expo update',
  otaDescription:
    'Uses the installed runtime and channel. It does not accept arbitrary update URLs or expose manifest details.',
  applyUpdate: 'Check and apply update',
  otaIdle: 'Ready to check the current runtime and channel',
  otaWorking: 'Checking for an update…',
  otaReloaded: 'Update downloaded; the app is reloading',
  otaDownloaded: 'Update downloaded for the next launch',
  otaUpToDate: 'This installation is up to date',
  otaUnsupported: 'Expo updates are unavailable in this build',
  otaDisabled: 'Update actions are disabled in this build',
  otaFailed: 'Update failed; provider details remain hidden',
  networkTitle: 'Network inspection',
  networkBody:
    'Captured by the native DoKit engine and presented locally. Request and response contents are never uploaded by this package.',
  networkSearchPlaceholder: 'Search host, path, method, or status',
  networkRefresh: 'Refresh',
  networkClear: 'Clear requests',
  networkCapture: 'Capture',
  networkRequests: 'Requests',
  networkErrors: 'Errors',
  networkReceived: 'Received',
  networkShowing: (visible, total) => `Showing ${visible} of ${total}`,
  networkEmptyTitle: 'No requests captured',
  networkEmptyBody: 'Use the app, then return here to inspect requests.',
  networkUnavailable: 'The native network capture module is unavailable in this build.',
  networkRequestTab: 'Request',
  networkResponseTab: 'Response',
  networkCopyCurl: 'Copy cURL',
  networkCopyBody: 'Copy body',
  networkClearConfirmTitle: 'Clear captured requests?',
  networkClearConfirmBody: 'This removes the current in-memory request list.',
  networkGeneral: 'General',
  networkRequestHeaders: 'Request Headers',
  networkPayload: 'Payload',
  networkResponseHeaders: 'Response Headers',
  networkResponseBody: 'Response Body',
}

export type ApplyState = 'idle' | 'working' | OtaApplyResult['status']

export function mergeLabels(
  overrides: Partial<DiagnosticsLabels> = {}
): DiagnosticsLabels {
  return { ...DEFAULT_LABELS, ...overrides }
}

export function parseJsonInput(raw: string): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    throw new Error('The field value must be valid JSON')
  }
}

export function formatPreview(
  value: StorageEntrySnapshot['value'],
  labels: DiagnosticsLabels
): string {
  if (value === undefined) return labels.missingValue
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export function statusLabel(
  status: ApplyState,
  labels: DiagnosticsLabels
): string {
  switch (status) {
    case 'working':
      return labels.otaWorking
    case 'reloaded':
      return labels.otaReloaded
    case 'downloaded':
      return labels.otaDownloaded
    case 'up-to-date':
      return labels.otaUpToDate
    case 'unsupported':
      return labels.otaUnsupported
    case 'disabled':
      return labels.otaDisabled
    case 'failed':
      return labels.otaFailed
    default:
      return labels.otaIdle
  }
}

export function toTestIdSegment(value: string): string {
  const parts = value.match(/[A-Za-z0-9]+/g) ?? []
  if (parts.length === 0) return 'field'
  return parts
    .map((part, index) => {
      if (index === 0) return part.charAt(0).toLowerCase() + part.slice(1)
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}

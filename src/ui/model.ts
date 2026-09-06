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
  otaCurrentTitle: string
  otaBranch: string
  otaUpdateId: string
  otaCreatedAt: string
  otaChannel: string
  otaRuntimeVersion: string
  otaLaunchSource: string
  otaEmbeddedSource: string
  otaDownloadedSource: string
  otaUnknownSource: string
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
    'All MMKV entries are shown read-only. Host-configured entries may be edited; credential-like keys and fields are always redacted.',
  searchPlaceholder: 'Search MMKV entries',
  emptyTitle: 'No entries available',
  emptyBody: 'No keys are stored in this MMKV instance yet.',
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
  otaCurrentTitle: 'Current RN bundle',
  otaBranch: 'Branch',
  otaUpdateId: 'Update ID',
  otaCreatedAt: 'Published',
  otaChannel: 'Channel',
  otaRuntimeVersion: 'Runtime version',
  otaLaunchSource: 'Loaded from',
  otaEmbeddedSource: 'Embedded bundle',
  otaDownloadedSource: 'OTA update',
  otaUnknownSource: 'Unknown',
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

export const SIMPLIFIED_CHINESE_LABELS: DiagnosticsLabels = {
  openPanel: '打开诊断工具',
  closePanel: '关闭诊断工具',
  eyebrow: '设备诊断',
  networkTab: '网络抓包',
  storageTab: '本地状态',
  otaTab: 'Expo 热更新',
  securityTitle: '数据仅保留在本机',
  securityBody:
    '展示全部 MMKV 条目；自动发现的条目只读，宿主配置的条目可编辑，凭据类 key 和字段始终隐藏。',
  searchPlaceholder: '搜索 MMKV 条目',
  emptyTitle: '暂无可用条目',
  emptyBody: '当前 MMKV 实例中还没有已存储的 key。',
  missingValue: '未设置',
  refresh: '刷新',
  refreshStorage: '刷新本地状态',
  editField: (field) => `编辑 ${field}`,
  deleteField: (field) => `删除 ${field}`,
  deleteConfirmTitle: '删除这个字段？',
  deleteConfirmBody: (field) => `将删除 ${field}，同级字段不会受到影响。`,
  cancel: '取消',
  delete: '删除',
  editorTitle: '新增或更新字段',
  fieldNameLabel: '字段名',
  fieldNamePlaceholder: 'hasSeenWelcome',
  fieldValueLabel: 'JSON 值',
  fieldValuePlaceholder: 'false、0、"文本" 或对象',
  saveField: '保存字段',
  fieldSaved: '字段已保存',
  fieldRemoved: '字段已删除',
  resetEntry: '重置整个条目',
  resetConfirmTitle: '重置这个本地条目？',
  resetConfirmBody: '只会删除选中的 MMKV 条目，不会修改服务端账号状态。',
  resetDone: '条目已重置',
  operationFailedTitle: '操作不可用',
  operationFailedBody: '无法完成请求的本地操作。',
  entryNotObject: '该值不是 JSON 对象，无法按字段编辑。',
  otaTitle: '检查 Expo 热更新',
  otaDescription:
    '使用当前安装包的运行时和频道；不接受任意更新地址，也不展示更新清单详情。',
  applyUpdate: '检查并应用更新',
  otaIdle: '可以检查当前运行时和频道的更新',
  otaWorking: '正在检查更新…',
  otaReloaded: '更新已下载，应用正在重新加载',
  otaDownloaded: '更新已下载，将在下次启动时生效',
  otaUpToDate: '当前已经是最新版本',
  otaUnsupported: '此构建未启用 Expo 热更新',
  otaDisabled: '此构建已禁用更新操作',
  otaFailed: '更新失败，服务端详情仍保持隐藏',
  otaCurrentTitle: '当前 RN 包',
  otaBranch: '分支',
  otaUpdateId: '更新 ID',
  otaCreatedAt: '发布时间',
  otaChannel: '频道',
  otaRuntimeVersion: '运行时版本',
  otaLaunchSource: '加载来源',
  otaEmbeddedSource: '内置包',
  otaDownloadedSource: 'OTA 更新',
  otaUnknownSource: '未知',
  networkTitle: '网络抓包',
  networkBody:
    '请求由原生 DoKit 引擎捕获并仅在本机展示，本工具不会上传请求或响应内容。',
  networkSearchPlaceholder: '搜索域名、路径、方法或状态码',
  networkRefresh: '刷新',
  networkClear: '清空请求',
  networkCapture: '抓包',
  networkRequests: '请求',
  networkErrors: '错误',
  networkReceived: '已接收',
  networkShowing: (visible, total) => `显示 ${visible}/${total} 条`,
  networkEmptyTitle: '尚未捕获请求',
  networkEmptyBody: '请先操作应用，再返回这里查看请求。',
  networkUnavailable: '此构建未提供原生网络抓包模块。',
  networkRequestTab: '请求',
  networkResponseTab: '响应',
  networkCopyCurl: '复制 cURL',
  networkCopyBody: '复制正文',
  networkClearConfirmTitle: '清空已捕获的请求？',
  networkClearConfirmBody: '将删除当前保存在内存中的请求列表。',
  networkGeneral: '概览',
  networkRequestHeaders: '请求头',
  networkPayload: '请求参数',
  networkResponseHeaders: '响应头',
  networkResponseBody: '响应正文',
}

export type ApplyState = 'idle' | 'working' | OtaApplyResult['status']

export function mergeLabels(
  overrides: Partial<DiagnosticsLabels> = {},
  locale = systemLocale()
): DiagnosticsLabels {
  const defaults = /^zh(?:[-_]|$)/i.test(locale)
    ? SIMPLIFIED_CHINESE_LABELS
    : DEFAULT_LABELS
  return { ...defaults, ...overrides }
}

function systemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return 'en'
  }
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

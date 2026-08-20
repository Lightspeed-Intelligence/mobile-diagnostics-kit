import { useEffect, useReducer } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
} from 'react-native'
import {
  nativeDiagnosticsLauncher,
  type DiagnosticsLauncher,
} from './nativeLauncher'
import type { UpdatesLike } from './otaController'
import {
  initialDiagnosticsPresentation,
  reduceDiagnosticsPresentation,
  type DiagnosticsDestination,
} from './presentation'
import type {
  MMKVStorageLike,
  StorageEntryConfig,
} from './storageInspector'
import { DiagnosticsContent } from './ui/DiagnosticsContent'
import type { DiagnosticsLabels } from './ui/model'
import { styles } from './ui/theme'

export const DEFAULT_STORAGE_ENTRIES: readonly StorageEntryConfig[] = []

interface DiagnosticsBaseProps {
  enabled?: boolean
  storage?: MMKVStorageLike
  entries?: readonly StorageEntryConfig[]
  updates?: UpdatesLike
  reloadAfterFetch?: boolean
  title?: string
  labels?: Partial<DiagnosticsLabels>
  testIDPrefix?: string
}

export interface MobileDiagnosticsProps extends DiagnosticsBaseProps {
  /** DoKit's native custom kit is the only launcher. */
  launcher?: DiagnosticsLauncher
}

export interface MobileDiagnosticsScreenProps extends DiagnosticsBaseProps {
  initialDestination?: DiagnosticsDestination
  /** Host-owned dismissal for native presenters with hidden navigation chrome. */
  onClose?: () => void
}

/**
 * Mount once at the RN root. It renders no launcher of its own and opens only
 * after the native DoKit custom kit emits a destination request.
 */
export function MobileDiagnostics({
  enabled = false,
  launcher = nativeDiagnosticsLauncher,
  ...contentProps
}: MobileDiagnosticsProps) {
  const [presentation, dispatch] = useReducer(
    reduceDiagnosticsPresentation,
    initialDiagnosticsPresentation
  )

  useEffect(() => {
    if (!enabled) return
    return launcher.subscribe((destination) => {
      dispatch({ destination, type: 'open' })
    })
  }, [enabled, launcher])

  if (!enabled) return null

  const close = () => dispatch({ type: 'close' as const })
  return (
    <Modal
      animationType="slide"
      onRequestClose={close}
      presentationStyle="fullScreen"
      transparent={false}
      visible={presentation.visible}
    >
      <MobileDiagnosticsScreen
        {...contentProps}
        enabled={enabled}
        initialDestination={presentation.destination}
        onClose={close}
      />
    </Modal>
  )
}

/** Full-screen content used by native DoKit plugin presenters such as iOS. */
export function MobileDiagnosticsScreen({
  enabled = false,
  initialDestination = 'storage',
  onClose,
  ...contentProps
}: MobileDiagnosticsScreenProps) {
  if (!enabled) return null

  const testIDPrefix = contentProps.testIDPrefix ?? 'mobileDiagnostics'
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screenBackdrop}
    >
      <SafeAreaView
        style={styles.screen}
        testID={`${testIDPrefix}.screen`}
      >
        <DiagnosticsContent
          active
          destination={initialDestination}
          enabled={enabled}
          entries={contentProps.entries ?? DEFAULT_STORAGE_ENTRIES}
          labels={contentProps.labels}
          onClose={onClose}
          reloadAfterFetch={contentProps.reloadAfterFetch ?? true}
          storage={contentProps.storage}
          testIDPrefix={testIDPrefix}
          title={contentProps.title}
          updates={contentProps.updates}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

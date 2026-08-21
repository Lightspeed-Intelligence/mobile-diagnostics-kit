import { useEffect, useReducer, useRef, type ComponentType } from 'react'
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
import { nativeDiagnosticsPresentation } from './nativePresentation'
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
  /** Exact source branch embedded by the host build or update pipeline. */
  sourceBranch?: string
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

export interface MobileDiagnosticsSurfaceProps {
  initialDestination?: DiagnosticsDestination
}

export type MobileDiagnosticsSurfaceOptions = Omit<
  MobileDiagnosticsScreenProps,
  'enabled' | 'initialDestination'
>

/**
 * Creates a host-neutral AppRegistry surface for an injected native presenter.
 * Calling this factory is the build-time opt-in, so the returned surface is
 * always enabled and needs no runtime environment flag.
 */
export function createMobileDiagnosticsSurface(
  options: MobileDiagnosticsSurfaceOptions
): ComponentType<MobileDiagnosticsSurfaceProps> {
  return function MobileDiagnosticsSurface({
    initialDestination = 'storage',
  }: MobileDiagnosticsSurfaceProps) {
    return (
      <MobileDiagnosticsScreen
        {...options}
        enabled
        initialDestination={initialDestination}
      />
    )
  }
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
  const inspectorVisibleRef = useRef(false)
  const launcherRef = useRef(launcher)
  launcherRef.current = launcher

  useEffect(() => {
    if (!enabled) return
    return launcher.subscribe((destination) => {
      inspectorVisibleRef.current = true
      dispatch({ destination, type: 'open' })
    })
  }, [enabled, launcher])

  useEffect(() => {
    const inspectorWasVisible = inspectorVisibleRef.current
    const inspectorIsVisible = enabled && presentation.visible
    inspectorVisibleRef.current = inspectorIsVisible

    if (!inspectorWasVisible || inspectorIsVisible) return
    if (enabled && launcher.returnToPanel) {
      launcher.returnToPanel()
      return
    }
    launcher.restore?.()
  }, [enabled, launcher, presentation.visible])

  useEffect(
    () => () => {
      if (!inspectorVisibleRef.current) return
      inspectorVisibleRef.current = false
      launcherRef.current.restore?.()
    },
    []
  )

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
  onClose = nativeDiagnosticsPresentation.close,
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
          sourceBranch={contentProps.sourceBranch}
          storage={contentProps.storage}
          testIDPrefix={testIDPrefix}
          title={contentProps.title}
          updates={contentProps.updates}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ComponentType,
} from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
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
import { colors, styles } from './ui/theme'

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
  /** Native DoKit launcher used for tool selection and panel control. */
  launcher?: DiagnosticsLauncher
}

export interface MobileDiagnosticsModalLauncherProps {
  accessibilityLabel?: string
  enabled?: boolean
  label?: string
  launcher?: Pick<DiagnosticsLauncher, 'openPanel'>
  testID?: string
  topInset?: number
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

const MODAL_LAUNCHER_MARGIN = 12

/**
 * Renders a bounded Android entry inside a host-owned React Native Modal.
 * Android Dialog windows cover DoKit's activity-owned normal floating icon,
 * so this proxy opens the same native DoKit panel without adding an overlay.
 */
export function MobileDiagnosticsModalLauncher({
  accessibilityLabel,
  enabled = false,
  label = 'DoKit',
  launcher = nativeDiagnosticsLauncher,
  testID,
  topInset = 0,
}: MobileDiagnosticsModalLauncherProps) {
  const buttonStyle = useMemo(
    () => [
      modalLauncherStyles.button,
      { top: topInset + MODAL_LAUNCHER_MARGIN },
    ],
    [topInset]
  )

  if (!enabled || Platform.OS !== 'android' || !launcher.openPanel) return null

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={(event) => {
        event.stopPropagation()
        launcher.openPanel?.()
      }}
      style={buttonStyle}
      testID={testID}
    >
      <Text accessible={false} style={modalLauncherStyles.label}>
        {label}
      </Text>
    </Pressable>
  )
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

const modalLauncherStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderColor: colors.accent,
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 2,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: MODAL_LAUNCHER_MARGIN,
    width: 48,
    zIndex: 1000,
  },
  label: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
  },
})

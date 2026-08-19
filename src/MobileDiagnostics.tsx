import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from 'react-native'
import { createOtaController, type UpdatesLike } from './otaController'
import {
  createStorageInspector,
  type MMKVStorageLike,
  type StorageEntryConfig,
  type StorageEntrySnapshot,
  type StorageInspector,
} from './storageInspector'
import { mergeLabels, type DiagnosticsLabels } from './ui/model'
import { OtaPanel } from './ui/OtaPanel'
import { StoragePanel } from './ui/StoragePanel'
import { styles } from './ui/theme'

export const DEFAULT_STORAGE_ENTRIES: readonly StorageEntryConfig[] = []

export interface MobileDiagnosticsProps {
  /** Must be explicitly enabled by an internal build. Defaults to false. */
  enabled?: boolean
  /** An MMKV instance or structurally compatible adapter. */
  storage?: MMKVStorageLike
  /** Exact MMKV keys and fields the host permits this panel to access. */
  entries?: readonly StorageEntryConfig[]
  /** The expo-updates module or a compatible adapter. */
  updates?: UpdatesLike
  /** Download an update now but wait until the next launch before reloading. */
  reloadAfterFetch?: boolean
  title?: string
  labels?: Partial<DiagnosticsLabels>
  testIDPrefix?: string
}

type Tab = 'storage' | 'ota'

export function MobileDiagnostics({
  enabled = false,
  storage,
  entries = DEFAULT_STORAGE_ENTRIES,
  updates,
  reloadAfterFetch = true,
  title = 'Developer Tools',
  labels: labelOverrides,
  testIDPrefix = 'mobileDiagnostics',
}: MobileDiagnosticsProps) {
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<Tab>('storage')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<StorageEntrySnapshot[]>([])
  const labels = useMemo(() => mergeLabels(labelOverrides), [labelOverrides])

  const inspector = useMemo<StorageInspector | null>(() => {
    if (!storage) return null
    return createStorageInspector(storage, { entries })
  }, [entries, storage])

  const otaController = useMemo(
    () =>
      createOtaController({
        enabled,
        reloadAfterFetch,
        updates,
      }),
    [enabled, reloadAfterFetch, updates]
  )

  const refresh = useCallback(() => {
    if (!inspector) {
      setSnapshots([])
      return
    }
    try {
      setSnapshots(inspector.listEntries())
    } catch {
      // Malformed local data must never crash the host application.
      setSnapshots([])
    }
  }, [inspector])

  useEffect(() => {
    if (visible) refresh()
  }, [refresh, visible])

  useEffect(() => {
    setSelectedKey(null)
  }, [entries, storage])

  if (!enabled) return null

  return (
    <>
      <Pressable
        accessibilityLabel={labels.openPanel}
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.floatingButton,
          pressed && styles.pressed,
        ]}
        testID={`${testIDPrefix}.openButton`}
      >
        <Text style={styles.floatingGlyph}>D</Text>
        <View style={styles.floatingDot} />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        transparent
        visible={visible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.backdrop}
        >
          <SafeAreaView
            style={styles.sheet}
            testID={`${testIDPrefix}.screen`}
          >
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>{labels.eyebrow}</Text>
                <Text style={styles.title}>{title}</Text>
              </View>
              <Pressable
                accessibilityLabel={labels.closePanel}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setVisible(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
                testID={`${testIDPrefix}.closeButton`}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View accessibilityRole="tablist" style={styles.tabBar}>
              <TabButton
                active={tab === 'storage'}
                label={labels.storageTab}
                onPress={() => setTab('storage')}
                testID={`${testIDPrefix}.storageTabButton`}
              />
              <TabButton
                active={tab === 'ota'}
                label={labels.otaTab}
                onPress={() => setTab('ota')}
                testID={`${testIDPrefix}.otaTabButton`}
              />
            </View>

            {tab === 'storage' ? (
              <StoragePanel
                inspector={inspector}
                labels={labels}
                onRefresh={refresh}
                onSelect={setSelectedKey}
                selectedKey={selectedKey}
                snapshots={snapshots}
                testIDPrefix={testIDPrefix}
              />
            ) : (
              <OtaPanel
                controller={otaController}
                labels={labels}
                testIDPrefix={testIDPrefix}
              />
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

function TabButton({
  active,
  label,
  onPress,
  testID,
}: {
  active: boolean
  label: string
  onPress: () => void
  testID: string
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        active && styles.tabActive,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

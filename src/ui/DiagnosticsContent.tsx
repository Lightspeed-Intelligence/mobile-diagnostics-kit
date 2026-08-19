import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { createOtaController, type UpdatesLike } from '../otaController'
import type { DiagnosticsDestination } from '../presentation'
import {
  createStorageInspector,
  type MMKVStorageLike,
  type StorageEntryConfig,
  type StorageEntrySnapshot,
  type StorageInspector,
} from '../storageInspector'
import { mergeLabels, type DiagnosticsLabels } from './model'
import { OtaPanel } from './OtaPanel'
import { StoragePanel } from './StoragePanel'
import { styles } from './theme'

export interface DiagnosticsContentProps {
  active: boolean
  destination: DiagnosticsDestination
  enabled: boolean
  entries: readonly StorageEntryConfig[]
  labels?: Partial<DiagnosticsLabels>
  onClose?: () => void
  reloadAfterFetch: boolean
  storage?: MMKVStorageLike
  testIDPrefix: string
  title: string
  updates?: UpdatesLike
}

export function DiagnosticsContent({
  active,
  destination,
  enabled,
  entries,
  labels: labelOverrides,
  onClose,
  reloadAfterFetch,
  storage,
  testIDPrefix,
  title,
  updates,
}: DiagnosticsContentProps) {
  const [tab, setTab] = useState<DiagnosticsDestination>(destination)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<StorageEntrySnapshot[]>([])
  const labels = useMemo(() => mergeLabels(labelOverrides), [labelOverrides])

  const inspector = useMemo<StorageInspector | null>(() => {
    if (!storage) return null
    return createStorageInspector(storage, { entries })
  }, [entries, storage])

  const otaController = useMemo(
    () =>
      createOtaController({ enabled, reloadAfterFetch, updates }),
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
      setSnapshots([])
    }
  }, [inspector])

  useEffect(() => setTab(destination), [destination])
  useEffect(() => {
    if (active) refresh()
  }, [active, refresh])
  useEffect(() => setSelectedKey(null), [entries, storage])

  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{labels.eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        {onClose ? (
          <Pressable
            accessibilityLabel={labels.closePanel}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.pressed,
            ]}
            testID={`${testIDPrefix}.closeButton`}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        ) : null}
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

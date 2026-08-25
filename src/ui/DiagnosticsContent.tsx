import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  createOtaController,
  getOtaRuntimeInfo,
  type UpdatesLike,
} from '../otaController'
import type { DiagnosticsDestination } from '../presentation'
import {
  createStorageInspector,
  type MMKVStorageLike,
  type StorageEntryConfig,
  type StorageEntrySnapshot,
  type StorageInspector,
} from '../storageInspector'
import { mergeLabels, type DiagnosticsLabels } from './model'
import { NetworkPanel } from './NetworkPanel'
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
  sourceBranch?: string
  storage?: MMKVStorageLike
  testIDPrefix: string
  title?: string
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
  sourceBranch,
  storage,
  testIDPrefix,
  title,
  updates,
}: DiagnosticsContentProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<StorageEntrySnapshot[]>([])
  const labels = useMemo(() => mergeLabels(labelOverrides), [labelOverrides])
  const destinationTitle = {
    network: labels.networkTab,
    ota: labels.otaTab,
    storage: labels.storageTab,
  }[destination]

  const inspector = useMemo<StorageInspector | null>(() => {
    if (!storage) return null
    return createStorageInspector(storage, { entries })
  }, [entries, storage])

  const otaController = useMemo(
    () =>
      createOtaController({ enabled, reloadAfterFetch, updates }),
    [enabled, reloadAfterFetch, updates]
  )
  const otaRuntimeInfo = useMemo(
    () => getOtaRuntimeInfo(updates, sourceBranch),
    [sourceBranch, updates]
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

  useEffect(() => {
    if (active) refresh()
  }, [active, refresh])
  useEffect(() => setSelectedKey(null), [destination, entries, storage])

  return (
    <>
      <View style={styles.header}>
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
            <Text style={styles.closeText}>‹</Text>
          </Pressable>
        ) : null}
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{labels.eyebrow}</Text>
          <Text style={styles.title}>{title ?? destinationTitle}</Text>
        </View>
      </View>

      {destination === 'network' ? (
        <NetworkPanel
          labels={labels}
          testIDPrefix={testIDPrefix}
        />
      ) : destination === 'storage' ? (
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
          runtimeInfo={otaRuntimeInfo}
          testIDPrefix={testIDPrefix}
        />
      )}
    </>
  )
}

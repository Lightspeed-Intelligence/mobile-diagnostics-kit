import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import {
  filterNetworkRequests,
  formatBytes,
  isNetworkError,
  type NetworkFilter,
  type NetworkRequestSnapshot,
} from '../networkDiagnostics'
import {
  nativeNetworkDiagnostics,
  type NetworkDiagnosticsClient,
} from '../nativeNetworkDiagnostics'
import type { DiagnosticsLabels } from './model'
import { NetworkDetail } from './NetworkDetail'
import { NetworkRequestRow } from './NetworkRequestRow'
import { networkColors, networkStyles as styles } from './networkTheme'

const FILTERS: readonly NetworkFilter[] = [
  'all',
  'fetch',
  'image',
  'media',
  'other',
  'errors',
]

interface NetworkPanelProps {
  client?: NetworkDiagnosticsClient
  labels: DiagnosticsLabels
  testIDPrefix: string
}

export function NetworkPanel({
  client = nativeNetworkDiagnostics,
  labels,
  testIDPrefix,
}: NetworkPanelProps) {
  const [captureEnabled, setCaptureEnabled] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<NetworkFilter>('all')
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [requests, setRequests] = useState<NetworkRequestSnapshot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(async (showSpinner = false) => {
    if (!client.available) {
      setError(labels.networkUnavailable)
      setRequests([])
      return
    }
    if (showSpinner) setRefreshing(true)
    try {
      const [nextRequests, nextCaptureEnabled] = await Promise.all([
        client.getRequests(),
        client.isCaptureEnabled(),
      ])
      setRequests(nextRequests)
      setCaptureEnabled(nextCaptureEnabled)
      setError('')
    } catch {
      setError(labels.operationFailedBody)
    } finally {
      if (showSpinner) setRefreshing(false)
    }
  }, [client, labels.networkUnavailable, labels.operationFailedBody])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 1000)
    return () => clearInterval(timer)
  }, [refresh])

  const filtered = useMemo(
    () => filterNetworkRequests(requests, filter, query),
    [filter, query, requests]
  )
  const selected = requests.find(({ id }) => id === selectedId) ?? null
  const errorCount = requests.filter(isNetworkError).length
  const receivedBytes = requests.reduce(
    (total, request) => total + request.responseBytes,
    0
  )

  const selectRequest = useCallback((id: string) => setSelectedId(id), [])
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NetworkRequestSnapshot>) => (
      <NetworkRequestRow
        duration={item.duration}
        host={item.host}
        id={item.id}
        method={item.method}
        onSelect={selectRequest}
        path={item.path}
        responseBytes={item.responseBytes}
        status={item.status}
        testID={`${testIDPrefix}.network.request.${toTestId(item.id)}Button`}
      />
    ),
    [selectRequest, testIDPrefix]
  )

  const toggleCapture = async (enabled: boolean) => {
    try {
      await client.setCaptureEnabled(enabled)
      setCaptureEnabled(enabled)
      await refresh()
    } catch {
      setError(labels.operationFailedBody)
    }
  }

  const clearCapturedRequests = async () => {
    try {
      await client.clearRequests()
      await refresh()
    } catch {
      setError(labels.operationFailedBody)
    }
  }

  const confirmClearRequests = () => {
    Alert.alert(
      labels.networkClearConfirmTitle,
      labels.networkClearConfirmBody,
      [
        { text: labels.cancel, style: 'cancel' },
        {
          onPress: () => void clearCapturedRequests(),
          style: 'destructive',
          text: labels.networkClear,
        },
      ]
    )
  }

  if (selected) {
    return (
      <NetworkDetail
        client={client}
        labels={labels}
        onBack={() => setSelectedId(null)}
        request={selected}
        testIDPrefix={testIDPrefix}
      />
    )
  }

  const header = (
    <View style={styles.toolbar}>
      <View style={styles.metrics}>
        <Metric label={labels.networkRequests} value={String(requests.length)} />
        <Metric
          error={errorCount > 0}
          label={labels.networkErrors}
          value={String(errorCount)}
        />
        <Metric label={labels.networkReceived} value={formatBytes(receivedBytes)} />
        <View style={styles.capture}>
          <Switch
            accessibilityLabel={labels.networkCapture}
            onValueChange={(enabled) => void toggleCapture(enabled)}
            testID={`${testIDPrefix}.network.captureSwitch`}
            thumbColor="#FFFFFF"
            trackColor={{ false: networkColors.border, true: networkColors.accent }}
            value={captureEnabled}
          />
          <Text style={styles.metricLabel}>{labels.networkCapture}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel={labels.networkRefresh}
          accessibilityRole="button"
          onPress={() => void refresh(true)}
          style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.75 }]}
          testID={`${testIDPrefix}.network.refreshButton`}
        >
          <Text style={styles.actionButtonText}>{labels.networkRefresh}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={labels.networkClear}
          accessibilityRole="button"
          onPress={confirmClearRequests}
          style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.75 }]}
          testID={`${testIDPrefix}.network.clearButton`}
        >
          <Text style={[styles.actionButtonText, styles.destructiveText]}>
            {labels.networkClear}
          </Text>
        </Pressable>
      </View>

      <TextInput
        accessibilityLabel={labels.networkSearchPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder={labels.networkSearchPlaceholder}
        placeholderTextColor={networkColors.muted}
        style={styles.searchInput}
        testID={`${testIDPrefix}.network.searchField`}
        value={query}
      />

      <ScrollView
        contentContainerStyle={styles.filterContent}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        testID={`${testIDPrefix}.network.filter.list`}
      >
        {FILTERS.map((option) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: option === filter }}
            key={option}
            onPress={() => setFilter(option)}
            style={({ pressed }) => [
              styles.filterButton,
              option === filter && styles.filterButtonActive,
              pressed && { opacity: 0.75 },
            ]}
            testID={`${testIDPrefix}.network.filter.${option}Button`}
          >
            <Text
              style={[
                styles.filterText,
                option === filter && styles.filterTextActive,
              ]}
            >
              {filterLabel(option)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.showing}>
        {labels.networkShowing(filtered.length, requests.length)}
      </Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  )

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={filtered}
      keyExtractor={keyExtractor}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{labels.networkEmptyTitle}</Text>
          <Text style={styles.emptyBody}>
            {error || labels.networkEmptyBody}
          </Text>
        </View>
      }
      ListHeaderComponent={header}
      onRefresh={() => void refresh(true)}
      refreshing={refreshing}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      testID={`${testIDPrefix}.network.list`}
    />
  )
}

function Metric({
  error = false,
  label,
  value,
}: {
  error?: boolean
  label: string
  value: string
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, error && styles.metricValueError]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function keyExtractor(request: NetworkRequestSnapshot): string {
  return request.id
}

function filterLabel(filter: NetworkFilter): string {
  return filter.charAt(0).toUpperCase() + filter.slice(1)
}

function toTestId(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '_') || 'request'
}

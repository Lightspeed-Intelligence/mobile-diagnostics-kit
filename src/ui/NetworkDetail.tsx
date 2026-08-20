import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import {
  createCurlCommand,
  formatBytes,
  formatDuration,
  formatNetworkBody,
  type NetworkHeader,
  type NetworkRequestSnapshot,
} from '../networkDiagnostics'
import type { NetworkDiagnosticsClient } from '../nativeNetworkDiagnostics'
import type { DiagnosticsLabels } from './model'
import { MethodBadge, StatusText } from './NetworkRequestRow'
import { networkStyles as styles } from './networkTheme'

interface NetworkDetailProps {
  client: NetworkDiagnosticsClient
  labels: DiagnosticsLabels
  onBack: () => void
  request: NetworkRequestSnapshot
  testIDPrefix: string
}

export function NetworkDetail({
  client,
  labels,
  onBack,
  request,
  testIDPrefix,
}: NetworkDetailProps) {
  const [tab, setTab] = useState<'request' | 'response'>('request')

  useEffect(() => setTab('request'), [request.id])

  const copy = (value: string) => void client.copyToClipboard(value)
  const requestGeneral = [
    ['Request URL', request.url],
    ['Method', request.method],
    ['Started', formatStartTime(request.startTime)],
    ['Duration', formatDuration(request.duration)],
    ['Transferred', `up ${formatBytes(request.requestBytes)} / down ${formatBytes(request.responseBytes)}`],
  ] as const
  const responseGeneral = [
    ['Status', request.status],
    ['Content Type', request.mimeType || '-'],
    ['Duration', formatDuration(request.duration)],
    ['Received', formatBytes(request.responseBytes)],
  ] as const

  return (
    <View style={styles.fill} testID={`${testIDPrefix}.network.detailView`}>
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityLabel="Back to network requests"
          accessibilityRole="button"
          hitSlop={6}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.75 }]}
          testID={`${testIDPrefix}.network.detail.backButton`}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.detailHeaderTitle}>
          Request details
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.detailContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        testID={`${testIDPrefix}.network.detail.list`}
      >
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <MethodBadge method={request.method} />
            <StatusText status={request.status} />
            <Pressable
              accessibilityRole="button"
              onPress={() => copy(createCurlCommand(request))}
              style={({ pressed }) => [styles.copyButton, pressed && { opacity: 0.75 }]}
              testID={`${testIDPrefix}.network.detail.copyCurlButton`}
            >
              <Text style={styles.copyButtonText}>{labels.networkCopyCurl}</Text>
            </Pressable>
          </View>
          <Text selectable style={styles.summaryUrl}>
            {request.url}
          </Text>
        </View>

        <View accessibilityRole="tablist" style={styles.segmented}>
          <DetailTab
            active={tab === 'request'}
            label={labels.networkRequestTab}
            onPress={() => setTab('request')}
            testID={`${testIDPrefix}.network.detail.requestTabButton`}
          />
          <DetailTab
            active={tab === 'response'}
            label={labels.networkResponseTab}
            onPress={() => setTab('response')}
            testID={`${testIDPrefix}.network.detail.responseTabButton`}
          />
        </View>

        {tab === 'request' ? (
          <>
            <KeyValueSection
              initiallyExpanded
              rows={requestGeneral}
              testID={`${testIDPrefix}.network.detail.requestGeneral`}
              title={labels.networkGeneral}
            />
            <HeaderSection
              headers={request.requestHeaders}
              testID={`${testIDPrefix}.network.detail.requestHeaders`}
              title={labels.networkRequestHeaders}
            />
            <BodySection
              body={request.requestBody}
              byteCount={request.requestBytes}
              client={client}
              copyLabel={labels.networkCopyBody}
              testID={`${testIDPrefix}.network.detail.payload`}
              title={labels.networkPayload}
            />
          </>
        ) : (
          <>
            <KeyValueSection
              initiallyExpanded
              rows={responseGeneral}
              testID={`${testIDPrefix}.network.detail.responseGeneral`}
              title={labels.networkGeneral}
            />
            <HeaderSection
              headers={request.responseHeaders}
              testID={`${testIDPrefix}.network.detail.responseHeaders`}
              title={labels.networkResponseHeaders}
            />
            <BodySection
              binary={request.responseBodyBinary}
              body={request.responseBody}
              byteCount={request.responseBytes}
              client={client}
              copyLabel={labels.networkCopyBody}
              testID={`${testIDPrefix}.network.detail.responseBody`}
              title={labels.networkResponseBody}
            />
          </>
        )}
      </ScrollView>
    </View>
  )
}

function DetailTab({
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
        styles.segment,
        active && styles.segmentActive,
        pressed && { opacity: 0.75 },
      ]}
      testID={testID}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

function HeaderSection({
  headers,
  testID,
  title,
}: {
  headers: readonly NetworkHeader[]
  testID: string
  title: string
}) {
  return (
    <KeyValueSection
      rows={headers.map(({ name, value }) => [name, value] as const)}
      testID={testID}
      title={title}
    />
  )
}

function KeyValueSection({
  initiallyExpanded = false,
  rows,
  testID,
  title,
}: {
  initiallyExpanded?: boolean
  rows: readonly (readonly [string, string])[]
  testID: string
  title: string
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  return (
    <View style={styles.section} testID={`${testID}View`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.75 }]}
        testID={`${testID}Button`}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionIndicator}>{expanded ? '-' : '+'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.rows}>
          {rows.length > 0 ? (
            rows.map(([name, value]) => (
              <View key={`${name}:${value}`} style={styles.keyValueRow}>
                <Text selectable style={styles.keyText}>{name}</Text>
                <Text selectable style={styles.valueText}>{value}</Text>
              </View>
            ))
          ) : (
            <View style={styles.keyValueRow}>
              <Text style={styles.valueText}>No headers</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  )
}

function BodySection({
  binary = false,
  body,
  byteCount,
  client,
  copyLabel,
  testID,
  title,
}: {
  binary?: boolean
  body: string
  byteCount: number
  client: NetworkDiagnosticsClient
  copyLabel: string
  testID: string
  title: string
}) {
  const [expanded, setExpanded] = useState(true)
  return (
    <View style={styles.section} testID={`${testID}View`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.75 }]}
        testID={`${testID}Button`}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionIndicator}>{expanded ? '-' : '+'}</Text>
      </Pressable>
      {expanded ? (
        <>
          {body ? (
            <View style={styles.bodyToolbar}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void client.copyToClipboard(body)}
                style={({ pressed }) => [styles.copyButton, pressed && { opacity: 0.75 }]}
                testID={`${testID}.copyButton`}
              >
                <Text style={styles.copyButtonText}>{copyLabel}</Text>
              </Pressable>
            </View>
          ) : null}
          <Text selectable style={styles.bodyText}>
            {formatNetworkBody(body, binary, byteCount)}
          </Text>
        </>
      ) : null}
    </View>
  )
}

function formatStartTime(timestamp: number): string {
  if (timestamp <= 0) return '-'
  return new Date(timestamp).toLocaleTimeString()
}

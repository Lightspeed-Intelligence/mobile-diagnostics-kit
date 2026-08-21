import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import type { OtaController, OtaRuntimeInfo } from '../otaController'
import { type ApplyState, type DiagnosticsLabels, statusLabel } from './model'
import { colors, styles } from './theme'

interface OtaPanelProps {
  controller: OtaController
  labels: DiagnosticsLabels
  runtimeInfo: OtaRuntimeInfo
  testIDPrefix: string
}

interface RuntimeInfoRowProps {
  label: string
  testID: string
  value: string | null
}

function RuntimeInfoRow({ label, testID, value }: RuntimeInfoRowProps) {
  return (
    <View style={styles.runtimeInfoRow}>
      <Text style={styles.runtimeInfoLabel}>{label}</Text>
      <Text
        selectable
        style={styles.runtimeInfoValue}
        testID={testID}
      >
        {value ?? '—'}
      </Text>
    </View>
  )
}

export function OtaPanel({
  controller,
  labels,
  runtimeInfo,
  testIDPrefix,
}: OtaPanelProps) {
  const [state, setState] = useState<ApplyState>('idle')
  const launchSource = {
    embedded: labels.otaEmbeddedSource,
    ota: labels.otaDownloadedSource,
    unknown: labels.otaUnknownSource,
  }[runtimeInfo.launchSource]
  const createdAt = runtimeInfo.createdAt
    ? new Date(runtimeInfo.createdAt).toLocaleString()
    : null

  const applyUpdate = async () => {
    if (state === 'working') return
    setState('working')
    const result = await controller.applyAvailableUpdate()
    setState(result.status)
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID={`${testIDPrefix}.ota.list`}
    >
      <View style={styles.runtimeInfoCard}>
        <Text style={styles.runtimeInfoTitle}>{labels.otaCurrentTitle}</Text>
        <RuntimeInfoRow
          label={labels.otaBranch}
          testID={`${testIDPrefix}.ota.sourceBranch`}
          value={runtimeInfo.sourceBranch}
        />
        <RuntimeInfoRow
          label={labels.otaLaunchSource}
          testID={`${testIDPrefix}.ota.launchSource`}
          value={launchSource}
        />
        <RuntimeInfoRow
          label={labels.otaUpdateId}
          testID={`${testIDPrefix}.ota.updateId`}
          value={runtimeInfo.updateId}
        />
        <RuntimeInfoRow
          label={labels.otaCreatedAt}
          testID={`${testIDPrefix}.ota.createdAt`}
          value={createdAt}
        />
        <RuntimeInfoRow
          label={labels.otaChannel}
          testID={`${testIDPrefix}.ota.channel`}
          value={runtimeInfo.channel}
        />
        <RuntimeInfoRow
          label={labels.otaRuntimeVersion}
          testID={`${testIDPrefix}.ota.runtimeVersion`}
          value={runtimeInfo.runtimeVersion}
        />
      </View>

      <View style={styles.otaCard}>
        <View style={styles.otaIcon}>
          <Text accessible={false} style={styles.otaIconText}>
            ↻
          </Text>
        </View>
        <Text style={styles.otaTitle}>{labels.otaTitle}</Text>
        <Text style={styles.otaDescription}>{labels.otaDescription}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: state === 'working' }}
          disabled={state === 'working'}
          onPress={() => void applyUpdate()}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            state === 'working' && styles.disabled,
          ]}
          testID={`${testIDPrefix}.ota.applyButton`}
        >
          {state === 'working' ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>{labels.applyUpdate}</Text>
          )}
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>
          {statusLabel(state, labels)}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{labels.networkTitle}</Text>
        <Text style={styles.infoText}>{labels.networkBody}</Text>
      </View>
    </ScrollView>
  )
}

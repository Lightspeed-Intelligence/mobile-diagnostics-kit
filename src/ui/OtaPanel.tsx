import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import type { OtaController } from '../otaController'
import { type ApplyState, type DiagnosticsLabels, statusLabel } from './model'
import { colors, styles } from './theme'

interface OtaPanelProps {
  controller: OtaController
  labels: DiagnosticsLabels
  testIDPrefix: string
}

export function OtaPanel({ controller, labels, testIDPrefix }: OtaPanelProps) {
  const [state, setState] = useState<ApplyState>('idle')

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

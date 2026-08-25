import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { formatBytes, formatDuration } from '../networkDiagnostics'
import { networkStyles as styles } from './networkTheme'

interface NetworkRequestRowProps {
  duration: number
  host: string
  id: string
  method: string
  onSelect: (id: string) => void
  path: string
  responseBytes: number
  status: string
  testID: string
}

export const NetworkRequestRow = memo(function NetworkRequestRow({
  duration,
  host,
  id,
  method,
  onSelect,
  path,
  responseBytes,
  status,
  testID,
}: NetworkRequestRowProps) {
  return (
    <Pressable
      accessibilityLabel={`${method} ${path}, status ${status}, ${host}`}
      accessibilityRole="button"
      onPress={() => onSelect(id)}
      style={({ pressed }) => [styles.requestRow, pressed && { opacity: 0.76 }]}
      testID={testID}
    >
      <View style={styles.requestTopLine}>
        <MethodBadge method={method} />
        <StatusText status={status} />
        <Text numberOfLines={1} style={styles.host}>{host}</Text>
      </View>
      <Text numberOfLines={2} style={styles.path}>{path}</Text>
      <Text numberOfLines={1} style={styles.metadata}>
        {formatDuration(duration)} / {formatBytes(responseBytes)} received
      </Text>
    </Pressable>
  )
})

export function MethodBadge({ method }: { method: string }) {
  const normalized = method.toUpperCase()
  const colorStyle =
    normalized === 'GET'
      ? styles.methodGet
      : normalized === 'POST'
        ? styles.methodPost
        : normalized === 'PUT' || normalized === 'PATCH'
          ? styles.methodMutation
          : normalized === 'DELETE'
            ? styles.methodDelete
            : styles.methodOther
  return (
    <View style={[styles.methodBadge, colorStyle]}>
      <Text style={styles.methodText}>{normalized || 'HTTP'}</Text>
    </View>
  )
}

export function StatusText({ status }: { status: string }) {
  const code = /^\d+$/.test(status) ? Number(status) : 0
  const colorStyle =
    code >= 200 && code < 300
      ? styles.statusSuccess
      : code >= 300 && code < 400
        ? styles.statusRedirect
        : code >= 400 && code < 500
          ? styles.statusWarning
          : styles.statusError
  return <Text style={[styles.status, colorStyle]}>{status || 'Pending'}</Text>
}

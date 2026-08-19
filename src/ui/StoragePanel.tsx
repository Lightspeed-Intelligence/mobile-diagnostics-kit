import { useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import type {
  JsonValue,
  StorageEntrySnapshot,
  StorageInspector,
} from '../storageInspector'
import {
  type DiagnosticsLabels,
  formatPreview,
  parseJsonInput,
  toTestIdSegment,
} from './model'
import { colors, styles } from './theme'

interface StoragePanelProps {
  inspector: StorageInspector | null
  labels: DiagnosticsLabels
  onRefresh: () => void
  onSelect: (key: string | null) => void
  selectedKey: string | null
  snapshots: readonly StorageEntrySnapshot[]
  testIDPrefix: string
}

export function StoragePanel({
  inspector,
  labels,
  onRefresh,
  onSelect,
  selectedKey,
  snapshots,
  testIDPrefix,
}: StoragePanelProps) {
  const [query, setQuery] = useState('')
  const [fieldName, setFieldName] = useState('')
  const [fieldValue, setFieldValue] = useState('')
  const [feedback, setFeedback] = useState('')

  const selected = snapshots.find((entry) => entry.key === selectedKey) ?? null
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return snapshots.filter(
      (entry) =>
        !needle ||
        `${entry.key} ${entry.label}`.toLowerCase().includes(needle)
    )
  }, [query, snapshots])

  const showError = () =>
    Alert.alert(labels.operationFailedTitle, labels.operationFailedBody)

  const editField = (field: string, value: JsonValue) => {
    setFieldName(field)
    setFieldValue(JSON.stringify(value))
    setFeedback('')
  }

  const saveField = () => {
    if (!inspector || !selected) return
    try {
      inspector.setField(
        selected.key,
        fieldName.trim(),
        parseJsonInput(fieldValue)
      )
      setFieldName('')
      setFieldValue('')
      setFeedback(labels.fieldSaved)
      onRefresh()
    } catch {
      showError()
    }
  }

  const removeField = (field: string) => {
    if (!inspector || !selected) return
    Alert.alert(labels.deleteConfirmTitle, labels.deleteConfirmBody(field), [
      { text: labels.cancel, style: 'cancel' },
      {
        text: labels.delete,
        style: 'destructive',
        onPress: () => {
          try {
            inspector.removeField(selected.key, field)
            setFeedback(labels.fieldRemoved)
            onRefresh()
          } catch {
            showError()
          }
        },
      },
    ])
  }

  const resetEntry = () => {
    if (!inspector || !selected) return
    Alert.alert(labels.resetConfirmTitle, labels.resetConfirmBody, [
      { text: labels.cancel, style: 'cancel' },
      {
        text: labels.resetEntry,
        style: 'destructive',
        onPress: () => {
          try {
            inspector.resetEntry(selected.key)
            onSelect(null)
            setFeedback(labels.resetDone)
            onRefresh()
          } catch {
            showError()
          }
        },
      },
    ])
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      testID={`${testIDPrefix}.storage.list`}
    >
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{labels.securityTitle}</Text>
        <Text style={styles.infoText}>{labels.securityBody}</Text>
      </View>

      <TextInput
        accessibilityLabel={labels.searchPlaceholder}
        onChangeText={setQuery}
        placeholder={labels.searchPlaceholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        testID={`${testIDPrefix}.storage.searchField`}
        value={query}
      />

      {filtered.map((entry) => (
        <Pressable
          accessibilityRole="button"
          key={entry.key}
          onPress={() => {
            onSelect(entry.key)
            setFeedback('')
          }}
          style={({ pressed }) => [
            styles.entryCard,
            entry.key === selectedKey && styles.entryCardSelected,
            pressed && styles.pressed,
          ]}
          testID={`${testIDPrefix}.storage.entry.${toTestIdSegment(entry.key)}Button`}
        >
          <View style={styles.rowBetween}>
            <Text style={styles.entryLabel}>{entry.label}</Text>
            <Text style={styles.entryKind}>{entry.kind}</Text>
          </View>
          <Text numberOfLines={2} style={styles.entryKey}>
            {entry.key}
          </Text>
          <Text numberOfLines={2} style={styles.preview}>
            {formatPreview(entry.value, labels)}
          </Text>
        </Pressable>
      ))}

      {filtered.length === 0 ? (
        <View accessibilityRole="summary" style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{labels.emptyTitle}</Text>
          <Text style={styles.emptyText}>{labels.emptyBody}</Text>
        </View>
      ) : null}

      {selected ? (
        <View style={styles.detailCard}>
          <View style={styles.rowBetween}>
            <View style={styles.detailHeading}>
              <Text style={styles.sectionTitle}>{selected.label}</Text>
              <Text style={styles.detailKey}>{selected.key}</Text>
            </View>
            <Pressable
              accessibilityLabel={labels.refreshStorage}
              accessibilityRole="button"
              hitSlop={6}
              onPress={onRefresh}
              style={({ pressed }) => [
                styles.smallButton,
                pressed && styles.pressed,
              ]}
              testID={`${testIDPrefix}.storage.refreshButton`}
            >
              <Text style={styles.smallButtonText}>{labels.refresh}</Text>
            </Pressable>
          </View>

          {selected.description ? (
            <Text style={styles.detailDescription}>{selected.description}</Text>
          ) : null}

          {selected.isObject ? (
            Object.entries(selected.value as Record<string, JsonValue>).map(
              ([field, value]) => {
                const segment = toTestIdSegment(field)
                return (
                  <View key={field} style={styles.fieldRow}>
                    <Pressable
                      accessibilityLabel={labels.editField(field)}
                      accessibilityRole="button"
                      onPress={() => editField(field, value)}
                      style={styles.fieldEditButton}
                      testID={`${testIDPrefix}.storage.field.${segment}Button`}
                    >
                      <Text style={styles.fieldName}>{field}</Text>
                      <Text numberOfLines={3} style={styles.fieldValue}>
                        {formatPreview(value, labels)}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={labels.deleteField(field)}
                      accessibilityRole="button"
                      onPress={() => removeField(field)}
                      style={({ pressed }) => [
                        styles.removeButton,
                        pressed && styles.pressed,
                      ]}
                      testID={`${testIDPrefix}.storage.field.${segment}DeleteButton`}
                    >
                      <Text style={styles.removeText}>{labels.delete}</Text>
                    </Pressable>
                  </View>
                )
              }
            )
          ) : (
            <Text style={styles.emptyText}>{labels.entryNotObject}</Text>
          )}

          {selected.isObject ? (
            <View style={styles.editorBlock}>
              <Text style={styles.editorTitle}>{labels.editorTitle}</Text>
              <Text style={styles.inputLabel}>{labels.fieldNameLabel}</Text>
              <TextInput
                accessibilityLabel={labels.fieldNameLabel}
                autoCapitalize="none"
                onChangeText={setFieldName}
                placeholder={labels.fieldNamePlaceholder}
                placeholderTextColor={colors.muted}
                style={styles.editorInput}
                testID={`${testIDPrefix}.storage.fieldNameField`}
                value={fieldName}
              />
              <Text style={styles.inputLabel}>{labels.fieldValueLabel}</Text>
              <TextInput
                accessibilityLabel={labels.fieldValueLabel}
                autoCapitalize="none"
                multiline
                onChangeText={setFieldValue}
                placeholder={labels.fieldValuePlaceholder}
                placeholderTextColor={colors.muted}
                style={[styles.editorInput, styles.multilineInput]}
                testID={`${testIDPrefix}.storage.fieldValueField`}
                value={fieldValue}
              />
              <Pressable
                accessibilityRole="button"
                onPress={saveField}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
                testID={`${testIDPrefix}.storage.saveFieldButton`}
              >
                <Text style={styles.primaryButtonText}>{labels.saveField}</Text>
              </Pressable>
            </View>
          ) : null}

          {selected.canReset ? (
            <Pressable
              accessibilityRole="button"
              onPress={resetEntry}
              style={({ pressed }) => [
                styles.resetButton,
                pressed && styles.pressed,
              ]}
              testID={`${testIDPrefix}.storage.resetEntryButton`}
            >
              <Text style={styles.resetText}>{labels.resetEntry}</Text>
            </Pressable>
          ) : null}

          {feedback ? (
            <Text accessibilityLiveRegion="polite" style={styles.feedback}>
              {feedback}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  )
}

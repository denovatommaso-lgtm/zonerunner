import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Edge, EdgeInsets, SafeAreaView } from 'react-native-safe-area-context';

type Mode = 'create' | 'join';

type Props = {
  visible: boolean;
  mode: Mode;
  groupName: string;
  onGroupNameChange: (val: string) => void;
  territoryColor: string;
  onColorChange: (val: string) => void;
  colorOptions: string[];
  generatedCode?: string | null;
  codeValue?: string;
  onCodeChange?: (val: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  safeEdges?: Edge[];
  insets?: EdgeInsets;
};

// Reusable modal for creating or joining a group.
// Keeps styling inline to remain self-contained and consistent across screens.
export default function GroupManageModal({
  visible,
  mode,
  groupName,
  onGroupNameChange,
  territoryColor,
  onColorChange,
  colorOptions,
  generatedCode,
  codeValue,
  onCodeChange,
  onSubmit,
  onCancel,
  loading,
  errorMessage,
  safeEdges = ['top', 'bottom'],
  insets,
}: Props) {
  const isCreate = mode === 'create';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <SafeAreaView
        edges={safeEdges}
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(6, (insets?.top ?? 0) + 2),
            paddingBottom: Math.max(12, (insets?.bottom ?? 0) + 8),
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.title}>
              {isCreate ? 'Create a group' : 'Join a group'}
            </Text>
            <Text style={styles.subtitle}>
              {isCreate
                ? 'Choose a name and territory color. A join ID will be generated.'
                : 'Enter the group ID you were given to join the team.'}
            </Text>

            <Text style={styles.label}>
              {isCreate ? 'Group name' : 'Group ID'}
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={isCreate ? '' : 'G-XXXXXX'}
                placeholderTextColor="#6b7280"
                value={isCreate ? groupName : codeValue}
                onChangeText={isCreate ? onGroupNameChange : onCodeChange}
                autoCapitalize="none"
            />
          </View>

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}

            {isCreate ? (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>Territory color</Text>
                <View style={styles.colorGrid}>
                  {colorOptions.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        territoryColor === c && styles.colorSwatchActive,
                      ]}
                      onPress={() => onColorChange(c)}
                    />
                  ))}
                </View>
                {generatedCode ? (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>Group ID (share to invite):</Text>
                    <Text style={styles.infoCode}>{generatedCode}</Text>
                  </View>
                ) : null}
              </>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryButton, styles.cancelButton]}
                onPress={onCancel}
                disabled={!!loading}
              >
                <Text style={[styles.primaryButtonText, styles.cancelButtonText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, { flex: 1, marginTop: 0 }]}
                onPress={onSubmit}
                disabled={!!loading}
              >
                <Text style={styles.primaryButtonText}>
                  {loading ? 'Please wait…' : isCreate ? 'Create' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
  },
  errorText: {
    color: '#ef4444',
    marginTop: 6,
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#9ca3af44',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 14,
    textAlign: 'center',
  },
  label: {
    color: '#e5e7eb',
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0b1120',
  },
  colorSwatchActive: {
    borderColor: '#ffffff',
  },
  infoBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  infoText: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  infoCode: {
    color: '#e5e7eb',
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  primaryButton: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    flex: 1,
    minWidth: '48%',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#020617',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#22c55e',
  },
  cancelButtonText: {
    color: '#22c55e',
  },
});

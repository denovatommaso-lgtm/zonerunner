import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  mode: 'personal' | 'group';
  onSelect: (mode: 'personal' | 'group') => void;
};

function ModeToggleComponent({ mode, onSelect }: Props) {
  return (
    <View style={styles.modeToggleRow}>
      <TouchableOpacity
        style={[styles.modeToggleButton, mode === 'personal' && styles.modeToggleActive]}
        onPress={() => onSelect('personal')}
      >
        <Text style={[styles.modeToggleText, mode === 'personal' && styles.modeToggleTextActive]}>
          Personal
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modeToggleButton, mode === 'group' && styles.modeToggleActive]}
        onPress={() => onSelect('group')}
      >
        <Text style={[styles.modeToggleText, mode === 'group' && styles.modeToggleTextActive]}>
          Groups
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export const ModeToggle = React.memo(ModeToggleComponent);

const styles = StyleSheet.create({
  modeToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  modeToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1220',
    alignItems: 'center',
  },
  modeToggleActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  modeToggleText: {
    color: '#9ca3af',
    fontWeight: '700',
  },
  modeToggleTextActive: {
    color: '#22c55e',
  },
});

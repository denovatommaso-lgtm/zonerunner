import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import Ionicons from '@/components/common/Ionicons';

type Props = {
  onPress: () => void;
  label?: string;
  disabled?: boolean;
  style?: ViewStyle;
  variant?: 'dark' | 'light';
};

/**
 * Uniform save button to keep headers/modals consistent.
 */
export function SaveButton({ onPress, label = 'Save', disabled, style, variant = 'dark' }: Props) {
  const isLight = variant === 'light';
  const accent = '#22c55e';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.button,
        isLight ? styles.buttonLight : styles.buttonDark,
        disabled && { opacity: 0.55 },
        style,
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons
        name="checkmark"
        size={18}
        color={isLight ? '#0b1120' : accent}
        style={{ marginRight: 4 }}
      />
      <Text style={[styles.label, isLight ? styles.labelLight : styles.labelDark, !isLight && { color: accent }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonDark: {
    backgroundColor: '#0f172a',
    borderColor: '#1f2937',
  },
  buttonLight: {
    backgroundColor: '#e5e7eb',
    borderColor: '#cbd5e1',
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
  },
  labelDark: {
    color: '#22c55e',
  },
  labelLight: {
    color: '#0b1120',
  },
});

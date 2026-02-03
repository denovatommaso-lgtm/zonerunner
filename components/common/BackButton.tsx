import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import Ionicons from '@/components/common/Ionicons';

type Props = {
  onPress: () => void;
  label?: string;
  style?: ViewStyle;
  variant?: 'dark' | 'light';
};

/**
 * Uniform back button used across screens/modals for consistent spacing and hit area.
 */
export function BackButton({ onPress, label = 'Back', style, variant = 'dark' }: Props) {
  const isLight = variant === 'light';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.button,
        isLight ? styles.buttonLight : styles.buttonDark,
        style,
      ]}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons
        name="chevron-back"
        size={18}
        color={isLight ? '#0b1120' : '#e5e7eb'}
        style={{ marginRight: 4 }}
      />
      <Text style={[styles.label, isLight ? styles.labelLight : styles.labelDark]}>
        {label}
      </Text>
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
    fontWeight: '700',
  },
  labelDark: {
    color: '#e5e7eb',
  },
  labelLight: {
    color: '#0b1120',
  },
});

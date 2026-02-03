import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';

type Props = {
  onPress: () => void;
  accentColor?: string;
  label?: string;
  style?: ViewStyle;
};

export function StartRunButton({
  onPress,
  accentColor = '#22c55e',
  label = 'Start run',
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bigButton,
        {
          backgroundColor: accentColor,
          borderColor: accentColor === '#22c55e' ? '#16a34a' : accentColor,
        },
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      <Text style={styles.bigButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bigButton: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  bigButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#020617',
  },
});

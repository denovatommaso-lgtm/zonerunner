import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@/components/common/Ionicons';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="mail-open-outline" size={28} color="#22c55e" />
        </View>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link{email ? ` to ${email}` : ''}. Open it to confirm your account.
        </Text>

        <View style={styles.stepList}>
          <View style={styles.stepRow}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#38bdf8" />
            <Text style={styles.stepText}>Open the email and tap the verification link.</Text>
          </View>
          <View style={styles.stepRow}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#38bdf8" />
            <Text style={styles.stepText}>Return here and sign in once verified.</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.primaryText}>I verified my email</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/(auth)/welcome')}
        >
          <Text style={styles.secondaryText}>Use a different email</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#0b1220',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#111827',
    padding: 20,
    gap: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#e5e7eb',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 15,
    lineHeight: 20,
  },
  stepList: {
    gap: 10,
    marginTop: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepText: {
    color: '#e5e7eb',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
  },
});

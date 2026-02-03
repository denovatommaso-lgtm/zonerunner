import React, { useEffect, useState } from 'react';
import Ionicons from '@/components/common/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useAuthForms } from '../../hooks/useAuthForms';
import { useRouter } from 'expo-router';
import { auth } from '../../lib/firebaseConfig';
import { signInWithApple, signInWithGoogle } from '../../lib/authService';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const {
    email,
    setEmail,
    password,
    setPassword,
    signIn,
    authError,
    setAuthMode,
    resetting,
    resetSentAt,
    sendReset,
    authLoading,
    needsVerification,
    setAuthError,
  } = useAuthForms();
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    iosClientId: '467992768872-4va6iabt6ne3h0t9jbe8fghqbor3124j.apps.googleusercontent.com',
    webClientId: '467992768872-5ba8pm7vpd550s0n3tu9oot1u4bpt17q.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    selectAccount: true,
  });

  // If already signed in, router will redirect via root layout; here just stay.
  useEffect(() => {
    setAuthMode('login');
  }, [setAuthMode]);

  useEffect(() => {
    let mounted = true;
    const checkApple = async () => {
      if (Platform.OS !== 'ios') return;
      const available = await AppleAuthentication.isAvailableAsync();
      if (mounted) setAppleAvailable(available);
    };
    checkApple();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken =
      googleResponse.authentication?.idToken ||
      googleResponse.params?.id_token;
    const accessToken =
      googleResponse.authentication?.accessToken ||
      googleResponse.params?.access_token;
    if (!idToken) {
      setAuthError('Google sign-in failed. Missing ID token.');
      return;
    }
    setSocialLoading('google');
    signInWithGoogle(idToken, accessToken)
      .then(() => {
        router.replace('/');
      })
      .catch((e: any) => {
        setAuthError(e?.message ?? 'Google sign-in failed.');
      })
      .finally(() => {
        setSocialLoading(null);
      });
  }, [googleResponse, router, setAuthError]);

  const handleSignInPress = async () => {
    await signIn();
    if (auth.currentUser) {
      router.replace('/');
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    await promptGoogle();
  };

  const handleAppleSignIn = async () => {
    setAuthError(null);
    setSocialLoading('apple');
    try {
      const nonceBytes = await Crypto.getRandomBytesAsync(16);
      const rawNonce = Array.from(nonceBytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        throw new Error('Apple sign-in failed. Missing identity token.');
      }
      const fullName = credential.fullName;
      const displayName = [fullName?.givenName, fullName?.familyName]
        .filter(Boolean)
        .join(' ') || undefined;
      await signInWithApple(
        credential.identityToken,
        rawNonce,
        displayName,
        credential.email ?? undefined
      );
      router.replace('/');
    } catch (e: any) {
      if (e?.code === 'ERR_CANCELED' || e?.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      setAuthError(e?.message ?? 'Apple sign-in failed.');
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.navRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/(auth)/welcome')}
          >
            <Ionicons name="arrow-back" size={18} color="#e5e7eb" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Access your runs, friends, and territory.</Text>

          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton]}
              onPress={handleGoogleSignIn}
              disabled={!googleRequest || authLoading || socialLoading !== null}
            >
              <Ionicons name="logo-google" size={18} color="#4285F4" />
              <Text style={[styles.socialText, styles.googleText]}>Continue with Google</Text>
            </TouchableOpacity>
            {appleAvailable ? (
              <TouchableOpacity
                style={[styles.socialButton, styles.appleButton]}
                onPress={handleAppleSignIn}
                disabled={authLoading || socialLoading !== null}
              >
                <Ionicons name="logo-apple" size={18} color="#e5e7eb" />
                <Text style={[styles.socialText, styles.appleText]}>
                  Continue with Apple
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748b"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={resetting ? undefined : sendReset}
            disabled={resetting}
          >
            <Text style={styles.linkButtonText}>
              {resetting ? 'Sending…' : 'Forgot password?'}
            </Text>
          </TouchableOpacity>
          {resetSentAt ? (
            <Text style={styles.resetInfo}>
              Reset link sent. Check your inbox or spam folder.
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, authLoading && { opacity: 0.7 }]}
            onPress={handleSignInPress}
            disabled={authLoading}
          >
            <Text style={styles.primaryText}>{authLoading ? 'Signing in…' : 'Sign in'}</Text>
          </TouchableOpacity>

          {needsVerification ? (
            <View style={styles.infoBox}>
              <Ionicons name="mail-outline" size={16} color="#38bdf8" style={{ marginRight: 6 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.infoTitle}>Check your email</Text>
                <Text style={styles.infoText}>
                  We sent a verification link. Confirm your email, then try signing in again.
                </Text>
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/(auth)/signup')}
          >
            <Text style={styles.secondaryText}>Need an account? Sign up</Text>
          </TouchableOpacity>

          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 20,
  },
  navRow: {
    marginTop: 10,
    marginBottom: 6,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
  },
  card: {
    marginTop: 40,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#111827',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: 'white',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 6,
  },
  socialRow: {
    gap: 10,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleButton: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbeafe',
  },
  appleButton: {
    backgroundColor: '#0f172a',
    borderColor: '#1f2937',
  },
  socialText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 14,
  },
  googleText: {
    color: '#4285F4',
  },
  appleText: {
    color: '#e5e7eb',
  },
  inputRow: {
    gap: 10,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
  },
  linkButton: {
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    alignItems: 'center',
  },
  primaryText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderColor: '#38bdf8',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoTitle: {
    color: '#38bdf8',
    fontWeight: '800',
    fontSize: 13,
  },
  infoText: {
    color: '#e5e7eb',
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    marginTop: 6,
  },
  resetInfo: {
    color: '#9ca3af',
    fontSize: 12,
  },
});

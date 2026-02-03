import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import Ionicons from '@/components/common/Ionicons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, View, Image, Platform } from 'react-native';
import { signInWithApple, signInWithGoogle } from '../../lib/authService';

WebBrowser.maybeCompleteAuthSession();

export default function WelcomeScreen() {
  const router = useRouter();
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    iosClientId: '467992768872-4va6iabt6ne3h0t9jbe8fghqbor3124j.apps.googleusercontent.com',
    webClientId: '467992768872-5ba8pm7vpd550s0n3tu9oot1u4bpt17q.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    selectAccount: true,
  });

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
  }, [googleResponse, router]);

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.toText}>to</Text>
        <Text style={styles.brand}>ZoneRunner</Text>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.heroIconSmall}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>
          Track your runs.
          {'\n'}Capture territory.
          {'\n'}Compete with friends and groups.
        </Text>

        <Link href="/(auth)/signup" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryText}>Sign up</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Log in</Text>
          </TouchableOpacity>
        </Link>

        <View style={styles.socialRow}>
          <TouchableOpacity
            style={[styles.socialButton, styles.googleButton]}
            onPress={handleGoogleSignIn}
            disabled={!googleRequest || socialLoading !== null}
          >
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text style={[styles.socialText, styles.googleText]}>Continue with Google</Text>
          </TouchableOpacity>
          {appleAvailable ? (
            <TouchableOpacity
              style={[styles.socialButton, styles.appleButton]}
              onPress={handleAppleSignIn}
              disabled={socialLoading !== null}
            >
              <Ionicons name="logo-apple" size={18} color="#e5e7eb" />
              <Text style={[styles.socialText, styles.appleText]}>
                Continue with Apple
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
  },
  brand: {
    fontSize: 36,
    fontWeight: '900',
    color: '#22c55e',
    textAlign: 'center',
  },
  toText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
    textAlign: 'center',
  },
  heroIconLarge: {
    alignSelf: 'center',
    width: 220,
    height: 180,
    marginBottom: 8,
  },
  heroIconSmall: {
    alignSelf: 'center',
    width: 170,
    height: 130,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1220',
  },
  secondaryText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 15,
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
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
});

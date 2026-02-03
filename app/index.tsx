import { Redirect } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { auth } from '../lib/firebaseConfig';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function Index() {
  const isWeb = Platform.OS === 'web';
  const [isStandalone, setIsStandalone] = useState(false);
  const [androidPrompt, setAndroidPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showAndroidHelp, setShowAndroidHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isWeb) return;
    const updateStandalone = () => {
      if (typeof window === 'undefined') return;
      const standaloneMedia = window.matchMedia?.('(display-mode: standalone)');
      const isIosStandalone = typeof navigator !== 'undefined' && (navigator as any).standalone === true;
      setIsStandalone(Boolean(standaloneMedia?.matches || isIosStandalone));
    };
    updateStandalone();
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)');
    const listener = () => updateStandalone();
    standaloneMedia?.addEventListener?.('change', listener);
    return () => standaloneMedia?.removeEventListener?.('change', listener);
  }, [isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const handler = (event: Event) => {
      event.preventDefault();
      setAndroidPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, [isWeb]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setSignedIn(!!user);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (isWeb && !isStandalone) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Image source={require('../assets/icon.png')} style={styles.logo} />
          <Text style={styles.title}>Welcome to ZoneRunner</Text>
          <Text style={styles.subtitle}>Install the app on your phone for the best experience.</Text>

          <Pressable
            style={[styles.button, styles.iosButton]}
            onPress={() => {
              setShowIosHelp(true);
              setShowAndroidHelp(false);
            }}
          >
            <Text style={styles.buttonText}>Download on iOS</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.androidButton]}
            onPress={async () => {
              if (androidPrompt) {
                await androidPrompt.prompt();
                await androidPrompt.userChoice;
                setAndroidPrompt(null);
              } else {
                setShowAndroidHelp(true);
                setShowIosHelp(false);
              }
            }}
          >
            <Text style={styles.buttonText}>Download on Android</Text>
          </Pressable>

          {showIosHelp ? (
            <View style={styles.help}>
              <Text style={styles.helpTitle}>iPhone install</Text>
              <Text style={styles.helpText}>Open this page in Safari.</Text>
              <Text style={styles.helpText}>Tap Share → Add to Home Screen.</Text>
            </View>
          ) : null}

          {showAndroidHelp ? (
            <View style={styles.help}>
              <Text style={styles.helpTitle}>Android install</Text>
              <Text style={styles.helpText}>Open in Chrome.</Text>
              <Text style={styles.helpText}>Tap “Install app” in the browser menu.</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (isWeb && loading) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#e2e8f0' }}>Loading…</Text>
      </View>
    );
  }

  if (loading) {
    return <Text style={{ color: 'white', padding: 20 }}>Loading…</Text>;
  }

  if (!signedIn) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 8,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  iosButton: {
    backgroundColor: '#0ea5e9',
  },
  androidButton: {
    backgroundColor: '#22c55e',
  },
  buttonText: {
    color: '#0b1120',
    fontWeight: '700',
    fontSize: 16,
  },
  help: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    width: '100%',
  },
  helpTitle: {
    color: '#e2e8f0',
    fontWeight: '700',
    marginBottom: 4,
  },
  helpText: {
    color: '#94a3b8',
    fontSize: 13,
  },
});

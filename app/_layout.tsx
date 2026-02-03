import { Stack, useRouter, useSegments } from 'expo-router';
import * as Font from 'expo-font';
import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ModeProvider } from '../lib/modeContext';
import { useGoogleAuth } from '../lib/auth';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useWatchRunIngestor } from '../hooks/useWatchRunIngestor';
import { usePendingRunSync } from '../hooks/usePendingRunSync';
import { useRankingTracker } from '../hooks/useRankingTracker';
import { perfLog } from '../lib/perfLogger';
import { logSummary } from '../lib/bootstrapLogger';
import { flushQueueWhenOnline } from '../lib/offlineQueue';
import { RunSaveService } from '../lib/runSaveService';

export default function RootLayout() {
  const [, setIconFontsReady] = useState(Platform.OS !== 'web');
  const { user, loading } = useGoogleAuth();
  const segments = useSegments();
  const router = useRouter();
  const inAuthFlow = segments[0] === '(auth)';
  const bootStartRef = useRef<number>(Date.now());
  const lastNavRef = useRef<string>('');
  useWatchRunIngestor();
  usePendingRunSync(user?.uid);
  useRankingTracker(user?.uid);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let isMounted = true;
    (async () => {
      try {
        const ExpoIcons = require('@expo/vector-icons');
        const MaterialIconsModule = require('@expo/vector-icons/MaterialIcons');
        const MaterialIcons = MaterialIconsModule?.default ?? MaterialIconsModule;
        await Font.loadAsync({
          ...(ExpoIcons?.Ionicons?.font ?? {}),
          ...(MaterialIcons?.font ?? {}),
        });
        if (isMounted) setIconFontsReady(true);
      } catch {
        // ignore
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    perfLog({
      screen: 'RootLayout',
      phase: 'BOOT',
      label: 'root-mounted',
      durationMs: Date.now() - bootStartRef.current,
    });
    const timer = setTimeout(() => {
      logSummary();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onOnline = () => {
      if (!user?.uid) return;
      flushQueueWhenOnline(async (evt) => {
        if (evt.type === 'run.save' && evt.payload?.userId) {
          // Try syncing pending runs on reconnect
          await RunSaveService.syncPendingRuns(evt.payload.userId as string);
          return true;
        }
        return false;
      }).catch(() => {});
    };
    onOnline();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user?.uid]);

  useEffect(() => {
    const path = segments.join('/');
    if (path && path !== lastNavRef.current) {
      lastNavRef.current = path;
      perfLog({
        screen: 'RootLayout',
        phase: 'NAV',
        label: `segments:${path}`,
        durationMs: 0,
      });
    }
  }, [segments]);

  useEffect(() => {
    if (loading) return;
    perfLog({
      screen: 'RootLayout',
      phase: 'BOOT',
      label: user ? 'auth-ready' : 'auth-missing',
      durationMs: Date.now() - bootStartRef.current,
    });
    if (!user && !inAuthFlow) {
      router.replace('/(auth)/welcome');
    }
  }, [user, loading, inAuthFlow, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ModeProvider>
          <Stack screenOptions={{ headerShown: false }}>
            {/* Root index redirects into the tabs Home screen */}
            <Stack.Screen name="index" options={{ headerShown: false }} />
            {/* Main tab navigator */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* Auth flow */}
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack>
        </ModeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

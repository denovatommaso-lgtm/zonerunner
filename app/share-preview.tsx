import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ShareCardMinimal from '../components/share/ShareCardMinimal';
import { loadRunById } from '../lib/runService';
import { loadUserProfile } from '../lib/authService';
import { formatDistance } from '../lib/utils/format';
import { formatElapsed, formatPace } from '../lib/utils/runMetrics';
import { captureRef } from '../lib/viewShot';
import { BackButton } from '../components/common/BackButton';

type Coord = { latitude: number; longitude: number };

export default function SharePreviewScreen() {
  const { id, bg } = useLocalSearchParams<{ id?: string; bg?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shareRef = useRef<View | null>(null);

  const [loading, setLoading] = useState(true);
  const [shareLoading, setShareLoading] = useState(false);
  const [accentColor, setAccentColor] = useState('#22c55e');
  const [run, setRun] = useState<any>(null);
  const [backgroundUri] = useState<string | null>(bg ? String(bg) : null);

  useEffect(() => {
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const fetched = await loadRunById(id as string);
        if (!fetched) {
          setLoading(false);
          return;
        }
        setRun(fetched);
        if (fetched?.userId) {
          const profile = await loadUserProfile(fetched.userId);
          if (profile?.territoryColor) {
            setAccentColor(profile.territoryColor);
          }
        }
      } catch (e) {
        console.log('Failed to load run for share preview', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleShare = useCallback(async () => {
    if (!shareRef.current || !run) return;
    try {
      setShareLoading(true);
      if (Platform.OS === 'web') {
        Alert.alert('Not available on web', 'Sharing is currently supported on mobile only.');
        return;
      }
      // Allow background to render (in case bg uri just set from nav)
      await new Promise((resolve) => setTimeout(resolve, 50));

      const uri = await captureRef(shareRef.current, {
        format: 'png',
        quality: 0.95,
      });
      await Share.share({
        title: 'Share your run',
        url: uri,
        message: `ZoneRunner • ${formatDistance(run.distance)} • ${formatElapsed(run.elapsedSeconds)}`,
      });
    } catch (e) {
      console.log('Share capture failed', e);
      Alert.alert('Share failed', 'Unable to capture the share card. Please try again.');
    } finally {
      setShareLoading(false);
    }
  }, [run]);

  if (loading || !run) {
    return (
      <SafeAreaView style={styles.center}>
        {loading ? <ActivityIndicator /> : <Text style={{ color: 'white' }}>Run not found</Text>}
      </SafeAreaView>
    );
  }

  const route: Coord[] = Array.isArray(run.route) ? run.route : [];
  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top || 16 }]}>
        <BackButton onPress={() => router.back()} />
        <TouchableOpacity
          style={[styles.shareButton, { borderColor: accentColor }]}
          onPress={handleShare}
          disabled={shareLoading}
        >
          <Text style={[styles.backText, { color: accentColor }]}>{shareLoading ? 'Sharing…' : 'Share'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardWrapper}>
        <ShareCardMinimal
          ref={shareRef}
          accentColor={accentColor}
          route={route}
          distanceLabel={formatDistance(run.distance)}
          timeLabel={formatElapsed(run.elapsedSeconds)}
          paceLabel={formatPace(run.distance, run.elapsedSeconds)}
          areaLabel={`${(run.areaKm2 ?? 0).toFixed(2)} km²`}
          levelLabel={'Lvl —'}
          backgroundUri={backgroundUri || undefined}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shareButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

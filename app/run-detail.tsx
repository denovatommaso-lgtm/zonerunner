import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { loadUserProfile } from '../lib/authService';
import { loadRunById } from '../lib/runService';
import { formatDistance, formatDate } from '../lib/utils/format';
import { formatElapsed, formatPace } from '../lib/utils/runMetrics';
import { BackButton } from '../components/common/BackButton';
import {
  Camera,
  FillLayer,
  LineLayer,
  MapView,
  ShapeSource,
} from '../lib/maplibre';
import { OSM_STYLE_URL } from '../lib/maps/osm';
import {
  featureCollection,
  hexToRgba,
  polygonFeature,
  regionToCenterZoom,
} from '../lib/maps/geojson';
import OsmAttribution from '../components/maps/OsmAttribution';

type Coord = {
  latitude: number;
  longitude: number;
};

type RunSummary = {
  id: string;
  seq?: number;
  distance: number;       // meters
  elapsedSeconds: number; // seconds
  startedAt: string;      // ISO date
  userId?: string;
  groupId?: string;
  route: Coord[];
  areaKm2?: number;
};

function boundsFromCoords(coords: Coord[]) {
  if (!coords.length) return null;
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const p of coords) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }
  return { minLat, maxLat, minLng, maxLng };
}

// MapLibre view is loaded via lib/maplibre.ts to avoid web native module errors.

export default function RunDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [run, setRun] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [accentColor, setAccentColor] = useState('#22c55e');
  const [mapReady, setMapReady] = useState(false);
  const groupBadge =
    run?.groupId && (run as any).groupRunType
      ? `Group • ${(run as any).groupRunType === 'official' ? 'Official' : 'Casual'}`
      : run?.groupId
        ? 'Group run'
        : null;

  useEffect(() => {
    (async () => {
      try {
        if (!id) {
          setLoading(false);
          return;
        }
        const fetched = await loadRunById(id as string);
        if (fetched?.userId) {
          const profile = await loadUserProfile(fetched.userId);
          if (profile?.territoryColor) {
            setAccentColor(profile.territoryColor);
          }
        }
        setRun((fetched as any) || null);
      } catch (error) {
        console.log('Failed to load runs for detail screen', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const cameraRef = React.useRef<any>(null);

  const fitRoute = useCallback(() => {
    const coords = run?.route ?? [];
    if (!cameraRef.current || !Array.isArray(coords) || coords.length < 2) return;
    if (typeof cameraRef.current?.fitBounds !== 'function') return;
    const bounds = boundsFromCoords(coords);
    if (!bounds) return;
    cameraRef.current.fitBounds(
      [bounds.maxLng, bounds.maxLat],
      [bounds.minLng, bounds.minLat],
      70,
      300
    );
  }, [run?.route]);

  useEffect(() => {
    const coords = run?.route ?? [];
    if (mapReady && Array.isArray(coords) && coords.length > 1 && cameraRef.current) {
      const fit = () => fitRoute();
      // Ensure the map has fully laid out before fitting
      const timer = setTimeout(fit, 100);
      requestAnimationFrame(fit);
      return () => clearTimeout(timer);
    }
  }, [fitRoute, mapReady, run?.route]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading run…</Text>
      </SafeAreaView>
    );
  }

  if (!run) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Run not found.</Text>
      </SafeAreaView>
    );
  }

  // Some older runs might not have a route saved yet; guard against that.
  const route: Coord[] = Array.isArray(run.route) ? run.route : [];

  const dateText = run.startedAt ? formatDate(run.startedAt) : 'Unknown date';

  const region = route.length > 0 ? {
    latitude: route[0].latitude,
    longitude: route[0].longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : {
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const initialCamera = regionToCenterZoom(region);
  const routeFeatures = route.length >= 3
    ? featureCollection([
        polygonFeature(route, {
          lineColor: accentColor,
          fillColor: hexToRgba(accentColor, 0.25),
        }),
      ])
    : featureCollection([]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <BackButton onPress={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.title, { color: 'white' }]}>ZoneRunner</Text>
        </View>
        <TouchableOpacity
          style={[styles.shareButton, { borderColor: accentColor }]}
          onPress={async () => {
            if (!run) return;
            try {
              const choice = await new Promise<'camera' | 'library' | 'cancel'>((resolve) => {
                Alert.alert(
                  'Share background',
                  'Choose a photo to place behind your run.',
                  [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
                    { text: 'Library', onPress: () => resolve('library') },
                    { text: 'Camera', onPress: () => resolve('camera') },
                  ]
                );
              });
              if (choice === 'cancel') return;

              let uri: string | undefined;
              if (choice === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (perm.status !== 'granted') {
                  Alert.alert('Camera required', 'Enable camera access to add a photo background.');
                  return;
                }
                const photo = await ImagePicker.launchCameraAsync({
                  allowsEditing: false,
                  quality: 0.85,
                });
                uri = !photo.canceled && photo.assets?.length ? photo.assets[0].uri : undefined;
              } else {
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (perm.status !== 'granted') {
                  Alert.alert('Library access required', 'Allow photo library to pick a background.');
                  return;
                }
                const photo = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  quality: 0.85,
                });
                uri = !photo.canceled && photo.assets?.length ? photo.assets[0].uri : undefined;
              }

              router.push({
                pathname: '/share-preview',
                params: { id: run.id?.toString(), bg: uri },
              });
            } catch (e) {
              console.log('Camera open failed', e);
              router.push({
                pathname: '/share-preview',
                params: { id: run.id?.toString() },
              });
            }
          }}
        >
          <Text style={[styles.backButtonText, { color: accentColor }]}>Share</Text>
        </TouchableOpacity>
      </View>

      {groupBadge ? <Text style={styles.groupBadge}>{groupBadge}</Text> : null}
      <Text style={styles.dateText}>{dateText}</Text>

      <View style={[styles.statsRow, { borderColor: accentColor, shadowColor: accentColor }]}>
        <View style={styles.statChip}>
          <Text style={[styles.statLabel, { color: accentColor }]}>Distance</Text>
          <Text style={styles.statValue}>{formatDistance(run.distance)}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statLabel, { color: accentColor }]}>Pace</Text>
          <Text
            style={styles.statValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            ellipsizeMode="tail"
          >
            {formatPace(run.distance, run.elapsedSeconds)}
          </Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statLabel, { color: accentColor }]}>Time</Text>
          <Text style={styles.statValue}>{formatElapsed(run.elapsedSeconds)}</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          mapStyle={OSM_STYLE_URL}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          scrollEnabled={false}
          zoomEnabled={false}
          onDidFinishLoadingMap={() => {
            setMapReady(true);
            fitRoute();
          }}
          onLayout={fitRoute}
        >
          <Camera
            ref={cameraRef}
            centerCoordinate={initialCamera.center}
            zoomLevel={initialCamera.zoom}
            animationDuration={300}
            animationMode="easeTo"
          />
          {routeFeatures.features.length > 0 && (
            <ShapeSource id="run-route" shape={routeFeatures}>
              <FillLayer
                id="run-route-fill"
                style={{
                  fillColor: ['get', 'fillColor'],
                  fillOpacity: 1,
                }}
              />
              <LineLayer
                id="run-route-line"
                style={{
                  lineColor: ['get', 'lineColor'],
                  lineWidth: 3,
                }}
              />
            </ShapeSource>
          )}
        </MapView>
        <OsmAttribution />
      </View>

      <View style={[styles.areaPill, { borderColor: accentColor }]}>
        <Text style={[styles.areaPillLabel, { color: accentColor }]}>
          Area Captured
        </Text>
        <Text style={styles.areaPillValue}>
          {(run.areaKm2 ?? 0).toFixed(2)} km²
        </Text>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  center: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loadingText: {
    marginTop: 8,
    color: '#ccc',
    textAlign: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    marginBottom: 4,
  },
  meta: {
    color: '#ccc',
    fontSize: 16,
    marginBottom: 4,
  },
  groupBadge: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111827',
    color: '#22c55e',
    fontWeight: '800',
  },
  dateText: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 14,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#0b1120',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    alignItems: 'center',
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  areaPill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1120',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 0,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#22c55e',
  },
  areaPillLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  areaPillValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  mapContainer: {
    height: 540,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#0b1120',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  map: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  shareButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e',
    backgroundColor: 'rgba(15,23,42,0.8)',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

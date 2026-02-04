import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadUserProfile } from '../lib/authService';
import { auth } from '../lib/firebaseConfig';
import { RunSaveService } from '../lib/runSaveService';
import { useMode } from '../lib/modeContext';
import { perfLog } from '../lib/perfLogger';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { useRunTrackingEngine, type RunCoord } from '../hooks/useRunTrackingEngine';
import { endActiveGroupRun, getGroupById } from '../lib/groupService';
import { MonthlyChallengesService } from '../lib/monthlyChallengesService';
import { YearlyChallengesService } from '../lib/yearlyChallengesService';
import { checkAndRecordMainRanking } from '../lib/rankingTracker';
import { formatDistance } from '../lib/utils/format';
import { formatPace, formatElapsed } from '../lib/utils/runMetrics';
import {
  BG_GROUP_OPT_IN_KEY,
  BG_RUN_OPT_IN_KEY,
  clearBackgroundBuffer,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../lib/runBackgroundTracking';
import { finalizeRun } from '../lib/runFinalizer';
import { useRenderTrace } from '../hooks/useRenderTrace';
import RunMap from '../components/maps/RunMap';
import { regionToCenterZoom, type LatLng } from '../lib/maps/geojson';

type Coord = RunCoord;
type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const PROFILE_KEY = 'zonerunner:profile';

function computeBearing(from: { latitude: number; longitude: number } | null, to: { latitude: number; longitude: number } | null) {
  if (!from || !to) return null;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x);
  const deg = (brng * 180) / Math.PI;
  return (deg + 360) % 360;
}

// MapLibre view is loaded via lib/maplibre.ts to avoid web native module errors.

// Background task + buffer handling is implemented in `lib/runBackgroundTracking.ts`.
const MAP_LITE_DURING_RUN = true;

export default function RunWindow() {
  const router = useRouter();
  const { mode: modeParam, runType: runTypeParam } = useLocalSearchParams<{ mode?: string; runType?: string }>();
  const { activeGroupId } = useMode();
  const cameraRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const initialRegionRef = useRef<Region | null>(null);
  const [starting, setStarting] = useState(true);
  const [accentColor, setAccentColor] = useState('#22c55e');
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [profileCountryCode, setProfileCountryCode] = useState<string | null>(null);
  const [profileStateCode, setProfileStateCode] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'waiting' | 'ok' | 'denied'>('waiting');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [caloriesBurned, setCaloriesBurned] = useState(0);
  const backgroundStartedRef = useRef(false);
  const [directionMode, setDirectionMode] = useState<'north' | 'direction'>('direction');
  const smoothedHeadingRef = useRef<number | null>(null);
  const [bgRunAllowed, setBgRunAllowed] = useState(false);
  const runMode: 'personal' | 'group' = modeParam === 'group' ? 'group' : 'personal';
  const groupRunType: 'casual' | 'official' = runTypeParam === 'casual' ? 'casual' : 'official';
  const lastCameraRef = useRef<{
    latitude: number;
    longitude: number;
    heading: number;
    ts: number;
  } | null>(null);
  const lastCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const setCameraToRegion = useCallback(
    (
      region: Region,
      opts?: { duration?: number; pitch?: number; heading?: number; zoomOverride?: number }
    ) => {
      const { center, zoom } = regionToCenterZoom(region);
      cameraRef.current?.setCamera({
        centerCoordinate: center,
        zoomLevel: opts?.zoomOverride ?? zoom,
        pitch: opts?.pitch ?? 0,
        heading: opts?.heading ?? 0,
        animationDuration: opts?.duration ?? 300,
      });
    },
    []
  );

  const startTimeRef = useRef<Date | null>(null);
  const autoStartRef = useRef(false);
  const isExpoGo = Constants.appOwnership === 'expo';
  const runIdRef = useRef<string | null>(null);

  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const cameraUpdateCountRef = useRef(0);

  const trackingEngine = useRunTrackingEngine({
    uiUpdateIntervalMs: 1000,
    routeUpdateIntervalMs: 2500,
    debugLabel: 'run-window',
    onRawLocation: (coord, accuracy) => {
      setGpsStatus('ok');
      setGpsAccuracy(Number.isFinite(accuracy) ? accuracy : null);
      if (!initialRegionRef.current) {
        const region: Region = {
          latitude: coord.latitude,
          longitude: coord.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
        initialRegionRef.current = region;
        setInitialRegion(region);
        setStarting(false);
      }
    },
    onAcceptedPoint: () => {
      // no-op; hook handles distance/route updates
    },
  });

  const {
    start: startTracking,
    stop: stopTracking,
    togglePause: toggleTrackingPause,
    isTrackingRef,
  } = trackingEngine;

  const tracking = trackingEngine.tracking;
  const paused = trackingEngine.paused;
  const route = trackingEngine.route as Coord[];
  const setRoute = trackingEngine.setRoute;
  const distanceMeters = trackingEngine.distanceMeters;
  const elapsedSeconds = trackingEngine.elapsedSeconds;

  const initialCamera = useMemo(() => {
    if (!initialRegion) return null;
    return regionToCenterZoom(initialRegion);
  }, [initialRegion]);

  const routeCoords = useMemo(
    () =>
      route.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })) as LatLng[],
    [route]
  );

  useRenderTrace({
    screen: 'RunWindow',
    label: 'RunWindow',
    props: {
      tracking,
      paused,
      routePoints: route.length,
      hasRegion: !!initialRegion,
      mode: runMode,
    },
  });

  const liveLocation = useLiveLocation({
    enabled: !tracking && !paused,
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5000,
    distanceInterval: 15,
  });

  useEffect(() => {
    initialRegionRef.current = initialRegion;
  }, [initialRegion]);

  const requestBackgroundConsent = useCallback(
    (context: 'personal' | 'group'): Promise<boolean> => {
      return new Promise((resolve) => {
        Alert.alert(
          'Keep tracking if the screen locks?',
          context === 'group'
            ? 'Allow ZoneRunner to keep recording this group run in the background while your screen is locked. Used only during an active group run.'
            : 'Allow ZoneRunner to keep recording your run in the background while your screen is locked. Used only during an active run.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Allow',
              onPress: () => resolve(true),
            },
          ]
        );
      });
    },
    []
  );

  const ensureBackgroundPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    // iOS requires explicit background permission for continued GPS.
    const existing = await Location.getBackgroundPermissionsAsync();
    if (existing.status === 'granted') return true;

    const request = await Location.requestBackgroundPermissionsAsync();
    if (request.status === 'granted') return true;

    Alert.alert(
      'Background location not enabled',
      'We will only record distance while the app stays in the foreground. You can enable background access in Settings if you want runs to keep recording when the screen locks.'
    );
    return false;
  }, []);

  const startRun = useCallback(async () => {
    if (isTrackingRef.current) return;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      const status = permission.status;
      if (__DEV__) {
        console.log('[RunWindow] foreground permission', {
          status,
          canAskAgain: permission.canAskAgain,
        });
      }
      if (status !== 'granted') {
        setGpsStatus('denied');
        Alert.alert(
          'Location required',
          'Enable Precise Location to track your run.'
        );
        return;
      }
      setGpsStatus('waiting');

      runIdRef.current = RunSaveService.createRunId();
      startTracking();

      const now = new Date();
      startTimeRef.current = now;

      // Clear background cache and start background updates
      // Background updates are nice-to-have; they must never block foreground tracking.
      // Expo Go can't include the required native background modes reliably, so skip it there.
      void (async () => {
        try {
          await clearBackgroundBuffer();

          if (isExpoGo) return;

          let allowBackground = bgRunAllowed;
          if (!bgRunAllowed) {
            const granted = await requestBackgroundConsent(runMode);
            allowBackground = granted;
            if (granted) {
              setBgRunAllowed(true);
              await AsyncStorage.setItem(BG_RUN_OPT_IN_KEY, 'yes');
              if (runMode === 'group') {
                await AsyncStorage.setItem(BG_GROUP_OPT_IN_KEY, 'yes');
              }
            } else {
              await AsyncStorage.setItem(BG_RUN_OPT_IN_KEY, 'no');
              if (runMode === 'group') {
                await AsyncStorage.setItem(BG_GROUP_OPT_IN_KEY, 'no');
              }
            }
          }

          if (!allowBackground) return;

          const ok = await ensureBackgroundPermission();
          if (!ok) return;

          if (backgroundStartedRef.current) return;

          await startBackgroundTracking();
          backgroundStartedRef.current = true;
        } catch (e) {
          console.log('Failed to start background tracking', e);
        }
      })();
    } catch (e) {
      console.log('Failed to start run', e);
      stopTracking();
    }
  }, [
    bgRunAllowed,
    runMode,
    ensureBackgroundPermission,
    requestBackgroundConsent,
    isExpoGo,
    isTrackingRef,
    startTracking,
    stopTracking,
  ]);

  const startRunRef = useRef(startRun);
  startRunRef.current = startRun;

  // Keep profile/bg consent fresh when switching between personal/group runs.
  useEffect(() => {
    (async () => {
      try {
        const storedProfile = await AsyncStorage.getItem(PROFILE_KEY);
        if (storedProfile) {
          const parsed = JSON.parse(storedProfile);
          if (parsed?.territoryColor && typeof parsed.territoryColor === 'string') {
            setAccentColor(parsed.territoryColor);
          }
        }
        if (runMode === 'group' && activeGroupId) {
          try {
            const group = await getGroupById(activeGroupId);
            if (group?.color) {
              setAccentColor(group.color);
            }
          } catch {
            // ignore
          }
        }
        // Try to load weight from Firestore for calories
        if (auth.currentUser?.uid) {
          try {
            const profile = await loadUserProfile(auth.currentUser.uid);
            if (profile?.weightKg) {
              setWeightKg(profile.weightKg);
            }
            setProfileCountryCode(profile?.countryCode ?? null);
            setProfileStateCode(profile?.stateCode ?? null);
          } catch (err) {
            console.log('Failed to load profile weight', err);
          }
        }
      } catch (e) {
        console.log('Failed to load profile color for run window', e);
      }

      // Load background opt-in for group runs (keep GPS alive when screen locks)
      try {
        const consentPairs = await AsyncStorage.multiGet([
          BG_RUN_OPT_IN_KEY,
          BG_GROUP_OPT_IN_KEY,
        ]);
        const runConsent = consentPairs.find((p) => p[0] === BG_RUN_OPT_IN_KEY)?.[1];
        const groupConsent = consentPairs.find((p) => p[0] === BG_GROUP_OPT_IN_KEY)?.[1];
        const allowed = runConsent === 'yes' || groupConsent === 'yes';
        setBgRunAllowed(allowed);
      } catch {
        setBgRunAllowed(false);
      }
    })();
  }, [runMode, activeGroupId]);

  // Ask for location & center map on mount.
  // Important: this effect must NOT re-run during a run, otherwise its cleanup
  // will clear the timer/location watch and the elapsed time can appear "stuck".
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location required',
            'Enable location permissions to track your run.'
          );
          setStarting(false);
          return;
        }

        // Start tracking immediately after permission is granted. We still try to
        // center the map using last-known/current location, but we don't block the
        // timer/GPS watcher on `getCurrentPositionAsync` (which can be slow/hang).
        if (!autoStartRef.current) {
          autoStartRef.current = true;
          void startRunRef.current();
        }

        // Quick center using last known location (fast, maybe coarse)
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setInitialRegion({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
          setRoute((prev) =>
            prev.length
              ? prev
              : [{ latitude: last.coords.latitude, longitude: last.coords.longitude, ts: Date.now() }]
          );
          setStarting(false);
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const region: Region = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };

        setInitialRegion((prev) => prev ?? region);
        setRoute((prev) =>
          prev.length ? prev : [{ latitude: region.latitude, longitude: region.longitude, ts: Date.now() }]
        );
        setStarting(false);

        setCameraToRegion(region, { duration: 500 });

      } catch (err) {
        console.log('Failed to get initial location', err);
        setStarting(false);
      }
    })();

    return () => {
      // Clean up (unmount only)
      if (backgroundStartedRef.current) {
        stopBackgroundTracking();
        backgroundStartedRef.current = false;
      }
    };
  }, []);

  const togglePause = useCallback(() => {
    toggleTrackingPause();
  }, [toggleTrackingPause]);

  // Update calories as distance/time change
  useEffect(() => {
    const weight = weightKg ?? 70; // default if unknown
    // Simple running calorie estimate ~1 kcal per kg per km
    const km = distanceMeters / 1000;
    const kcal = weight * km;
    setCaloriesBurned(kcal);
  }, [distanceMeters, weightKg]);

  const stopRun = useCallback(async () => {
    if (!tracking) {
      router.back();
      return;
    }

    try {
      stopTracking();

      const startTime = startTimeRef.current ?? new Date();
      const elapsed = elapsedSeconds;
      const { distanceMeters: distance, areaKm2, runPayload } = await finalizeRun({
        route,
        distanceMeters,
        elapsedSeconds: elapsed,
        startedAt: startTime,
        mode: runMode === 'group' ? 'group' : 'personal',
        groupId: activeGroupId ?? undefined,
        groupRunType,
      });
      const enrichedRunPayload = {
        ...runPayload,
        countryCode: profileCountryCode ?? runPayload.countryCode,
        stateCode: profileStateCode ?? runPayload.stateCode,
      };

      // Do not save runs with 0 recorded distance.
      if (!Number.isFinite(distance) || distance <= 0) {
        if (runMode === 'group' && activeGroupId) {
          try {
            await endActiveGroupRun(activeGroupId);
          } catch (e) {
            console.log('Failed to clear active group run', e);
          }
        }
        Alert.alert('Run discarded', 'No distance was recorded for this run.');
        router.back();
        return;
      }

      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) {
        Alert.alert(
          "You're not signed in",
          'Sign in to save runs to your history.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
            { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
          ]
        );
        return;
      }

      if (runMode === 'group' && !activeGroupId) {
        Alert.alert('Select a group first', 'Pick a group before saving a group run.');
        return;
      }

      const stableRunId = runIdRef.current ?? RunSaveService.createRunId();
      const saveResult = await RunSaveService.saveRun(currentUserId, enrichedRunPayload, { runId: stableRunId });
      if (saveResult.status === 'saved' || saveResult.status === 'queued') {
        // Post-save processing must never block persistence or navigation.
        void (async () => {
          try {
            await MonthlyChallengesService.ingestRun({
              userId: currentUserId,
              runId: saveResult.runId,
              run: {
                userId: currentUserId,
                distance: Math.max(0, distance),
                elapsedSeconds: Math.max(0, elapsed),
                startedAt: startTime.toISOString(),
                route: (runPayload.route as any) ?? [],
                areaKm2: Math.max(0, areaKm2),
                createdAt: runPayload.createdAt,
                mode: runPayload.mode,
                scope: runPayload.scope,
                groupId: runPayload.groupId,
                groupRunType: runPayload.groupRunType,
                countryCode: enrichedRunPayload.countryCode,
                stateCode: enrichedRunPayload.stateCode,
              } as any,
            });
            await YearlyChallengesService.ingestRun({
              userId: currentUserId,
              runId: saveResult.runId,
              run: {
                userId: currentUserId,
                distance: Math.max(0, distance),
                elapsedSeconds: Math.max(0, elapsed),
                startedAt: startTime.toISOString(),
                route: (runPayload.route as any) ?? [],
                areaKm2: Math.max(0, areaKm2),
                createdAt: runPayload.createdAt,
                mode: runPayload.mode,
                scope: runPayload.scope,
                groupId: runPayload.groupId,
                groupRunType: runPayload.groupRunType,
                countryCode: enrichedRunPayload.countryCode,
                stateCode: enrichedRunPayload.stateCode,
              } as any,
            });
          } catch (e) {
            console.log('Failed to ingest run into monthly challenges', e);
          }
        })();
      }
      if (saveResult.status === 'saved') {
        // Best-effort: rankings can change after a run is saved.
        void checkAndRecordMainRanking({ userId: currentUserId, reason: 'after_run_save' });
      }

      if (runMode === 'group' && activeGroupId) {
        try {
          await endActiveGroupRun(activeGroupId);
        } catch (e) {
          console.log('Failed to clear active group run', e);
        }
      }

      // Go straight to run details
      if (saveResult.status === 'saved' || saveResult.status === 'queued') {
        router.replace({
          pathname: '/run-detail',
          params: { id: saveResult.runId },
        });
      } else if (saveResult.status === 'auth_required') {
        Alert.alert(
          "You're not signed in",
          saveResult.message,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
            { text: 'Sign in', onPress: () => router.replace('/(auth)/login') },
          ]
        );
      } else {
        Alert.alert(
          'Run not saved',
          'We could not save this run locally or to the server. Please try again.',
          [
            { text: 'OK', onPress: () => router.back() },
            {
              text: 'Try again',
              onPress: async () => {
                const retry = await RunSaveService.saveRun(currentUserId, enrichedRunPayload, { runId: stableRunId });
                if (retry.status === 'saved') {
                  router.replace({
                    pathname: '/run-detail',
                    params: { id: retry.runId },
                  });
                }
              },
            },
          ]
        );
      }
    } catch (e) {
      console.log('Failed to stop/save run', e);
      Alert.alert('Error', 'Could not save your run.');
      router.back();
    }
  }, [
    distanceMeters,
    elapsedSeconds,
    route,
    tracking,
    router,
    activeGroupId,
    runMode,
    groupRunType,
    profileCountryCode,
    profileStateCode,
    stopTracking,
  ]);

  const scale = Math.min(1, screenHeight / 760);
  const mapHeight = Math.max(180, Math.min(260, screenHeight * 0.3));

  useEffect(() => {
    if (!liveLocation.coords || !cameraRef.current) return;
    if (tracking && MAP_LITE_DURING_RUN) return;

    const last = lastCameraRef.current;
    const now = Date.now();
    const rawHeadingInput = directionMode === 'direction' ? liveLocation.heading : 0;
    const hasSensorHeading = Number.isFinite(rawHeadingInput) && (rawHeadingInput ?? -1) >= 0;
    const prevCoord = lastCoordRef.current;
    const currentCoord = { latitude: liveLocation.coords.latitude, longitude: liveLocation.coords.longitude };
    const movementBearing = computeBearing(prevCoord, currentCoord);
    const blendedHeading = (() => {
      if (hasSensorHeading && movementBearing !== null) {
        // blend 70% sensor, 30% movement for stability
        const a = rawHeadingInput as number;
        const b = movementBearing;
        const diff = ((b - a + 540) % 360) - 180;
        return (a + diff * 0.3 + 360) % 360;
      }
      if (hasSensorHeading) return rawHeadingInput as number;
      if (movementBearing !== null) return movementBearing;
      return smoothedHeadingRef.current ?? last?.heading ?? 0;
    })();
    const prevSmooth = smoothedHeadingRef.current ?? blendedHeading;
    const diff = ((blendedHeading - prevSmooth + 540) % 360) - 180; // shortest signed difference
    const alpha = 0.2; // smoothing factor
    const smoothHeading = (prevSmooth + diff * alpha + 360) % 360;
    smoothedHeadingRef.current = smoothHeading;
    const headingForMode = directionMode === 'direction' ? smoothHeading : 0;

    const headingDelta = last
      ? Math.abs(((headingForMode - last.heading + 540) % 360) - 180)
      : 999;

    const latDelta = last ? liveLocation.coords.latitude - last.latitude : 0;
    const lonDelta = last ? liveLocation.coords.longitude - last.longitude : 0;
    const movedFar =
      !last ||
      Math.sqrt(latDelta * latDelta + lonDelta * lonDelta) > 0.000025; // ~2.5m

    const timeDelta = last ? now - last.ts : 1000;
    const headingChangedEnough = headingDelta > 10 || timeDelta > 1200;

    if (!movedFar && !headingChangedEnough) return;

    cameraUpdateCountRef.current += 1;
    cameraRef.current?.setCamera({
      centerCoordinate: [
        liveLocation.coords.longitude,
        liveLocation.coords.latitude,
      ],
      pitch: 45,
      zoomLevel: 17,
      heading: headingForMode,
      animationDuration: 350,
    });

    lastCameraRef.current = {
      latitude: liveLocation.coords.latitude,
      longitude: liveLocation.coords.longitude,
      heading: headingForMode,
      ts: now,
    };
    lastCoordRef.current = currentCoord;
  }, [directionMode, liveLocation, tracking]);

  useEffect(() => {
    if (!__DEV__) return;
    const interval = setInterval(() => {
      perfLog({
        screen: 'RunWindow',
        phase: 'MAP',
        label: 'camera-updates',
        durationMs: 0,
        meta: {
          renders: renderCountRef.current,
          cameraUpdates: cameraUpdateCountRef.current,
          routePoints: route.length,
          tracking,
          paused,
        },
      });
      renderCountRef.current = 0;
      cameraUpdateCountRef.current = 0;
    }, 5000);
    return () => clearInterval(interval);
  }, [paused, route.length, tracking]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.headerRow, { paddingTop: 8 + insets.top * 0.25 }]}>
          <Text style={styles.headerTitle}>Running</Text>
        <TouchableOpacity
          style={[
            styles.headingToggle,
            directionMode === 'direction' && styles.headingToggleActive,
          ]}
          onPress={() =>
            setDirectionMode((prev) => (prev === 'north' ? 'direction' : 'north'))
          }
        >
          <Text style={styles.headingToggleText}>
            {directionMode === 'north' ? 'North-up' : 'Direction-up'}
          </Text>
        </TouchableOpacity>
      </View>
      {__DEV__ && (
        <Text style={styles.gpsStatusText}>
          {gpsStatus === 'denied'
            ? 'GPS: denied'
            : gpsStatus === 'ok'
              ? `GPS: ok (${gpsAccuracy !== null ? Math.round(gpsAccuracy) : '--'}m)`
              : 'GPS: waiting…'}
        </Text>
      )}

      <View style={[styles.mapContainer, { height: mapHeight }]}>
        {initialRegion ? (
          <RunMap
            cameraRef={cameraRef}
            initialRegion={initialRegion}
            initialCamera={initialCamera!}
            showUserLocation={!tracking}
            routeCoords={routeCoords}
            runActive={routeCoords.length > 1}
            routeColor="#1e90ff"
            allowInteraction={!tracking && !MAP_LITE_DURING_RUN}
            onMapReady={() => {
              perfLog({
                screen: 'RunWindow',
                phase: 'MAP',
                label: 'mapReady',
                durationMs: 0,
              });
              if (initialRegion) {
                setCameraToRegion(initialRegion, { duration: 500, zoomOverride: 17 });
              }
            }}
          />
        ) : (
          <View style={styles.loadingMap}>
            <ActivityIndicator size="small" color="#e5e7eb" />
            <Text style={styles.loadingText}>Getting your location…</Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.statsContainer,
          {
            paddingHorizontal: 22 * scale,
            paddingTop: 20 * scale,
            paddingBottom: (32 * scale) + (insets.bottom || 0) + 8,
          },
        ]}
      >
        <View
          style={[
            styles.mainStatCard,
            { borderColor: accentColor, shadowColor: accentColor },
            {
              paddingVertical: 22 * scale,
              paddingHorizontal: 20 * scale,
              marginBottom: 22 * scale,
            },
          ]}
        >
          <Text style={[styles.mainStatLabel, { color: accentColor }]}>
            Distance
          </Text>
          <Text style={[styles.mainStatValue, { fontSize: 36 * scale }]}>
            {formatDistance(distanceMeters)}
          </Text>
        </View>

          <View style={styles.secondaryStatsRow}>
            <View
              style={[
                styles.secondaryStatCard,
                {
                  paddingVertical: 18 * scale,
                  paddingHorizontal: 14 * scale,
                },
              ]}
            >
              <Text style={[styles.secondaryStatLabel, { color: accentColor }]}>
                Time
              </Text>
              <Text style={[styles.secondaryStatValue, { fontSize: 22 * scale }]}>
                {formatElapsed(elapsedSeconds)}
              </Text>
            </View>
            <View
              style={[
                styles.secondaryStatCard,
                {
                  paddingVertical: 18 * scale,
                  paddingHorizontal: 14 * scale,
                },
              ]}
            >
              <Text style={[styles.secondaryStatLabel, { color: accentColor }]}>
                Pace
              </Text>
              <Text style={[styles.secondaryStatValue, { fontSize: 22 * scale }]}>
                {formatPace(distanceMeters, elapsedSeconds)}
              </Text>
            </View>
            <View
              style={[
                styles.secondaryStatCard,
                {
                  paddingVertical: 18 * scale,
                  paddingHorizontal: 14 * scale,
                },
              ]}
            >
              <Text style={[styles.secondaryStatLabel, { color: accentColor }]}>
                Elevation
              </Text>
              <Text style={[styles.secondaryStatValue, { fontSize: 22 * scale }]}>0 m</Text>
            </View>
            <View
              style={[
                styles.secondaryStatCard,
                {
                  paddingVertical: 18 * scale,
                  paddingHorizontal: 14 * scale,
                },
              ]}
            >
              <Text style={[styles.secondaryStatLabel, { color: accentColor }]}>
                Calories
              </Text>
              <Text style={[styles.secondaryStatValue, { fontSize: 22 * scale }]}>
                {Math.round(caloriesBurned)} kcal
              </Text>
            </View>
        </View>

        <View style={[styles.pauseContainer, { marginBottom: 8 * scale }]}>
          <TouchableOpacity
            style={[
              styles.pausePill,
              { borderColor: accentColor, shadowColor: accentColor },
              { width: `${Math.max(30, 35 * scale)}%`, paddingVertical: 8 * scale },
            ]}
            onPress={togglePause}
            disabled={starting || !tracking}
          >
            <Text style={[styles.pausePillText, { color: accentColor }]}>
              {paused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.stopButton,
              {
                paddingVertical: Math.max(10, 14 * scale),
                marginTop: 6 * scale,
              },
            ]}
            onPress={stopRun}
            disabled={starting}
          >
            <Text style={styles.stopButtonText}>
              {tracking ? 'End Run' : 'Close'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  gpsStatusText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  backText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
  },
  headingToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  headingToggleActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  headingToggleText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  mapContainer: {
    height: 280,
    borderRadius: 24,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
  },
  loadingMap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#9ca3af',
  },
  statsContainer: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 30,
    backgroundColor: '#020617',
  },
  mainStatCard: {
    width: '100%',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    backgroundColor: '#0b1120',
    borderWidth: 1.5,
    borderColor: '#22c55e',
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  mainStatLabel: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '700',
  },
  mainStatValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
  },
  secondaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 28,
    flexWrap: 'wrap',
  },
  secondaryStatCard: {
    flexBasis: '48%',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 14,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  secondaryStatLabel: {
    fontSize: 13,
    color: '#f8fafc',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '700',
  },
  secondaryStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
  },
// actionsRow, pauseButton, pauseButtonText, stopButtonWrapper styles removed
  stopButton: {
    marginTop: 4,
    width: '100%',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#b91c1c',
    shadowColor: '#b91c1c',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  stopButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
  pauseContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pausePill: {
    width: '35%',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pausePillText: {
    color: '#22c55e',
    fontWeight: '700',
    fontSize: 16,
  },
});

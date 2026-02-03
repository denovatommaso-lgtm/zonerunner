import Ionicons from '@/components/common/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoogleAuth } from '../../lib/auth';
import {
  territoryToMapPolygons,
} from '../../lib/territoryEngine';
import { useMode } from '../../lib/modeContext';
import { db } from '../../lib/firebaseConfig';
import {
  countAllGroups,
} from '../../lib/groupService';
import { useGroupRunJoinFlow } from '../../hooks/useGroupRunJoinFlow';
import FriendDetailModal from '../../components/modals/FriendDetailModal';
import TerritoryOwnerSheet from '../../components/territory/TerritoryOwnerSheet';
import { useTerritoryOwnerInspect, type TerritoryOwnerType } from '../../hooks/useTerritoryOwnerInspect';
import { useTerritoryMapData } from '../../hooks/useTerritoryMapData';
import { haversineMeters } from '../../lib/geo/geoMetrics';
import { GroupRunPickerModal } from '../../components/modals/GroupRunPickerModal';
import { useRenderTrace } from '../../hooks/useRenderTrace';
import { perfLog } from '../../lib/perfLogger';
import { invalidateCommunityTerritoryState } from '../../lib/territoryState';
import {
  featureCollection,
  hexToRgba,
  polygonFeature,
  regionToCenterZoom,
  type LatLng,
} from '../../lib/maps/geojson';
import TerritoryMap from '../../components/maps/TerritoryMap';

type LocationSubscription = Awaited<
  ReturnType<typeof Location.watchPositionAsync>
> | null;

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const COMMUNITY_FALLBACK_REGION: Region = {
  latitude: 20.967,
  longitude: -89.624,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

function regionFromLocation(coords: { latitude: number; longitude: number } | null): Region {
  if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }
  return COMMUNITY_FALLBACK_REGION;
}

function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getRunTimestamp(run: any): number {
  return toMillis(
    run?.endedAtMs ??
      run?.endedAt ??
      run?.createdAtMs ??
      run?.createdAt ??
      run?.startedAtMs ??
      run?.startedAt
  );
}

function boundsFromCoords(coords: LatLng[]) {
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
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  return { minLat, maxLat, minLng, maxLng, centerLat, centerLng, latSpan, lngSpan };
}

function regionFromBounds(bounds: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
  latSpan: number;
  lngSpan: number;
}): Region {
  const padLat = Math.max(0.0001, bounds.latSpan) * 0.15;
  const padLng = Math.max(0.0001, bounds.lngSpan) * 0.15;
  return {
    latitude: bounds.centerLat,
    longitude: bounds.centerLng,
    latitudeDelta: Math.max(0.0001, bounds.latSpan + padLat * 2),
    longitudeDelta: Math.max(0.0001, bounds.lngSpan + padLng * 2),
  };
}

function toLatLng(p: any): LatLng | null {
  if (!p) return null;

  const lat =
    typeof p.latitude === 'number'
      ? p.latitude
      : typeof p.lat === 'number'
        ? p.lat
        : typeof p.latitude === 'string'
          ? Number(p.latitude)
          : typeof p.lat === 'string'
            ? Number(p.lat)
            : null;

  const lng =
    typeof p.longitude === 'number'
      ? p.longitude
      : typeof p.lng === 'number'
        ? p.lng
        : typeof p.lon === 'number'
          ? p.lon
          : typeof p.longitude === 'string'
            ? Number(p.longitude)
            : typeof p.lng === 'string'
              ? Number(p.lng)
              : typeof p.lon === 'string'
                ? Number(p.lon)
                : null;

  if (Number.isFinite(lat as any) && Number.isFinite(lng as any)) {
    if (Math.abs(lat as number) > 90 && Math.abs(lng as number) <= 90) {
      return { latitude: lng as number, longitude: lat as number };
    }
    if (Math.abs(lat as number) <= 90 && Math.abs(lng as number) <= 180) {
      return { latitude: lat as number, longitude: lng as number };
    }
  }

  if (Array.isArray(p) && p.length >= 2) {
    const a = Number(p[0]);
    const b = Number(p[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const asGeo = { latitude: b, longitude: a };
    const asLatLng = { latitude: a, longitude: b };
    const geoOk = Math.abs(asGeo.latitude) <= 90 && Math.abs(asGeo.longitude) <= 180;
    const llOk = Math.abs(asLatLng.latitude) <= 90 && Math.abs(asLatLng.longitude) <= 180;
    if (geoOk) return asGeo;
    if (llOk) return asLatLng;
  }

  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('location_timeout')), ms)),
  ]);
}

// MapLibre view is loaded via lib/maplibre.ts to avoid web native module errors.

export default function TerritoryMapScreen() {
  const { user } = useGoogleAuth();
  const [currentRoute, setCurrentRoute] = useState<LatLng[]>([]);
  const [runActive, setRunActive] = useState(false);
  const [showUserLocation, setShowUserLocation] = useState(false);

const [initialRegion, setInitialRegion] = useState<Region | null>(null);
const [territoryColor, setTerritoryColor] = useState<string>('#1e90ff');
const router = useRouter();
const { mode: appMode, activeGroupId, setActiveGroupId, groups } = useMode();
const [allGroupCount, setAllGroupCount] = useState<number>(0);
const MAP_MODE_STORAGE_KEY = 'territoryMapMode';
const [mapMode, setMapMode] = useState<'personal' | 'group' | 'community'>('community');
const territoryMode: 'personal' | 'group' | 'community' = mapMode;
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshRef = useRef(0);
  const [communityEntryRefreshing, setCommunityEntryRefreshing] = useState(false);
  const COMMUNITY_ENTRY_COOLDOWN_MS = 3000;
  const COMMUNITY_ENTRY_FOCUS_REFRESH_MS = 30000;
  const lastCommunityEntryRefreshAtRef = useRef(0);
  const communityEntryInFlightRef = useRef<Promise<void> | null>(null);
  const communityEntryWarnCountRef = useRef(0);
  const communityCameraInitializedRef = useRef(false);
  const lastKnownUserLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
const {
  startJoinGroupRunFlow,
  selectionModal: joinFlowGroupPicker,
  lobbyModal: joinFlowLobby,
  needMoreModal: joinFlowNeedMore,
} = useGroupRunJoinFlow();

  const cameraRef = useRef<any>(null);

  const animateToRegion = useCallback((region: Region, duration = 300) => {
    if (typeof cameraRef.current?.setCamera !== 'function') return;
    const { center, zoom } = regionToCenterZoom(region);
    cameraRef.current?.setCamera({
      centerCoordinate: center,
      zoomLevel: zoom,
      animationDuration: duration,
    });
  }, []);

  const fitToCoordinates = useCallback(
    (
      coords: LatLng[],
      padding: { top: number; right: number; bottom: number; left: number } = {
        top: 40,
        right: 40,
        bottom: 40,
        left: 40,
      },
      duration = 350
    ) => {
      if (typeof cameraRef.current?.fitBounds !== 'function') return;
      const bounds = boundsFromCoords(coords);
      if (!bounds) return;
      const pad = Math.max(padding.top, padding.right, padding.bottom, padding.left);
      cameraRef.current?.fitBounds(
        [bounds.maxLng, bounds.maxLat],
        [bounds.minLng, bounds.minLat],
        pad,
        duration
      );
    },
    []
  );
  const locationSubRef = useRef<LocationSubscription>(null);
  const userLocationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    pastRuns,
    userColors,
    territories,
    ownerPolygons,
    myTerritory,
    totalAreaKm2,
    groupInfoById,
    userProfileCache,
    refreshCommunityColors,
    reloadTerritoryState,
    communityLoading,
    communityHasEverLoaded,
  } = useTerritoryMapData({
    userId: user?.uid,
    mode: territoryMode,
    groupId: activeGroupId,
    territoryColor,
  });
  const ownerLevels = useMemo(() => new Map<string, number>(), []);

  useRenderTrace({
    screen: 'TerritoryMap',
    label: 'TerritoryMapScreen',
    props: {
      mode: territoryMode,
      activeGroupId: activeGroupId ?? null,
      hasRegion: !!initialRegion,
      showUserLocation,
      pastRuns: pastRuns.length,
      owners: territories.size,
      polygons: ownerPolygons.length,
    },
  });

  const initialCamera = useMemo(() => {
    const region = initialRegion ?? COMMUNITY_FALLBACK_REGION;
    return regionToCenterZoom(region);
  }, [initialRegion]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(MAP_MODE_STORAGE_KEY);
        if (cancelled) return;
        if (stored === 'community' || stored === 'personal' || stored === 'group') {
          setMapMode(stored);
        } else {
          setMapMode('community');
        }
      } catch {
        if (!cancelled) setMapMode('community');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(MAP_MODE_STORAGE_KEY, mapMode).catch(() => {});
  }, [mapMode]);


  const deriveFallbackRegion = useCallback(() => {
    if (initialRegion) return null;
    const coords: LatLng[] = [];
    const maxPoints = 800;
    const addPoint = (p: LatLng) => {
      if (coords.length >= maxPoints) return;
      if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return;
      if (p.latitude === 0 && p.longitude === 0) return;
      coords.push(p);
    };

    const latestRun = pastRuns
      .slice()
      .sort((a, b) => {
        const aTs = a.createdAt ?? Date.parse(a.startedAt ?? '') ?? 0;
        const bTs = b.createdAt ?? Date.parse(b.startedAt ?? '') ?? 0;
        return bTs - aTs;
      })
      .find((run) => Array.isArray(run.route) && run.route.length > 1);
    if (latestRun?.route?.length) {
      for (const p of latestRun.route) addPoint(p);
    }

    if (!coords.length && myTerritory) {
      const rings = territoryToMapPolygons(myTerritory);
      for (const ring of rings) {
        for (const p of ring) addPoint(p);
        if (coords.length >= maxPoints) break;
      }
    }

    if (!coords.length && ownerPolygons.length) {
      for (const poly of ownerPolygons) {
        for (const ring of poly.rings) {
          for (const p of ring) addPoint(p);
          if (coords.length >= maxPoints) break;
        }
        if (coords.length >= maxPoints) break;
      }
    }

    if (!coords.length) return null;

    let minLat = coords[0].latitude;
    let maxLat = coords[0].latitude;
    let minLon = coords[0].longitude;
    let maxLon = coords[0].longitude;
    for (const p of coords) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLon) minLon = p.longitude;
      if (p.longitude > maxLon) maxLon = p.longitude;
    }

    const midLat = (minLat + maxLat) / 2;
    const midLon = (minLon + maxLon) / 2;
    const latDelta = Math.max(0.004, (maxLat - minLat) * 1.4);
    const lonDelta = Math.max(0.004, (maxLon - minLon) * 1.4);

    return {
      latitude: midLat,
      longitude: midLon,
      latitudeDelta: Math.min(0.5, latDelta),
      longitudeDelta: Math.min(0.5, lonDelta),
    };
  }, [initialRegion, myTerritory, ownerPolygons, pastRuns]);

  useEffect(() => {
    if (mapMode === 'community') return;
    if (mapMode === 'group') {
      countAllGroups().then(setAllGroupCount).catch(() => setAllGroupCount(0));
    }
  }, [mapMode]);

  useEffect(() => {
    return () => {
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
      if (userLocationTimeoutRef.current) {
        clearTimeout(userLocationTimeoutRef.current);
        userLocationTimeoutRef.current = null;
      }
    };
  }, []);

  const ensureLocationReady = useCallback(
    async (opts?: { allowActive?: boolean }) => {
      const allowActive = !!opts?.allowActive;
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        if (!allowActive) return null;
        const request = await Location.requestForegroundPermissionsAsync();
        if (request.status !== 'granted') {
          Alert.alert(
            'Location required',
            'Enable location permissions to track your territory.'
          );
          return null;
        }
      }

      // Fast path: show the map ASAP using last-known position (usually instant).
      const last = await Location.getLastKnownPositionAsync();
      if (last && !initialRegion) {
        lastKnownUserLocationRef.current = {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
        };
        const quickRegion: Region = {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
          latitudeDelta: 0.0085,
          longitudeDelta: 0.0085,
        };
        setInitialRegion(quickRegion);
        animateToRegion(quickRegion, 300);
      }

      if (!allowActive) return last ?? null;

      // Best-effort refinement: fetch a fresh location, but don't block UI forever.
      try {
        const loc = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          4500
        );

        const region: Region = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.0085,
          longitudeDelta: 0.0085,
        };
        lastKnownUserLocationRef.current = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };

        // Only “jump” if we didn't already set a region, or if it’s meaningfully different.
        if (!initialRegion) {
          setInitialRegion(region);
          animateToRegion(region, 500);
        } else {
          const moved = haversineMeters(
            { latitude: initialRegion.latitude, longitude: initialRegion.longitude },
            { latitude: region.latitude, longitude: region.longitude }
          );
          if (moved > 60) {
            setInitialRegion(region);
            animateToRegion(region, 450);
          }
        }
        return loc;
      } catch {
        return last ?? null;
      }
    },
    [initialRegion]
  );

  useEffect(() => {
    if (!initialRegion) {
      (async () => {
        try {
          await ensureLocationReady({ allowActive: false });
          if (!initialRegion) {
            const fallback = deriveFallbackRegion();
            if (fallback) {
              setInitialRegion(fallback);
              animateToRegion(fallback, 400);
            }
          }
        } catch (e) {
          console.log('Failed to ensure initial location', e);
        }
      })();
    }
  }, [deriveFallbackRegion, ensureLocationReady, initialRegion]);

  const recenterOnUser = async () => {
    try {
      setShowUserLocation(true);
      if (userLocationTimeoutRef.current) {
        clearTimeout(userLocationTimeoutRef.current);
      }
      userLocationTimeoutRef.current = setTimeout(() => {
        setShowUserLocation(false);
        userLocationTimeoutRef.current = null;
      }, 30000);
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        const request = await Location.requestForegroundPermissionsAsync();
        if (request.status !== 'granted') {
          setShowUserLocation(false);
          Alert.alert(
            'Location required',
            'Enable location permissions to recenter the map.'
          );
          return;
        }
      }

      // Try last known position first – this is usually instant
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        const region: Region = {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
          latitudeDelta: 0.0085,
          longitudeDelta: 0.0085,
        };
        animateToRegion(region, 300);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const region: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.0085,
        longitudeDelta: 0.0085,
      };

      animateToRegion(region, 300);
    } catch (e) {
      setShowUserLocation(false);
      console.log('Failed to recenter map', e);
    }
  };

  const focusOnTerritory = async () => {
    try {
      let coords: LatLng[] = [];

      if (mapMode === 'group') {
        const groupId = activeGroupId;
        const groupCoords: LatLng[] = ownerPolygons
          .filter((p: { ownerId: string }) => (groupId ? p.ownerId === groupId : true))
          .flatMap((p: { rings: LatLng[][] }) => p.rings)
          .flat();
        coords = groupCoords;
      }

      if (!coords.length) {
        const myRings = territoryToMapPolygons(myTerritory);
        if (myRings.length > 0) {
          coords = myRings.flat();
        } else {
          const ownedRuns = pastRuns.filter(
            (r) => r.userId === user?.uid && Array.isArray(r.route)
          );
          coords = ownedRuns.flatMap((r) =>
            r.route.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
            }))
          );
        }
      }

      if (!coords.length) {
        await recenterOnUser();
        return;
      }

      const filtered = coords.filter(
        (p) =>
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude) &&
          !(p.latitude === 0 && p.longitude === 0)
      );

      if (!filtered.length) {
        await recenterOnUser();
        return;
      }

      if (filtered.length === 1) {
        const p = filtered[0];
        animateToRegion(
          {
            latitude: p.latitude,
            longitude: p.longitude,
            latitudeDelta: 0.004,
            longitudeDelta: 0.004,
          },
          400
        );
      } else {
        fitToCoordinates(
          filtered,
          { top: 50, left: 50, right: 50, bottom: 70 },
          350
        );
      }
    } catch (e) {
      console.log('Failed to focus on territory', e);
      await recenterOnUser();
    }
  };

  const focusOnActiveGroupTerritory = async () => {
    try {
      let coords: LatLng[] = [];
      if (mapMode === 'group') {
        const groupId = activeGroupId;
        if (groupId) {
          coords = ownerPolygons
            .filter((p: { ownerId: string }) => p.ownerId === groupId)
            .flatMap((p: { rings: LatLng[][] }) => p.rings)
            .flat();
        }
      }
      if (!coords.length) {
        await recenterOnUser();
        return;
      }
      const filtered = coords.filter(
        (p) =>
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude) &&
          !(p.latitude === 0 && p.longitude === 0)
      );
      if (!filtered.length) {
        await recenterOnUser();
        return;
      }
      if (filtered.length === 1) {
        const p = filtered[0];
        animateToRegion(
          {
            latitude: p.latitude,
            longitude: p.longitude,
            latitudeDelta: 0.004,
            longitudeDelta: 0.004,
          },
          400
        );
      } else {
        fitToCoordinates(
          filtered,
          { top: 50, left: 50, right: 50, bottom: 70 },
          350
        );
      }
    } catch (e) {
      console.log('Failed to focus on group territory', e);
      await recenterOnUser();
    }
  };

  const stopRun = async () => {
    if (!runActive) return;

    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }

    setRunActive(false);

    setCurrentRoute([]);
  };

  const handlePrimaryButtonPress = async () => {
    if (runActive) {
      // Keep the existing stop behavior when a territory capture is active
      stopRun();
    } else {
      if (mapMode === 'group') {
        await startJoinGroupRunFlow('territoryMap');
        return;
      }
      // When idle, go to the live run screen (personal)
      router.push({ pathname: '/run-window', params: { mode: 'personal' } });
    }
  };

  // Sync territory color with user profile
  useEffect(() => {
    if (user?.profile?.territoryColor) {
      setTerritoryColor(user.profile.territoryColor);
    }
  }, [user?.profile, user?.uid]);

  const activeCoords: LatLng[] = currentRoute.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  const territoryFeatures = useMemo(() => {
    const features = [];
    if (ownerPolygons.length > 0) {
      ownerPolygons.forEach(
        ({ ownerId, rings }: { ownerId: string; rings: LatLng[][] }, idx: number) => {
          const color = userColors[ownerId] ?? '#6b7280';
          const ownerType: TerritoryOwnerType = mapMode === 'group' ? 'group' : 'user';
          rings.forEach((ring: LatLng[], ringIdx: number) => {
            if (ring.length < 3) return;
            features.push(
              polygonFeature(ring, {
                ownerId,
                ownerType,
                territoryId: `${ownerType}:${ownerId}:${idx}:${ringIdx}`,
                lineColor: color,
                fillColor: hexToRgba(color, 0.25),
              })
            );
          });
        }
      );
    } else {
      pastRuns.forEach((run) => {
        if (!run.route || run.route.length < 3) return;
        const ownerType: TerritoryOwnerType = run.groupId || (run as any).mode === 'group' ? 'group' : 'user';
        const ownerId =
          ownerType === 'group'
            ? run.groupId ?? run.userId ?? ''
            : run.userId ?? '';
        const color = userColors[ownerId] ?? '#6b7280';
        features.push(
          polygonFeature(run.route, {
            ownerId,
            ownerType,
            territoryId: `${ownerType}:${ownerId}:${run.id}`,
            lineColor: color,
            fillColor: hexToRgba(color, 0.22),
          })
        );
      });
    }
    return featureCollection(features);
  }, [mapMode, ownerPolygons, pastRuns, userColors]);

  const {
    selectedOwner,
    openOwnerSheet,
    closeOwnerSheet,
    openSelectedOwnerProfile,
    profileModalFriend: hookProfileModalFriend,
    profileModalRuns: hookProfileModalRuns,
    closeProfileModal,
  } = useTerritoryOwnerInspect({
    territories,
    territoryColor,
    userColors,
    mode: territoryMode,
    groupInfoById,
    userProfileCache,
    pastRuns: pastRuns.map((r) => ({
      id: r.id,
      distance: r.distance,
      startedAt: r.startedAt,
      createdAt: r.createdAt,
      userId: r.userId,
    })),
    ownerLevels,
  });

  const handleTerritoryPress = useCallback(
    (payload: any) => {
      const feature = payload?.features?.[0];
      const props = feature?.properties ?? payload ?? {};
      if (!props.ownerId || !props.ownerType || !props.territoryId) return;
      openOwnerSheet({
        ownerId: props.ownerId,
        ownerType: props.ownerType as TerritoryOwnerType,
        territoryId: props.territoryId as string,
      });
    },
    [openOwnerSheet]
  );

  const playersInArea = Math.max(
    1,
    Array.from(territories.values()).filter(Boolean).length
  );
  const mapCount = mapMode === 'group'
    ? Math.max(0, allGroupCount)
    : playersInArea;
  const isCommunityBusy = communityLoading || communityEntryRefreshing;
  const isCommunityEmpty =
    mapMode === 'community' &&
    !isCommunityBusy &&
    communityHasEverLoaded &&
    territories.size === 0 &&
    ownerPolygons.length === 0;
  const mapCountLabel =
    mapMode === 'personal'
      ? 'Personal'
      : mapMode === 'group'
        ? `${mapCount} ${mapCount === 1 ? 'group' : 'groups'}`
        : mapMode === 'community'
          ? `${playersInArea} ${playersInArea === 1 ? 'Runner' : 'Runners'}`
          : `${playersInArea} ${playersInArea === 1 ? 'player' : 'players'}`;
  const groupStartLabel = 'Group run';
  const communityDebugAgeMs = Date.now() - (lastCommunityEntryRefreshAtRef.current || 0);
  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId),
    [activeGroupId, groups]
  );
  const latestRunRouteCoords = useMemo(() => {
    if (!pastRuns.length) return [];
    let best: any = null;
    let bestTs = 0;
    for (const run of pastRuns) {
      if (!Array.isArray(run.route) || run.route.length < 2) continue;
      const ts = getRunTimestamp(run);
      if (!best || ts > bestTs) {
        best = run;
        bestTs = ts;
      }
    }
    if (!best?.route) return [];
    return (best.route as any[])
      .map(toLatLng)
      .filter((c: LatLng | null): c is LatLng => !!c);
  }, [pastRuns]);

  const handleRefreshWithOpts = useCallback(
    async (opts?: { silent?: boolean }) => {
      const showSpinner = !opts?.silent;
      try {
        if (showSpinner) setRefreshing(true);
        await ensureLocationReady({ allowActive: false });
        if (mapMode === 'group') {
          await countAllGroups().then(setAllGroupCount).catch(() => setAllGroupCount(0));
        }
        if (!initialRegion) {
          const fallback = deriveFallbackRegion();
          if (fallback) {
            setInitialRegion(fallback);
            animateToRegion(fallback, 400);
          }
        }
        lastRefreshRef.current = Date.now();
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [
      deriveFallbackRegion,
      ensureLocationReady,
      initialRegion,
      mapMode,
      refreshCommunityColors,
      territoryMode,
    ]
  );

  useEffect(() => {
    void handleRefreshWithOpts({ silent: true });
  }, [handleRefreshWithOpts]);

  const lastMapModeRef = useRef<'personal' | 'group' | 'community' | null>(null);
  const runCommunityEntryRefresh = useCallback(
    async (reason: 'mode_change' | 'focus') => {
      if (mapMode !== 'community') return;
      if (communityEntryInFlightRef.current) {
        if (__DEV__ && communityEntryWarnCountRef.current < 3) {
          communityEntryWarnCountRef.current += 1;
          console.warn(`[CommunityEntryRefresh] skipped: in_flight reason=${reason}`);
        }
        return;
      }
      const now = Date.now();
      if (now - lastCommunityEntryRefreshAtRef.current < COMMUNITY_ENTRY_COOLDOWN_MS) {
        if (__DEV__ && communityEntryWarnCountRef.current < 3) {
          communityEntryWarnCountRef.current += 1;
          console.warn(`[CommunityEntryRefresh] skipped: cooldown reason=${reason}`);
        }
        return;
      }
      setCommunityEntryRefreshing(true);
      const run = (async () => {
        try {
          invalidateCommunityTerritoryState();
          await reloadTerritoryState();
          refreshCommunityColors();
        } finally {
          lastCommunityEntryRefreshAtRef.current = Date.now();
          communityEntryInFlightRef.current = null;
          setCommunityEntryRefreshing(false);
        }
      })();
      communityEntryInFlightRef.current = run;
      await run;
    },
    [invalidateCommunityTerritoryState, mapMode, refreshCommunityColors, reloadTerritoryState]
  );

  useEffect(() => {
    const prevMode = lastMapModeRef.current;
    lastMapModeRef.current = mapMode;
    if (mapMode !== 'community') {
      setCommunityEntryRefreshing(false);
      communityCameraInitializedRef.current = false;
      return;
    }
    if (prevMode !== 'community') {
      void runCommunityEntryRefresh('mode_change');
    }
  }, [mapMode, runCommunityEntryRefresh]);

  useEffect(() => {
    if (mapMode !== 'community') return;
    if (communityCameraInitializedRef.current) return;
    if (isCommunityBusy) return;
    const normalizeCoords = (raw: any[]) => {
      let coords = raw.map(toLatLng).filter((c): c is LatLng => !!c);
      if (coords.length > 8000) {
        const step = Math.ceil(coords.length / 8000);
        coords = coords.filter((_, i) => i % step === 0);
      }
      return coords;
    };
    const isBoundsSane = (bounds: ReturnType<typeof boundsFromCoords>) => {
      if (!bounds) return false;
      const nearZero = Math.abs(bounds.centerLat) < 0.5 && Math.abs(bounds.centerLng) < 0.5;
      const absurd = bounds.latSpan > 120 || bounds.lngSpan > 240;
      return !nearZero && !absurd;
    };
    const fitToCoords = (coords: LatLng[]) => {
      const bounds = boundsFromCoords(coords);
      if (!bounds || !isBoundsSane(bounds)) return false;
      fitToCoordinates(coords, { top: 40, right: 40, bottom: 180, left: 40 }, 350);
      communityCameraInitializedRef.current = true;
      return true;
    };

    const runCoords = normalizeCoords(latestRunRouteCoords);
    if (runCoords.length && fitToCoords(runCoords)) return;

    const myOwnerId = user?.uid ?? null;
    const myPoly = myOwnerId ? ownerPolygons.find((p) => p.ownerId === myOwnerId) : null;
    const myPolyCoords = normalizeCoords(myPoly?.rings?.flat() ?? []);
    if (myPolyCoords.length && fitToCoords(myPolyCoords)) return;

    const allCoords = normalizeCoords(ownerPolygons.flatMap(({ rings }) => rings.flat()));
    if (allCoords.length && fitToCoords(allCoords)) return;

    (async () => {
      let last = lastKnownUserLocationRef.current;
      if (!last) {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          try {
            last = await Location.getLastKnownPositionAsync().then((p) =>
              p ? { latitude: p.coords.latitude, longitude: p.coords.longitude } : null
            );
          } catch {
            last = null;
          }
        }
      }
      const fallback = regionFromLocation(last);
      setInitialRegion(fallback);
      animateToRegion(fallback, 350);
      communityCameraInitializedRef.current = true;
    })();
  }, [isCommunityBusy, latestRunRouteCoords, mapMode, ownerPolygons, setInitialRegion, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      if (mapMode === 'community') {
        const now = Date.now();
        const stale = now - lastCommunityEntryRefreshAtRef.current > COMMUNITY_ENTRY_FOCUS_REFRESH_MS;
        if (!communityHasEverLoaded || stale) {
          void runCommunityEntryRefresh('focus');
        }
      }
      return undefined;
    }, [communityHasEverLoaded, mapMode, runCommunityEntryRefresh, COMMUNITY_ENTRY_FOCUS_REFRESH_MS])
  );

  const headerCenterColor =
    mapMode === 'group'
      ? activeGroup?.color || territoryColor
      : mapMode === 'community'
        ? (user?.uid ? userColors[user.uid] : undefined) || '#e5e7eb'
        : territoryColor;
  const headerCenterLabel =
    mapMode === 'group' ? activeGroup?.name ?? 'Group' : 'Territory';
  const headerCenterFontSize =
    mapMode === 'group' && headerCenterLabel.length > 14 ? 10 : 12;

  const handleHeaderCenter = useCallback(() => {
    if (mapMode === 'group') {
      void focusOnActiveGroupTerritory();
      return;
    }
    if (mapMode === 'community') {
      const myOwnerId = user?.uid ?? null;
      const myPoly = myOwnerId ? ownerPolygons.find((p) => p.ownerId === myOwnerId) : null;
      if (!myPoly?.rings?.length) return;
      const coords = myPoly.rings.flat();
      if (!coords.length) return;
      fitToCoordinates(coords, { top: 40, right: 40, bottom: 180, left: 40 }, 350);
      return;
    }
    void focusOnTerritory();
  }, [
    activeGroup?.color,
    focusOnActiveGroupTerritory,
    focusOnTerritory,
    mapMode,
    ownerPolygons,
    territoryColor,
    user?.uid,
    userColors,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => handleRefreshWithOpts({ silent: false })}
            tintColor="#e5e7eb"
          />
        }
      >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.title}>Territory Map</Text>
          <Text style={styles.subtitle}>
            {mapMode === 'group'
              ? 'Group territory'
              : mapMode === 'community'
                ? 'Community territories'
                : 'See all captured territories'}
          </Text>
        </View>
        <View style={styles.modeSwitchRow} />
        <View style={styles.headerOverlayRight}>
          <Pressable
            onPress={handleHeaderCenter}
            style={({ pressed }) => [
              styles.headerCenterButton,
              { borderColor: headerCenterColor },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="locate-outline" size={14} color={headerCenterColor} style={{ marginRight: 6 }} />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                styles.headerCenterButtonText,
                { color: headerCenterColor, fontSize: headerCenterFontSize },
              ]}
            >
              {headerCenterLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Map card */}
      <View style={styles.mapCard}>
        {initialRegion ? (
          <TerritoryMap
            cameraRef={cameraRef}
            initialRegion={initialRegion}
            initialCamera={initialCamera}
            showUserLocation={showUserLocation}
            territoryFeatures={territoryFeatures}
            activeCoords={activeCoords}
            runActive={runActive}
            territoryColor={territoryColor}
            onTerritoryPress={handleTerritoryPress}
            onMapReady={() => {
              perfLog({
                screen: 'TerritoryMap',
                phase: 'MAP',
                label: 'mapReady',
                durationMs: 0,
              });
            }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#0b1220' }]}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.loadingText}>Fetching your location…</Text>
          </View>
        )}
        {/* Area pill overlay */}
        <View style={styles.areaOverlay}>
          <Ionicons name="flag-outline" size={14} color="#e5e7eb" style={{ marginRight: 6 }} />
          <View>
            <Text style={styles.areaOverlayLabel}>Area captured</Text>
            <Text style={styles.areaOverlayValue}>{totalAreaKm2.toFixed(2)} km²</Text>
          </View>
        </View>
        {/* Players counter top‑right */}
      <View style={{
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: 'rgba(11,17,32,0.55)',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#111827',
        }}>
        <Ionicons
          name="people-outline"
          size={14}
          color="#e5e7eb"
          style={{ marginRight: 4 }}
        />
        <Text style={styles.legendText}>{mapCountLabel}</Text>
      </View>
        {/* Recenter on user button */}
        <View
          style={{
            position: 'absolute',
            top: 52,
            right: 12,
          }}
        >
          <Pressable
            onPress={recenterOnUser}
            style={({ pressed }) => [
              {
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(11,17,32,0.55)',
                borderWidth: 1,
                borderColor: '#111827',
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="locate-outline" size={16} color="#e5e7eb" />
          </Pressable>
        </View>
        {mapMode === 'community' && isCommunityBusy && (
          <View style={styles.communityOverlay}>
            <ActivityIndicator size="small" color="#e5e7eb" style={{ marginBottom: 8 }} />
            <Text style={styles.communityOverlayText}>Loading community territories…</Text>
            {__DEV__ && (
              <>
                <Text style={styles.communityOverlayDebug}>
                  {`loading=${communityLoading} entryRefreshing=${communityEntryRefreshing} inFlight=${!!communityEntryInFlightRef.current}`}
                </Text>
                <Text style={styles.communityOverlayDebug}>
                  {`lastRefreshAgeMs=${communityDebugAgeMs} hasEverLoaded=${communityHasEverLoaded}`}
                </Text>
                <Text style={styles.communityOverlayDebug}>
                  {`owners=${territories.size} polygons=${ownerPolygons.length}`}
                </Text>
              </>
            )}
          </View>
        )}
      {mapMode === 'community' && isCommunityEmpty && (
        <View style={styles.communityEmpty}>
          <Text style={styles.communityEmptyText}>No community territories found.</Text>
          {__DEV__ && (
            <>
              <Text style={styles.communityOverlayDebug}>
                {`loading=${communityLoading} entryRefreshing=${communityEntryRefreshing} inFlight=${!!communityEntryInFlightRef.current}`}
              </Text>
              <Text style={styles.communityOverlayDebug}>
                {`lastRefreshAgeMs=${communityDebugAgeMs} hasEverLoaded=${communityHasEverLoaded}`}
              </Text>
              <Text style={styles.communityOverlayDebug}>
                {`owners=${territories.size} polygons=${ownerPolygons.length}`}
              </Text>
            </>
          )}
        </View>
      )}
      </View>

      {/* Legend */}
      {mapMode === 'group' ? (
        <View style={styles.legendRow}>
        </View>
      ) : mapMode === 'community' ? (
        <View style={styles.legendRow}>
        </View>
      ) : (
        <View style={styles.legendRow}>
        </View>
      )}

      {/* Big primary button */}
      <View style={styles.buttonBar}>
        <Pressable
          onPress={handlePrimaryButtonPress}
          style={({ pressed }) => [
            styles.bigButton,
            runActive ? styles.bigButtonStop : styles.bigButtonStart,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text
            style={[
              styles.bigButtonText,
              runActive ? { color: '#ffffff' } : { color: '#020617' },
            ]}
          >
            {runActive
              ? 'Stop & capture'
              : mapMode === 'group'
              ? groupStartLabel
              : 'Start run'}
          </Text>
        </Pressable>
      </View>


      {/* Group picker for starting a run (when multiple groups) */}
      {joinFlowGroupPicker}
      {joinFlowNeedMore}
      {joinFlowLobby}

      {mapMode === 'group' && (
        <GroupRunPickerModal
          visible={groupPickerVisible}
          groups={groups}
          title="Select a group"
          onSelect={(gid) => {
            setActiveGroupId(gid);
            setGroupPickerVisible(false);
          }}
          onClose={() => setGroupPickerVisible(false)}
        />
      )}

      <TerritoryOwnerSheet
        selectedOwner={selectedOwner}
        onClose={closeOwnerSheet}
        onViewProfile={() => {
          openSelectedOwnerProfile();
          closeOwnerSheet();
        }}
        onViewGroupLeaderboard={() => {
          closeOwnerSheet();
          router.push('/leaderboard');
        }}
      />

      <FriendDetailModal
        visible={!!hookProfileModalFriend}
        friend={hookProfileModalFriend}
        runs={hookProfileModalRuns as any}
        isFriend={true}
        showActions={false}
        onClose={closeProfileModal}
        onOpenRunDetail={(id) => router.push({ pathname: '/run-detail', params: { id } })}
      />

      </ScrollView>
      <View style={styles.modeMenuOverlay}>
        <View style={styles.modeMenu}>
          {(['personal', 'group', 'community'] as const).map((m) => {
            const active = mapMode === m;
            const label = m === 'personal' ? 'Personal' : m === 'group' ? 'Group' : 'Community';
            return (
              <Pressable
                key={m}
                onPress={() => setMapMode(m)}
                style={[styles.modeMenuItem, active && styles.modeMenuItemActive]}
              >
                <Text style={[styles.modeMenuText, active && styles.modeMenuTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
  },
  loadingText: {
    marginTop: 8,
    color: '#9ca3af',
    fontSize: 14,
  },
  headerRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#020617',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  headerOverlayRight: {
    position: 'absolute',
    top: 40,
    right: 24,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerCenterButton: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(11,17,32,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenterButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1220',
  },
  headerModeText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 13,
  },
  modeSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    alignSelf: 'center',
    position: 'relative',
  },
  modeMenuOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    zIndex: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeMenu: {
    position: 'relative',
    backgroundColor: '#0b1120',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#111827',
    paddingVertical: 6,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 2,
  },
  modeMenuItem: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  modeMenuItemActive: {
    backgroundColor: '#111827',
  },
  modeMenuText: {
    color: '#e5e7eb',
    fontWeight: '600',
    fontSize: 12,
  },
  modeMenuTextActive: {
    color: '#22c55e',
    fontWeight: '800',
  },
  communityOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(2,6,23,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  communityOverlayText: {
    color: '#e5e7eb',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  communityOverlayDebug: {
    marginTop: 6,
    color: '#cbd5f5',
    fontSize: 11,
    textAlign: 'center',
  },
  communityEmpty: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  communityEmptyText: {
    color: '#cbd5f5',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  headerTextBlock: {
    flex: 1,
    alignItems: 'flex-start',
    paddingRight: 110,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    textAlign: 'left',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'left',
  },
  mapCard: {
    marginHorizontal: 16,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#020617',
    height: 540,
    borderWidth: 1.5,
    borderColor: '#111827',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  areaOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(11,17,32,0.75)',
    borderWidth: 1,
    borderColor: '#111827',
  },
  areaOverlayLabel: {
    color: '#9ca3af',
    fontSize: 12,
  },
  areaOverlayValue: {
    color: '#e5e7eb',
    fontSize: 18,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginHorizontal: 24,
  },
  myTerritoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,17,32,0.65)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#111827',
  },
  myTerritoryText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '700',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  legendCountText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  buttonBar: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  bigButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bigButtonStart: {
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#22c55e',
  },
  bigButtonStop: {
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  bigButtonText: {
    fontSize: 17,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.8,
  },
});

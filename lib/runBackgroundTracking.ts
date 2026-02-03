import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { haversineMeters } from './geo/geoMetrics';
import type { RunPoint } from '../types/run';

export type BackgroundCoord = RunPoint;

export const BG_COORDS_KEY = 'zonerunner:bg:coords';
export const BG_DIST_KEY = 'zonerunner:bg:dist';
export const BG_GROUP_OPT_IN_KEY = 'zonerunner:bg:group-optin';
export const BG_RUN_OPT_IN_KEY = 'zonerunner:bg:run-optin';

export const BACKGROUND_TASK = 'run-tracking-task';

let TaskManager: typeof import('expo-task-manager') | null = null;
if (Platform.OS !== 'web') {
  TaskManager = require('expo-task-manager');
}

function ensureBackgroundTaskDefined() {
  if (!TaskManager) return;
  if (TaskManager.isTaskDefined(BACKGROUND_TASK)) return;

  TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }) => {
    if (error) {
      console.log('Background task error', error);
      return;
    }
    const locations = (data as any)?.locations;
    if (!locations || !locations.length) return;
    const loc = locations[0];
    const coord: BackgroundCoord = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      ts: typeof loc.timestamp === 'number' ? loc.timestamp : Date.now(),
      altitudeM: typeof loc.coords.altitude === 'number' ? loc.coords.altitude : undefined,
      altitudeAccuracyM:
        typeof (loc.coords as any).altitudeAccuracy === 'number'
          ? (loc.coords as any).altitudeAccuracy
          : undefined,
    };

    try {
      const storedCoords = await AsyncStorage.getItem(BG_COORDS_KEY);
      const coords: BackgroundCoord[] = storedCoords ? JSON.parse(storedCoords) : [];
      const last = coords.length ? coords[coords.length - 1] : null;
      let storedDistance = 0;
      const storedDistStr = await AsyncStorage.getItem(BG_DIST_KEY);
      if (storedDistStr) {
        storedDistance = parseFloat(storedDistStr) || 0;
      }

      if (last) {
        const delta = haversineMeters(last, coord);
        if (isFinite(delta) && delta > 0) {
          storedDistance += delta;
        }
      }

      const nextCoords = [...coords, coord].slice(-500); // keep it bounded
      await AsyncStorage.multiSet([
        [BG_COORDS_KEY, JSON.stringify(nextCoords)],
        [BG_DIST_KEY, storedDistance.toString()],
      ]);
    } catch (e) {
      console.log('Failed to persist background location', e);
    }
  });
}

export async function clearBackgroundBuffer() {
  await AsyncStorage.multiRemove([BG_COORDS_KEY, BG_DIST_KEY]);
}

export async function readBackgroundBuffer(): Promise<{ coords: BackgroundCoord[]; distanceMeters: number }> {
  const bgCoordsStr = await AsyncStorage.getItem(BG_COORDS_KEY);
  const bgDistStr = await AsyncStorage.getItem(BG_DIST_KEY);
  const coords: BackgroundCoord[] = bgCoordsStr ? JSON.parse(bgCoordsStr) : [];
  const distanceMeters = bgDistStr ? parseFloat(bgDistStr) || 0 : 0;
  return { coords, distanceMeters };
}

export async function startBackgroundTracking() {
  if (Platform.OS === 'web') return;
  ensureBackgroundTaskDefined();
  await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 5,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'ZoneRunner is tracking your run',
      notificationBody: 'Tracking continues even if the screen locks.',
    },
  });
}

export async function stopBackgroundTracking() {
  if (Platform.OS === 'web') return;
  ensureBackgroundTaskDefined();
  try {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
  } catch (e) {
    console.log('Failed to stop background tracking', e);
  }
}

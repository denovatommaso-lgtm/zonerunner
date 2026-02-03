import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { upsertRun, type RunDoc } from './runService';
import { auth } from './firebaseConfig';
import { MonthlyChallengesService } from './monthlyChallengesService';

export type WatchRunPayload = {
  runId: string;
  userId?: string;
  mode?: 'personal' | 'group';
  groupId?: string;
  startedAt: string;
  endedAt?: string;
  elapsedSeconds: number;
  distanceMeters: number;
  route: { lat: number; lon: number }[];
  areaKm2?: number;
};

const nativeModule = (NativeModules as any).WatchBridge;
const emitter =
  Platform.OS === 'ios' && nativeModule?.addListener
    ? new NativeEventEmitter(nativeModule)
    : null;

export function subscribeWatchRuns(
  handler: (payload: WatchRunPayload) => void
): { remove: () => void } {
  if (!emitter) return { remove: () => {} };
  const sub = emitter.addListener('watch_run', handler);
  return { remove: () => sub.remove() };
}

export async function persistWatchRun(payload: WatchRunPayload) {
  const userId = payload.userId ?? auth.currentUser?.uid;
  if (!userId) {
    throw new Error('Cannot save watch run without a user id');
  }

  const route = (payload.route || []).map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
  }));

  const run: Omit<RunDoc, 'createdAt'> & { createdAt?: number } = {
    userId,
    mode: payload.mode ?? 'personal',
    scope: payload.mode ?? 'personal',
    groupId: payload.groupId,
    distance: payload.distanceMeters,
    elapsedSeconds: payload.elapsedSeconds,
    startedAt: payload.startedAt,
    route,
    areaKm2: payload.areaKm2,
    createdAt: payload.endedAt
      ? Date.parse(payload.endedAt)
      : Date.parse(payload.startedAt) || Date.now(),
  };

  const runId = payload.runId;
  await upsertRun(runId, run as RunDoc);
  try {
    await MonthlyChallengesService.ingestRun({
      userId,
      runId,
      run: run as any,
    });
  } catch (e) {
    console.log('Failed to ingest watch run into monthly challenges', e);
  }
}

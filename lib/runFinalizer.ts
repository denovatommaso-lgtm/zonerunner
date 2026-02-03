import { approximatePolygonAreaKm2, computeElevationGainLossMeters } from './geo/geoMetrics';
import type { RunDoc } from './runService';
import { clearBackgroundBuffer, readBackgroundBuffer } from './runBackgroundTracking';
import type { RunPoint } from '../types/run';

type Coord = RunPoint;

export type FinalizeRunInput = {
  route: Coord[];
  distanceMeters: number;
  elapsedSeconds: number;
  startedAt: Date;
  mode: 'personal' | 'group';
  groupId?: string;
  groupRunType?: 'casual' | 'official';
};

export type FinalizeRunResult = {
  distanceMeters: number;
  route: Coord[];
  areaKm2: number;
  elevationGainM: number;
  elevationLossM: number;
  runPayload: Omit<RunDoc, 'userId'>;
};

/**
 * Finalize raw run data into an immutable payload for persistence.
 * - Merges background buffer (route + distance) if available.
 * - Computes area + elevation gain/loss.
 * - Builds the `RunDoc` payload (minus userId).
 *
 * Note: run validation (like "distance must be > 0") is intentionally NOT done here.
 */
export async function finalizeRun(input: FinalizeRunInput): Promise<FinalizeRunResult> {
  // Merge any background-collected route/distance (best-effort).
  let mergedRoute = input.route;
  let mergedDistance = input.distanceMeters;
  try {
    const { coords: bgCoords, distanceMeters: bgDist } = await readBackgroundBuffer();
    if (bgCoords.length) {
      mergedRoute = [...mergedRoute, ...(bgCoords as any)];
    }
    mergedDistance += bgDist;
    await clearBackgroundBuffer();
  } catch (e) {
    // Keep foreground data if background buffer can't be read.
    console.log('Failed to merge background data', e);
  }

  // Ensure at least one route point so downstream consumers don't crash.
  const safeRoute = mergedRoute.length ? mergedRoute : input.route;

  const areaKm2 = safeRoute.length >= 3 ? approximatePolygonAreaKm2(safeRoute) : 0;
  const { gainM: elevationGainM, lossM: elevationLossM } = computeElevationGainLossMeters(safeRoute);

  const createdAt = Date.now();
  const runPayload: Omit<RunDoc, 'userId'> = {
    mode: input.mode,
    scope: input.mode,
    groupId: input.mode === 'group' ? input.groupId : undefined,
    groupRunType: input.mode === 'group' ? input.groupRunType : undefined,
    distance: Math.max(0, mergedDistance),
    elapsedSeconds: Math.max(0, input.elapsedSeconds),
    startedAt: input.startedAt.toISOString(),
    route: safeRoute as any,
    areaKm2: Math.max(0, areaKm2),
    elevationGainM: Math.max(0, elevationGainM),
    elevationLossM: Math.max(0, elevationLossM),
    createdAt,
  };

  return {
    distanceMeters: mergedDistance,
    route: safeRoute,
    areaKm2,
    elevationGainM,
    elevationLossM,
    runPayload,
  };
}

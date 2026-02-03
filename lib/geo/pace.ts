import { haversineMeters } from './geoMetrics';

export type TimedGeoCoord = {
  latitude: number;
  longitude: number;
  ts?: number; // ms epoch (required for segment timing)
};

export type FastestSegmentOptions = {
  segmentMeters: number;
  minRunDistanceMeters: number;
  allowScalePolylineToRunDistance: boolean;
  runDistanceMeters?: number;
};

/**
 * Fastest continuous segment time for a target distance using a sliding window (two-pointer) algorithm.
 *
 * - Requires monotonically increasing timestamps on points.
 * - Uses haversine distance along the recorded polyline.
 * - Optional: if polyline distance is slightly under `segmentMeters` but `runDistanceMeters` indicates the run
 *   qualifies, can scale polyline distances up to `runDistanceMeters` for segment extraction.
 *
 * Returns segment time in whole seconds, or null if it cannot be computed / does not qualify.
 */
export function computeFastestSegmentSeconds(
  points: TimedGeoCoord[],
  opts: FastestSegmentOptions
): number | null {
  if (!points || points.length < 3) return null;
  if (!Number.isFinite(opts.segmentMeters) || opts.segmentMeters <= 0) return null;
  if (!Number.isFinite(opts.minRunDistanceMeters) || opts.minRunDistanceMeters <= 0) return null;

  // Require timestamps for pace calculation.
  if (points.some((p) => typeof p.ts !== 'number')) return null;

  const n = points.length;
  const t: number[] = points.map((p) => p.ts as number);
  for (let i = 1; i < n; i++) {
    if (!Number.isFinite(t[i]) || t[i] <= t[i - 1]) return null;
  }

  const cum: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = haversineMeters(points[i - 1], points[i]);
    cum[i] = cum[i - 1] + (Number.isFinite(d) ? Math.max(0, d) : 0);
  }

  const polylineTotal = cum[n - 1];
  const runDistanceMeters =
    typeof opts.runDistanceMeters === 'number' && Number.isFinite(opts.runDistanceMeters)
      ? Math.max(0, opts.runDistanceMeters)
      : undefined;

  // Primary qualification: run must be at least min distance by the saved run distance.
  // Fallback to polyline distance if run distance isn't available.
  const qualifyingTotal =
    typeof runDistanceMeters === 'number' && runDistanceMeters > 0 ? runDistanceMeters : polylineTotal;
  if (qualifyingTotal < opts.minRunDistanceMeters) return null;

  const target = opts.segmentMeters;
  if (polylineTotal <= 0) return null;

  // If the polyline is slightly under but the recorded run distance is >= target,
  // scale distances up to the recorded run distance so a target run can still yield a segment.
  const factor =
    opts.allowScalePolylineToRunDistance &&
    typeof runDistanceMeters === 'number' &&
    runDistanceMeters >= target &&
    polylineTotal < target
      ? runDistanceMeters / polylineTotal
      : 1;

  const dist = factor !== 1 ? cum.map((x) => x * factor) : cum;
  if (dist[n - 1] < target) return null;

  let bestMs = Infinity;
  let start = 0;
  for (let end = 1; end < n; end++) {
    while (start + 1 < end && dist[end] - dist[start + 1] >= target) {
      start += 1;
    }
    if (dist[end] - dist[start] < target) continue;

    const boundaryDist = dist[end] - target;
    const d0 = dist[start];
    const d1 = dist[start + 1];
    const t0 = t[start];
    const t1 = t[start + 1];
    const span = d1 - d0;
    if (span <= 0) continue;
    const frac = (boundaryDist - d0) / span;
    const boundaryTime = t0 + (t1 - t0) * Math.min(1, Math.max(0, frac));
    const segMs = t[end] - boundaryTime;
    if (segMs > 0) bestMs = Math.min(bestMs, segMs);
  }

  if (!Number.isFinite(bestMs)) return null;
  return Math.max(1, Math.round(bestMs / 1000));
}


// Territory engine using polygon boolean ops (no grid cells).
// Uses Turf (pure JS) for union/difference/area so it works in Expo/React Native.
// All ownership is polygon-based: last runner wins by subtracting their run
// from everyone else, then unioning it into their own territory.

import { multiPolygon, polygon } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import turfArea from '@turf/area';
import * as pc from 'polygon-clipping';
import type { Geom } from 'polygon-clipping';
import { territoryCleanupConfig } from './territoryCleanupConfig';
import { haversineMeters as haversineMetersGeo } from './geo/geoMetrics';
import { perfLog, perfStart } from './perfLogger';

export type LatLng = { latitude: number; longitude: number };

export type TerritoryFeature = Feature<Polygon | MultiPolygon>;

export type RunLike = {
  id?: string;
  userId: string;
  route: LatLng[];
  startedAt?: string;
  createdAt?: number;
};

type TerritoryStats = {
  polygons: number;
  vertices: number;
};

let rebuildInProgress = false;
let pendingRebuildRuns: RunLike[] | null = null;
let pendingRebuildSignature: string | null = null;
let lastRebuildSignature: string | null = null;
let lastRebuildResult: Map<string, TerritoryFeature | null> | null = null;

function runSignature(runs: RunLike[]): string {
  if (!runs.length) return 'runs:0';
  const parts: string[] = [];
  parts.push(`runs:${runs.length}`);
  for (const run of runs) {
    const id = (run.id ?? '').toString();
    const createdAt = Number.isFinite(run.createdAt as number) ? String(run.createdAt) : '';
    const startedAt = run.startedAt ?? '';
    const routeLen = run.route?.length ?? 0;
    parts.push(`${id}|${createdAt}|${startedAt}|${routeLen}`);
  }
  return parts.join('~');
}

// Convert LatLng path to a closed GeoJSON ring (first == last). Returns null if invalid.
export function buildRunPolygon(path: LatLng[]): TerritoryFeature | null {
  if (!Array.isArray(path) || path.length < 1) {
    return null;
  }

  // Convert to [lng, lat] positions
  const coords: Position[] = path.map((p) => [p.longitude, p.latitude]);
  const first = coords[0];

  // If we have too few points for a polygon, synthesize a small square around the first point.
  if (coords.length < 3) {
    if (!first || !Number.isFinite(first[0]) || !Number.isFinite(first[1])) return null;
    const midLatRad = (first[1] as number) * (Math.PI / 180);
    const padMeters = 12; // small footprint so very short runs still show
    const latPadDeg = padMeters / 111320;
    const lonPadDeg = padMeters / (111320 * Math.max(0.2, Math.cos(midLatRad)));
    const square: Position[] = [
      [first[0] - lonPadDeg, first[1] - latPadDeg],
      [first[0] + lonPadDeg, first[1] - latPadDeg],
      [first[0] + lonPadDeg, first[1] + latPadDeg],
      [first[0] - lonPadDeg, first[1] + latPadDeg],
      [first[0] - lonPadDeg, first[1] - latPadDeg],
    ];
    const poly = polygon([square]);
    const area = turfArea(poly);
    return isFinite(area) && area > 0 ? poly : null;
  }

  const last = coords[coords.length - 1];
  const isClosed = first[0] === last[0] && first[1] === last[1];
  if (!isClosed) {
    coords.push(first);
  }

  // Degenerate polygons (very tiny area) can cause issues; bail out if area ~ 0
  const poly = polygon([coords]);
  const area = turfArea(poly); // m²
  if (!isFinite(area) || area < 1) {
    // Fallback: extremely small / degenerate path. Create a minimal buffered
    // rectangle around the path so short test runs still produce territory.
    const lats = coords.map((c) => c[1]).filter((v) => Number.isFinite(v));
    const lngs = coords.map((c) => c[0]).filter((v) => Number.isFinite(v));
    if (!lats.length || !lngs.length) return null;
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
    // Pad by ~10m to survive cleanup thresholds.
    const padMeters = 10;
    const latPadDeg = padMeters / 111320; // meters per degree latitude
    const lonPadDeg = padMeters / (111320 * Math.max(0.2, Math.cos(midLatRad)));
    const ring: Position[] = [
      [minLng - lonPadDeg, minLat - latPadDeg],
      [maxLng + lonPadDeg, minLat - latPadDeg],
      [maxLng + lonPadDeg, maxLat + latPadDeg],
      [minLng - lonPadDeg, maxLat + latPadDeg],
      [minLng - lonPadDeg, minLat - latPadDeg],
    ];
    const fallbackPoly = polygon([ring]);
    const fallbackArea = turfArea(fallbackPoly);
    if (!isFinite(fallbackArea) || fallbackArea < 1) return null;
    return fallbackPoly;
  }

  return poly;
}

function devLog(event: string, data: Record<string, unknown>) {
  if (!__DEV__ || !territoryCleanupConfig.debugLogs) return;
  try {
    console.log(`[territoryCleanup] ${event} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[territoryCleanup] ${event}`, data);
  }
}

const cleanupLogThrottleByOwner = new Map<string, number>();
function shouldLogCleanup(ownerId: string | undefined) {
  if (!__DEV__ || !territoryCleanupConfig.debugLogs) return false;
  const key = ownerId ?? 'unknown';
  const now = Date.now();
  const last = cleanupLogThrottleByOwner.get(key) ?? 0;
  if (now - last < 5000) return false;
  cleanupLogThrottleByOwner.set(key, now);
  return true;
}

function territoryStats(territory: TerritoryFeature | null | undefined): TerritoryStats {
  if (!territory) return { polygons: 0, vertices: 0 };
  const polys =
    territory.geometry.type === 'Polygon'
      ? [territory.geometry.coordinates]
      : territory.geometry.type === 'MultiPolygon'
        ? territory.geometry.coordinates
        : [];
  let vertices = 0;
  for (const poly of polys) {
    for (const ring of poly) vertices += ring.length;
  }
  return { polygons: polys.length, vertices };
}

function ensureClosedRing(ring: Position[]): Position[] {
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  return closed ? ring : [...ring, first];
}

function ringAreaM2(ring: Position[]): number {
  if (!ring || ring.length < 4) return 0;
  try {
    return turfArea(polygon([ensureClosedRing(ring)]));
  } catch {
    return 0;
  }
}

function haversinePositionMeters(a: Position, b: Position): number {
  return haversineMetersGeo(
    { latitude: a[1] as number, longitude: a[0] as number },
    { latitude: b[1] as number, longitude: b[0] as number }
  );
}

function simplifyRing(ring: Position[], toleranceMeters: number): Position[] {
  if (!toleranceMeters || toleranceMeters <= 0) return ring;
  const closed = ensureClosedRing(ring);
  if (closed.length < 6) return closed;
  const out: Position[] = [closed[0]];
  for (let i = 1; i < closed.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = closed[i];
    if (haversinePositionMeters(prev, cur) >= toleranceMeters) {
      out.push(cur);
    }
  }
  out.push(out[0]); // close
  // Keep at least a triangle + closure
  return out.length >= 4 ? out : closed;
}

function mercatorProjectMeters(pt: Position): { x: number; y: number } | null {
  const lng = pt?.[0] as number;
  const lat = pt?.[1] as number;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // WebMercator projection (meters), stable and fast for small extents.
  const R = 6378137;
  const lonRad = (lng * Math.PI) / 180;
  const latRad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180; // clamp to avoid infinity
  const x = R * lonRad;
  const y = R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return { x, y };
}

function pcaExtentMeters(ring: Position[]): { lengthM: number; widthM: number; aspect: number } {
  const pts = (ring ?? []).map(mercatorProjectMeters).filter(Boolean) as Array<{ x: number; y: number }>;
  if (pts.length < 3) return { lengthM: 0, widthM: 0, aspect: 0 };

  let meanX = 0;
  let meanY = 0;
  for (const p of pts) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= pts.length;
  meanY /= pts.length;

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const p of pts) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  cxx /= pts.length;
  cyy /= pts.length;
  cxy /= pts.length;

  // Principal axis eigenvector for 2x2 covariance matrix.
  // Choose the eigenvector for the larger eigenvalue.
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.max(0, (trace * trace) / 4 - det);
  const lambda1 = trace / 2 + Math.sqrt(disc);

  let vx = 1;
  let vy = 0;
  if (Math.abs(cxy) > 1e-9) {
    vx = lambda1 - cyy;
    vy = cxy;
  } else {
    // Axis-aligned fallback.
    if (cxx >= cyy) {
      vx = 1;
      vy = 0;
    } else {
      vx = 0;
      vy = 1;
    }
  }
  const norm = Math.hypot(vx, vy) || 1;
  vx /= norm;
  vy /= norm;
  // Perpendicular axis.
  const ux = -vy;
  const uy = vx;

  let min1 = Infinity;
  let max1 = -Infinity;
  let min2 = Infinity;
  let max2 = -Infinity;
  for (const p of pts) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    const t1 = dx * vx + dy * vy;
    const t2 = dx * ux + dy * uy;
    min1 = Math.min(min1, t1);
    max1 = Math.max(max1, t1);
    min2 = Math.min(min2, t2);
    max2 = Math.max(max2, t2);
  }

  const e1 = Math.max(0, max1 - min1);
  const e2 = Math.max(0, max2 - min2);
  const lengthM = Math.max(e1, e2);
  const widthM = Math.min(e1, e2);
  const aspect = widthM > 0 ? lengthM / widthM : 0;
  return { lengthM, widthM, aspect };
}

type CleanupResult = {
  cleaned: TerritoryFeature | null;
  removedFragments: number;
  removedHoles: number;
};

function cleanupPolygonCoords(poly: Position[][], opts: { simplifyToleranceMeters: number }): { coords: Position[][]; removedHoles: number } {
  const outer = poly[0] ?? [];
  const holes = poly.slice(1);
  const keptHoles: Position[][] = [];
  let removedHoles = 0;
  for (const h of holes) {
    const area = ringAreaM2(h);
    if (area > 0 && area < territoryCleanupConfig.minHoleAreaM2) {
      removedHoles += 1;
      continue;
    }
    keptHoles.push(ensureClosedRing(h));
  }
  const simplifiedOuter = simplifyRing(ensureClosedRing(outer), opts.simplifyToleranceMeters);
  return { coords: [simplifiedOuter, ...keptHoles], removedHoles };
}

function cleanupTerritoryFeatureInternal(
  territory: TerritoryFeature | null | undefined,
  opts: { ownerId?: string; log?: boolean }
): CleanupResult {
  if (!territory) return { cleaned: null, removedFragments: 0, removedHoles: 0 };
  const simplifyTol = territoryCleanupConfig.simplifyToleranceMeters;

  const polys: Position[][][] =
    territory.geometry.type === 'Polygon'
      ? [territory.geometry.coordinates]
      : territory.geometry.type === 'MultiPolygon'
        ? territory.geometry.coordinates
        : [];

  if (!polys.length) return { cleaned: null, removedFragments: 0, removedHoles: 0 };

  // First pass: compute part area + geometry metrics (no hole cleanup yet, per requirements).
  const parts = polys
    .map((p) => {
      const coords = p;
      const outer = coords?.[0] ?? [];
      let areaM2 = 0;
      try {
        areaM2 = turfArea(polygon(coords));
      } catch {
        areaM2 = 0;
      }
      const { lengthM, widthM, aspect } = pcaExtentMeters(outer);
      return { coords, areaM2, lengthM, widthM, aspect };
    })
    .filter((p) => (p.coords?.[0]?.length ?? 0) >= 4);
  if (!parts.length) return { cleaned: null, removedFragments: 0, removedHoles: 0 };

  const minFrag = territoryCleanupConfig.minFragmentAreaM2;
  const hasMultipleParts = parts.length > 1;

  let kept = parts;
  let removedFragments = 0;
  let removedHoles = 0;
  if (hasMultipleParts) {
    kept = parts.filter((p) => {
      const areaM2 = Number.isFinite(p.areaM2) ? (p.areaM2 as number) : 0;
      const passesArea = areaM2 >= minFrag;

      const sliverCfg = territoryCleanupConfig.thinSliver;
      const isThinSliver =
        !!sliverCfg?.enabled &&
        p.widthM > 0 &&
        p.widthM < sliverCfg.minThicknessM &&
        p.aspect > sliverCfg.minAspectRatio;

      const ok = passesArea && !isThinSliver;
      if (!ok) removedFragments += 1;
      if (isThinSliver && shouldLogCleanup(opts.ownerId)) {
        console.log(
          `[territoryCleanup] Removed sliver ownerId=${opts.ownerId ?? 'unknown'} area=${Math.round(areaM2)}m2 width=${p.widthM.toFixed(1)}m length=${p.lengthM.toFixed(1)}m aspect=${p.aspect.toFixed(1)}`
        );
      }
      return ok;
    });
    if (!kept.length) {
      // Safety: if everything would be removed, keep the single largest part.
      const largest = [...parts].sort((a, b) => (b.areaM2 ?? 0) - (a.areaM2 ?? 0))[0];
      kept = [largest];
      removedFragments = Math.max(0, parts.length - 1);
    }
  } else {
    // Single part: keep even if below threshold (unless we change this later).
    if (!territoryCleanupConfig.keepSinglePartBelowThreshold) {
      const only = parts[0];
      if ((only.areaM2 ?? 0) < minFrag) {
        kept = [];
        removedFragments = 1;
      }
    }

    // Single part sliver safety: only delete if it is clearly a ribbon.
    const sliverCfg = territoryCleanupConfig.thinSliver;
    if (kept.length && sliverCfg?.enabled) {
      const only = kept[0];
      const minAspect = sliverCfg.minAspectRatio * (sliverCfg.singlePartAspectRatioMultiplier ?? 1);
      const isThinSliver = only.widthM > 0 && only.widthM < sliverCfg.minThicknessM && only.aspect > minAspect;
      if (isThinSliver) {
        if (shouldLogCleanup(opts.ownerId)) {
          console.log(
            `[territoryCleanup] Removed sliver ownerId=${opts.ownerId ?? 'unknown'} area=${Math.round(only.areaM2)}m2 width=${only.widthM.toFixed(1)}m length=${only.lengthM.toFixed(1)}m aspect=${only.aspect.toFixed(1)}`
          );
        }
        kept = [];
        removedFragments = 1;
      }
    }
  }

  // Now remove tiny holes + simplify on kept parts.
  const keptCoords: Position[][][] = [];
  for (const p of kept) {
    const cleanedPoly = cleanupPolygonCoords(p.coords, { simplifyToleranceMeters: simplifyTol });
    removedHoles += cleanedPoly.removedHoles;
    keptCoords.push(cleanedPoly.coords);
  }

  const cleaned =
    keptCoords.length === 1 ? polygon(keptCoords[0] as Position[][]) : multiPolygon(keptCoords as Position[][][]);

  if (opts.log && (removedFragments > 0 || removedHoles > 0)) {
    if (removedFragments > 0 && shouldLogCleanup(opts.ownerId)) {
      // Dev-only verification log (requested): easy to spot in device logs.
      console.log(
        `[territoryCleanup] Removed ${removedFragments} fragments under ${minFrag} m² for ownerId ${opts.ownerId ?? 'unknown'}`
      );
    }
    devLog('details', {
      ownerId: opts.ownerId ?? 'unknown',
      removedFragments,
      minFragmentAreaM2: minFrag,
      removedHoles,
      minHoleAreaM2: territoryCleanupConfig.minHoleAreaM2,
      simplifyToleranceMeters: simplifyTol,
      thinSliver: territoryCleanupConfig.thinSliver,
    });
  }

  return { cleaned: cleaned as any, removedFragments, removedHoles };
}

// Apply "last runner wins":
// - For every other player: territory = territory - newRunPolygon
// - For current player: territory = territory ∪ newRunPolygon
export function updateTerritoriesWithRun(
  territories: Map<string, TerritoryFeature | null>,
  runnerId: string,
  runPoly: TerritoryFeature
): Map<string, TerritoryFeature | null> {
  const endPerf = perfStart({
    screen: 'TerritoryEngine',
    phase: 'DATA',
    label: 'updateTerritoriesWithRun',
    meta: {
      runnerId,
      owners: territories.size,
      runVertices: territoryStats(runPoly).vertices,
    },
  });
  const next = new Map(territories);

  const runCoords = featureToMultiCoords(runPoly) as Geom;

  // Subtract from everyone else
  next.forEach((territory, playerId) => {
    if (!territory || playerId === runnerId) return;
    const theirs = featureToMultiCoords(territory) as Geom;
    try {
      const diffCoords = pc.difference(theirs, runCoords);
      const diffFeat = multiCoordsToFeature(diffCoords);
      next.set(playerId, diffFeat);
    } catch (e) {
      // If difference fails (invalid geometry), keep their territory unchanged.
      console.log('[territoryEngine] difference failed', {
        playerId,
        runnerId,
        message: (e as any)?.message,
      });
      next.set(playerId, territory);
    }
  });

  // Union into runner territory (if none, they take the polygon as-is)
  const mine = next.get(runnerId) || null;
  let merged: TerritoryFeature | null = runPoly;
  const mineCoords = (mine ? featureToMultiCoords(mine) : []) as Geom;
  if (mine) {
    try {
      const mergedCoords = pc.union(mineCoords, runCoords);
      merged = multiCoordsToFeature(mergedCoords);
    } catch (e) {
      // If union fails (e.g., degenerate geometry), fall back to a combined multipolygon
      // so we keep previous territory plus the new run.
      console.log('[territoryEngine] union failed', {
        runnerId,
        message: (e as any)?.message,
      });
      merged = mergeAsMulti(mine, runPoly);
    }
  }
  next.set(runnerId, merged ?? null);

  endPerf({
    owners: next.size,
    runnerTerritory: territoryStats(next.get(runnerId)),
  });
  return next;
}

// Combine two polygon/multipolygon features into a single multipolygon without boolean ops.
function mergeAsMulti(a: TerritoryFeature, b: TerritoryFeature): TerritoryFeature {
  const polys: Position[][][] = [];

  const add = (feat: TerritoryFeature) => {
    if (feat.geometry.type === 'Polygon') {
      polys.push(feat.geometry.coordinates);
    } else if (feat.geometry.type === 'MultiPolygon') {
      polys.push(...feat.geometry.coordinates);
    }
  };

  add(a);
  add(b);

  return multiPolygon(polys);
}

// Rebuild territories from scratch given an ordered list of runs.
// Runs must be in chronological order for "last runner wins".
function rebuildTerritoriesFromRunsInternal(runs: RunLike[]): Map<string, TerritoryFeature | null> {
  const runPoints = runs.reduce((sum, run) => sum + (run.route?.length ?? 0), 0);
  const endPerf = perfStart({
    screen: 'TerritoryEngine',
    phase: 'DATA',
    label: 'rebuildTerritoriesFromRuns',
    meta: {
      runs: runs.length,
      totalPoints: runPoints,
    },
  });
  const territories = new Map<string, TerritoryFeature | null>();
  const areaBefore = new Map<string, number>();
  const ordered = [...runs].sort((a, b) => {
    const parseTs = (r: RunLike) => {
      const createdAt = (r.createdAt as number | undefined) ?? undefined;
      if (Number.isFinite(createdAt)) return createdAt as number;
      if (r.startedAt) {
        const t = Date.parse(r.startedAt);
        if (Number.isFinite(t)) return t;
      }
      // If we can't determine time, treat as oldest so it doesn't incorrectly "win" by applying last.
      return 0;
    };
    const ta = parseTs(a);
    const tb = parseTs(b);
    if (ta !== tb) return ta - tb;
    const ida = (a.id ?? '').toString();
    const idb = (b.id ?? '').toString();
    return ida.localeCompare(idb);
  });

  for (const run of ordered) {
    if (!run.userId) continue;
    const poly = buildRunPolygon(run.route);
    if (!poly) continue;
    try {
      // Snapshot areas before applying this run (dev-only checks).
      if (__DEV__) {
        areaBefore.clear();
        territories.forEach((feat, ownerId) => {
          areaBefore.set(ownerId, territoryAreaKm2(feat));
        });
      }

      const updated = updateTerritoriesWithRun(territories, run.userId, poly);
      updated.forEach((v, k) => territories.set(k, v)); // sync map
      if (__DEV__) {
        // Detect impossible area increases for non-runner owners when overlap should subtract.
        territories.forEach((feat, ownerId) => {
          if (ownerId === run.userId) return;
          const before = areaBefore.get(ownerId) ?? 0;
          const after = territoryAreaKm2(feat);
          if (after > before + 1e-6) {
            throw new Error(
              `[territoryEngine] area increased after subtraction (runOwner=${run.userId} victim=${ownerId} before=${before} after=${after})`
            );
          }
        });
      }
    } catch (e) {
      // Skip this run if geometry operations fail.
      continue;
    }
  }

  // Cleanup pass (sliver removal + optional smoothing) applied consistently for all modes.
  const cleaned = new Map<string, TerritoryFeature | null>();
  territories.forEach((feat, ownerId) => {
    const res = cleanupTerritoryFeatureInternal(feat, { ownerId, log: true });
    cleaned.set(ownerId, res.cleaned);
  });
  endPerf({
    owners: cleaned.size,
  });
  return cleaned;
}

// Rebuild territories with coalescing (latest-wins) to avoid redundant work.
export function rebuildTerritoriesFromRuns(runs: RunLike[]): Map<string, TerritoryFeature | null> {
  const signature = runSignature(runs);
  if (lastRebuildSignature && lastRebuildSignature === signature && lastRebuildResult) {
    return lastRebuildResult;
  }
  if (rebuildInProgress) {
    pendingRebuildRuns = runs;
    pendingRebuildSignature = signature;
    perfLog({
      screen: 'TerritoryEngine',
      phase: 'DATA',
      label: 'rebuildTerritoriesFromRuns coalesced',
      durationMs: 0,
      meta: { pendingRuns: runs.length },
    });
    return lastRebuildResult ?? new Map();
  }

  rebuildInProgress = true;
  let result = rebuildTerritoriesFromRunsInternal(runs);
  lastRebuildResult = result;
  lastRebuildSignature = signature;
  rebuildInProgress = false;

  if (pendingRebuildRuns) {
    const nextRuns = pendingRebuildRuns;
    const nextSignature = pendingRebuildSignature;
    pendingRebuildRuns = null;
    pendingRebuildSignature = null;
    if (nextSignature && nextSignature !== lastRebuildSignature) {
      result = rebuildTerritoriesFromRuns(nextRuns);
    }
  }

  return result;
}

// Compute area in km² for a polygon/multipolygon.
export function territoryAreaKm2(territory: TerritoryFeature | null | undefined): number {
  if (!territory) return 0;
  const areaM2 = turfArea(territory);
  if (!isFinite(areaM2) || areaM2 <= 0) return 0;
  return areaM2 / 1_000_000;
}

// Convert territory (polygon or multipolygon) into arrays of LatLng rings for map rendering.
// Holes are currently ignored in rendering (outer rings only) to keep the map simple.
let territoryToMapLogAt = 0;

export function territoryToMapPolygons(
  territory: TerritoryFeature | null | undefined
): LatLng[][] {
  const now = Date.now();
  if (now - territoryToMapLogAt > 2000) {
    territoryToMapLogAt = now;
    perfLog({
      screen: 'TerritoryEngine',
      phase: 'MAP',
      label: 'territoryToMapPolygons',
      durationMs: 0,
      meta: territoryStats(territory),
    });
  }
  // Always apply cleanup just before rendering, in case a raw/uncleaned feature is passed in.
  const cleaned = cleanupTerritoryFeatureInternal(territory, { log: false }).cleaned;
  if (!cleaned) return [];
  if (cleaned.geometry.type === 'Polygon') {
    const rings = cleaned.geometry.coordinates;
    const outer = rings[0] ?? [];
    return [
      outer.map((pt) => {
        const [lng, lat] = pt as [number, number];
        return { latitude: lat, longitude: lng };
      }),
    ];
  }
  if (cleaned.geometry.type === 'MultiPolygon') {
    return cleaned.geometry.coordinates.map((poly) => {
      const outer = poly[0] ?? [];
      return outer.map((pt) => {
        const [lng, lat] = pt as [number, number];
        return { latitude: lat, longitude: lng };
      });
    });
  }
  return [];
}

// Helper to normalize data shape if we ever store/load territories from a backend.
export function serializeTerritory(territory: TerritoryFeature | null | undefined) {
  return territory ? territory : null;
}

export function deserializeTerritory(data: any): TerritoryFeature | null {
  if (!data) return null;
  // Assume stored as GeoJSON Feature<Polygon|MultiPolygon>
  if (data.type === 'Feature' && data.geometry?.type) {
    return data as TerritoryFeature;
  }
  return null;
}

// --- Helpers to convert between GeoJSON Features and polygon-clipping coords ---
// polygon-clipping uses MultiPolygon coords: Array of polygons, each polygon is Array of rings (closed).

function featureToMultiCoords(feat: TerritoryFeature): Position[][][] {
  if (feat.geometry.type === 'Polygon') {
    return [feat.geometry.coordinates];
  }
  if (feat.geometry.type === 'MultiPolygon') {
    return feat.geometry.coordinates;
  }
  return [];
}

function multiCoordsToFeature(coords: Geom | Position[][][]): TerritoryFeature | null {
  if (!coords || (coords as Position[][][]).length === 0) return null;
  const arr = coords as Position[][][];
  // If only one polygon, return Polygon; else MultiPolygon
  if (arr.length === 1) {
    return polygon(arr[0] as Position[][]);
  }
  return multiPolygon(arr as Position[][][]);
}

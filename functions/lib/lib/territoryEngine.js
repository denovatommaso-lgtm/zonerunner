"use strict";
// Territory engine using polygon boolean ops (no grid cells).
// Uses Turf (pure JS) for union/difference/area so it works in Expo/React Native.
// All ownership is polygon-based: last runner wins by subtracting their run
// from everyone else, then unioning it into their own territory.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRunPolygon = buildRunPolygon;
exports.updateTerritoriesWithRun = updateTerritoriesWithRun;
exports.rebuildTerritoriesFromRuns = rebuildTerritoriesFromRuns;
exports.territoryAreaKm2 = territoryAreaKm2;
exports.territoryToMapPolygons = territoryToMapPolygons;
exports.serializeTerritory = serializeTerritory;
exports.deserializeTerritory = deserializeTerritory;
const helpers_1 = require("@turf/helpers");
const area_1 = __importDefault(require("@turf/area"));
const pc = __importStar(require("polygon-clipping"));
const territoryCleanupConfig_1 = require("./territoryCleanupConfig");
const geoMetrics_1 = require("./geo/geoMetrics");
const perfLogger_1 = require("./perfLogger");
let rebuildInProgress = false;
let pendingRebuildRuns = null;
let pendingRebuildSignature = null;
let lastRebuildSignature = null;
let lastRebuildResult = null;
function runSignature(runs) {
    if (!runs.length)
        return 'runs:0';
    const parts = [];
    parts.push(`runs:${runs.length}`);
    for (const run of runs) {
        const id = (run.id ?? '').toString();
        const createdAt = Number.isFinite(run.createdAt) ? String(run.createdAt) : '';
        const startedAt = run.startedAt ?? '';
        const routeLen = run.route?.length ?? 0;
        parts.push(`${id}|${createdAt}|${startedAt}|${routeLen}`);
    }
    return parts.join('~');
}
// Convert LatLng path to a closed GeoJSON ring (first == last). Returns null if invalid.
function buildRunPolygon(path) {
    if (!Array.isArray(path) || path.length < 1) {
        return null;
    }
    // Convert to [lng, lat] positions
    const coords = path.map((p) => [p.longitude, p.latitude]);
    const first = coords[0];
    // If we have too few points for a polygon, synthesize a small square around the first point.
    if (coords.length < 3) {
        if (!first || !Number.isFinite(first[0]) || !Number.isFinite(first[1]))
            return null;
        const midLatRad = first[1] * (Math.PI / 180);
        const padMeters = 12; // small footprint so very short runs still show
        const latPadDeg = padMeters / 111320;
        const lonPadDeg = padMeters / (111320 * Math.max(0.2, Math.cos(midLatRad)));
        const square = [
            [first[0] - lonPadDeg, first[1] - latPadDeg],
            [first[0] + lonPadDeg, first[1] - latPadDeg],
            [first[0] + lonPadDeg, first[1] + latPadDeg],
            [first[0] - lonPadDeg, first[1] + latPadDeg],
            [first[0] - lonPadDeg, first[1] - latPadDeg],
        ];
        const poly = (0, helpers_1.polygon)([square]);
        const area = (0, area_1.default)(poly);
        return isFinite(area) && area > 0 ? poly : null;
    }
    const last = coords[coords.length - 1];
    const isClosed = first[0] === last[0] && first[1] === last[1];
    if (!isClosed) {
        coords.push(first);
    }
    // Degenerate polygons (very tiny area) can cause issues; bail out if area ~ 0
    const poly = (0, helpers_1.polygon)([coords]);
    const area = (0, area_1.default)(poly); // m²
    if (!isFinite(area) || area < 1) {
        // Fallback: extremely small / degenerate path. Create a minimal buffered
        // rectangle around the path so short test runs still produce territory.
        const lats = coords.map((c) => c[1]).filter((v) => Number.isFinite(v));
        const lngs = coords.map((c) => c[0]).filter((v) => Number.isFinite(v));
        if (!lats.length || !lngs.length)
            return null;
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const midLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
        // Pad by ~10m to survive cleanup thresholds.
        const padMeters = 10;
        const latPadDeg = padMeters / 111320; // meters per degree latitude
        const lonPadDeg = padMeters / (111320 * Math.max(0.2, Math.cos(midLatRad)));
        const ring = [
            [minLng - lonPadDeg, minLat - latPadDeg],
            [maxLng + lonPadDeg, minLat - latPadDeg],
            [maxLng + lonPadDeg, maxLat + latPadDeg],
            [minLng - lonPadDeg, maxLat + latPadDeg],
            [minLng - lonPadDeg, minLat - latPadDeg],
        ];
        const fallbackPoly = (0, helpers_1.polygon)([ring]);
        const fallbackArea = (0, area_1.default)(fallbackPoly);
        if (!isFinite(fallbackArea) || fallbackArea < 1)
            return null;
        return fallbackPoly;
    }
    return poly;
}
function devLog(event, data) {
    if (!__DEV__ || !territoryCleanupConfig_1.territoryCleanupConfig.debugLogs)
        return;
    try {
        console.log(`[territoryCleanup] ${event} ${JSON.stringify(data)}`);
    }
    catch {
        console.log(`[territoryCleanup] ${event}`, data);
    }
}
const cleanupLogThrottleByOwner = new Map();
function shouldLogCleanup(ownerId) {
    if (!__DEV__ || !territoryCleanupConfig_1.territoryCleanupConfig.debugLogs)
        return false;
    const key = ownerId ?? 'unknown';
    const now = Date.now();
    const last = cleanupLogThrottleByOwner.get(key) ?? 0;
    if (now - last < 5000)
        return false;
    cleanupLogThrottleByOwner.set(key, now);
    return true;
}
function territoryStats(territory) {
    if (!territory)
        return { polygons: 0, vertices: 0 };
    const polys = territory.geometry.type === 'Polygon'
        ? [territory.geometry.coordinates]
        : territory.geometry.type === 'MultiPolygon'
            ? territory.geometry.coordinates
            : [];
    let vertices = 0;
    for (const poly of polys) {
        for (const ring of poly)
            vertices += ring.length;
    }
    return { polygons: polys.length, vertices };
}
function ensureClosedRing(ring) {
    if (!ring.length)
        return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closed = first[0] === last[0] && first[1] === last[1];
    return closed ? ring : [...ring, first];
}
function ringAreaM2(ring) {
    if (!ring || ring.length < 4)
        return 0;
    try {
        return (0, area_1.default)((0, helpers_1.polygon)([ensureClosedRing(ring)]));
    }
    catch {
        return 0;
    }
}
function haversinePositionMeters(a, b) {
    return (0, geoMetrics_1.haversineMeters)({ latitude: a[1], longitude: a[0] }, { latitude: b[1], longitude: b[0] });
}
function simplifyRing(ring, toleranceMeters) {
    if (!toleranceMeters || toleranceMeters <= 0)
        return ring;
    const closed = ensureClosedRing(ring);
    if (closed.length < 6)
        return closed;
    const out = [closed[0]];
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
function mercatorProjectMeters(pt) {
    const lng = pt?.[0];
    const lat = pt?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat))
        return null;
    // WebMercator projection (meters), stable and fast for small extents.
    const R = 6378137;
    const lonRad = (lng * Math.PI) / 180;
    const latRad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180; // clamp to avoid infinity
    const x = R * lonRad;
    const y = R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return { x, y };
}
function pcaExtentMeters(ring) {
    const pts = (ring ?? []).map(mercatorProjectMeters).filter(Boolean);
    if (pts.length < 3)
        return { lengthM: 0, widthM: 0, aspect: 0 };
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
    }
    else {
        // Axis-aligned fallback.
        if (cxx >= cyy) {
            vx = 1;
            vy = 0;
        }
        else {
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
function cleanupPolygonCoords(poly, opts) {
    const outer = poly[0] ?? [];
    const holes = poly.slice(1);
    const keptHoles = [];
    let removedHoles = 0;
    for (const h of holes) {
        const area = ringAreaM2(h);
        if (area > 0 && area < territoryCleanupConfig_1.territoryCleanupConfig.minHoleAreaM2) {
            removedHoles += 1;
            continue;
        }
        keptHoles.push(ensureClosedRing(h));
    }
    const simplifiedOuter = simplifyRing(ensureClosedRing(outer), opts.simplifyToleranceMeters);
    return { coords: [simplifiedOuter, ...keptHoles], removedHoles };
}
function cleanupTerritoryFeatureInternal(territory, opts) {
    if (!territory)
        return { cleaned: null, removedFragments: 0, removedHoles: 0 };
    const simplifyTol = territoryCleanupConfig_1.territoryCleanupConfig.simplifyToleranceMeters;
    const polys = territory.geometry.type === 'Polygon'
        ? [territory.geometry.coordinates]
        : territory.geometry.type === 'MultiPolygon'
            ? territory.geometry.coordinates
            : [];
    if (!polys.length)
        return { cleaned: null, removedFragments: 0, removedHoles: 0 };
    // First pass: compute part area + geometry metrics (no hole cleanup yet, per requirements).
    const parts = polys
        .map((p) => {
        const coords = p;
        const outer = coords?.[0] ?? [];
        let areaM2 = 0;
        try {
            areaM2 = (0, area_1.default)((0, helpers_1.polygon)(coords));
        }
        catch {
            areaM2 = 0;
        }
        const { lengthM, widthM, aspect } = pcaExtentMeters(outer);
        return { coords, areaM2, lengthM, widthM, aspect };
    })
        .filter((p) => (p.coords?.[0]?.length ?? 0) >= 4);
    if (!parts.length)
        return { cleaned: null, removedFragments: 0, removedHoles: 0 };
    const minFrag = territoryCleanupConfig_1.territoryCleanupConfig.minFragmentAreaM2;
    const hasMultipleParts = parts.length > 1;
    let kept = parts;
    let removedFragments = 0;
    let removedHoles = 0;
    if (hasMultipleParts) {
        kept = parts.filter((p) => {
            const areaM2 = Number.isFinite(p.areaM2) ? p.areaM2 : 0;
            const passesArea = areaM2 >= minFrag;
            const sliverCfg = territoryCleanupConfig_1.territoryCleanupConfig.thinSliver;
            const isThinSliver = !!sliverCfg?.enabled &&
                p.widthM > 0 &&
                p.widthM < sliverCfg.minThicknessM &&
                p.aspect > sliverCfg.minAspectRatio;
            const ok = passesArea && !isThinSliver;
            if (!ok)
                removedFragments += 1;
            if (isThinSliver && shouldLogCleanup(opts.ownerId)) {
                console.log(`[territoryCleanup] Removed sliver ownerId=${opts.ownerId ?? 'unknown'} area=${Math.round(areaM2)}m2 width=${p.widthM.toFixed(1)}m length=${p.lengthM.toFixed(1)}m aspect=${p.aspect.toFixed(1)}`);
            }
            return ok;
        });
        if (!kept.length) {
            // Safety: if everything would be removed, keep the single largest part.
            const largest = [...parts].sort((a, b) => (b.areaM2 ?? 0) - (a.areaM2 ?? 0))[0];
            kept = [largest];
            removedFragments = Math.max(0, parts.length - 1);
        }
    }
    else {
        // Single part: keep even if below threshold (unless we change this later).
        if (!territoryCleanupConfig_1.territoryCleanupConfig.keepSinglePartBelowThreshold) {
            const only = parts[0];
            if ((only.areaM2 ?? 0) < minFrag) {
                kept = [];
                removedFragments = 1;
            }
        }
        // Single part sliver safety: only delete if it is clearly a ribbon.
        const sliverCfg = territoryCleanupConfig_1.territoryCleanupConfig.thinSliver;
        if (kept.length && sliverCfg?.enabled) {
            const only = kept[0];
            const minAspect = sliverCfg.minAspectRatio * (sliverCfg.singlePartAspectRatioMultiplier ?? 1);
            const isThinSliver = only.widthM > 0 && only.widthM < sliverCfg.minThicknessM && only.aspect > minAspect;
            if (isThinSliver) {
                if (shouldLogCleanup(opts.ownerId)) {
                    console.log(`[territoryCleanup] Removed sliver ownerId=${opts.ownerId ?? 'unknown'} area=${Math.round(only.areaM2)}m2 width=${only.widthM.toFixed(1)}m length=${only.lengthM.toFixed(1)}m aspect=${only.aspect.toFixed(1)}`);
                }
                kept = [];
                removedFragments = 1;
            }
        }
    }
    // Now remove tiny holes + simplify on kept parts.
    const keptCoords = [];
    for (const p of kept) {
        const cleanedPoly = cleanupPolygonCoords(p.coords, { simplifyToleranceMeters: simplifyTol });
        removedHoles += cleanedPoly.removedHoles;
        keptCoords.push(cleanedPoly.coords);
    }
    const cleaned = keptCoords.length === 1 ? (0, helpers_1.polygon)(keptCoords[0]) : (0, helpers_1.multiPolygon)(keptCoords);
    if (opts.log && (removedFragments > 0 || removedHoles > 0)) {
        if (removedFragments > 0 && shouldLogCleanup(opts.ownerId)) {
            // Dev-only verification log (requested): easy to spot in device logs.
            console.log(`[territoryCleanup] Removed ${removedFragments} fragments under ${minFrag} m² for ownerId ${opts.ownerId ?? 'unknown'}`);
        }
        devLog('details', {
            ownerId: opts.ownerId ?? 'unknown',
            removedFragments,
            minFragmentAreaM2: minFrag,
            removedHoles,
            minHoleAreaM2: territoryCleanupConfig_1.territoryCleanupConfig.minHoleAreaM2,
            simplifyToleranceMeters: simplifyTol,
            thinSliver: territoryCleanupConfig_1.territoryCleanupConfig.thinSliver,
        });
    }
    return { cleaned: cleaned, removedFragments, removedHoles };
}
// Apply "last runner wins":
// - For every other player: territory = territory - newRunPolygon
// - For current player: territory = territory ∪ newRunPolygon
function updateTerritoriesWithRun(territories, runnerId, runPoly) {
    const endPerf = (0, perfLogger_1.perfStart)({
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
    const runCoords = featureToMultiCoords(runPoly);
    // Subtract from everyone else
    next.forEach((territory, playerId) => {
        if (!territory || playerId === runnerId)
            return;
        const theirs = featureToMultiCoords(territory);
        try {
            const diffCoords = pc.difference(theirs, runCoords);
            const diffFeat = multiCoordsToFeature(diffCoords);
            next.set(playerId, diffFeat);
        }
        catch (e) {
            // If difference fails (invalid geometry), keep their territory unchanged.
            console.log('[territoryEngine] difference failed', {
                playerId,
                runnerId,
                message: e?.message,
            });
            next.set(playerId, territory);
        }
    });
    // Union into runner territory (if none, they take the polygon as-is)
    const mine = next.get(runnerId) || null;
    let merged = runPoly;
    const mineCoords = (mine ? featureToMultiCoords(mine) : []);
    if (mine) {
        try {
            const mergedCoords = pc.union(mineCoords, runCoords);
            merged = multiCoordsToFeature(mergedCoords);
        }
        catch (e) {
            // If union fails (e.g., degenerate geometry), fall back to a combined multipolygon
            // so we keep previous territory plus the new run.
            console.log('[territoryEngine] union failed', {
                runnerId,
                message: e?.message,
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
function mergeAsMulti(a, b) {
    const polys = [];
    const add = (feat) => {
        if (feat.geometry.type === 'Polygon') {
            polys.push(feat.geometry.coordinates);
        }
        else if (feat.geometry.type === 'MultiPolygon') {
            polys.push(...feat.geometry.coordinates);
        }
    };
    add(a);
    add(b);
    return (0, helpers_1.multiPolygon)(polys);
}
// Rebuild territories from scratch given an ordered list of runs.
// Runs must be in chronological order for "last runner wins".
function rebuildTerritoriesFromRunsInternal(runs) {
    const runPoints = runs.reduce((sum, run) => sum + (run.route?.length ?? 0), 0);
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: 'TerritoryEngine',
        phase: 'DATA',
        label: 'rebuildTerritoriesFromRuns',
        meta: {
            runs: runs.length,
            totalPoints: runPoints,
        },
    });
    const territories = new Map();
    const areaBefore = new Map();
    const ordered = [...runs].sort((a, b) => {
        const parseTs = (r) => {
            const createdAt = r.createdAt ?? undefined;
            if (Number.isFinite(createdAt))
                return createdAt;
            if (r.startedAt) {
                const t = Date.parse(r.startedAt);
                if (Number.isFinite(t))
                    return t;
            }
            // If we can't determine time, treat as oldest so it doesn't incorrectly "win" by applying last.
            return 0;
        };
        const ta = parseTs(a);
        const tb = parseTs(b);
        if (ta !== tb)
            return ta - tb;
        const ida = (a.id ?? '').toString();
        const idb = (b.id ?? '').toString();
        return ida.localeCompare(idb);
    });
    for (const run of ordered) {
        if (!run.userId)
            continue;
        const poly = buildRunPolygon(run.route);
        if (!poly)
            continue;
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
                    if (ownerId === run.userId)
                        return;
                    const before = areaBefore.get(ownerId) ?? 0;
                    const after = territoryAreaKm2(feat);
                    if (after > before + 1e-6) {
                        throw new Error(`[territoryEngine] area increased after subtraction (runOwner=${run.userId} victim=${ownerId} before=${before} after=${after})`);
                    }
                });
            }
        }
        catch (e) {
            // Skip this run if geometry operations fail.
            continue;
        }
    }
    // Cleanup pass (sliver removal + optional smoothing) applied consistently for all modes.
    const cleaned = new Map();
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
function rebuildTerritoriesFromRuns(runs) {
    const signature = runSignature(runs);
    if (lastRebuildSignature && lastRebuildSignature === signature && lastRebuildResult) {
        return lastRebuildResult;
    }
    if (rebuildInProgress) {
        pendingRebuildRuns = runs;
        pendingRebuildSignature = signature;
        (0, perfLogger_1.perfLog)({
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
function territoryAreaKm2(territory) {
    if (!territory)
        return 0;
    const areaM2 = (0, area_1.default)(territory);
    if (!isFinite(areaM2) || areaM2 <= 0)
        return 0;
    return areaM2 / 1000000;
}
// Convert territory (polygon or multipolygon) into arrays of LatLng rings for map rendering.
// Holes are currently ignored in rendering (outer rings only) to keep the map simple.
let territoryToMapLogAt = 0;
function territoryToMapPolygons(territory) {
    const now = Date.now();
    if (now - territoryToMapLogAt > 2000) {
        territoryToMapLogAt = now;
        (0, perfLogger_1.perfLog)({
            screen: 'TerritoryEngine',
            phase: 'MAP',
            label: 'territoryToMapPolygons',
            durationMs: 0,
            meta: territoryStats(territory),
        });
    }
    // Always apply cleanup just before rendering, in case a raw/uncleaned feature is passed in.
    const cleaned = cleanupTerritoryFeatureInternal(territory, { log: false }).cleaned;
    if (!cleaned)
        return [];
    if (cleaned.geometry.type === 'Polygon') {
        const rings = cleaned.geometry.coordinates;
        const outer = rings[0] ?? [];
        return [
            outer.map((pt) => {
                const [lng, lat] = pt;
                return { latitude: lat, longitude: lng };
            }),
        ];
    }
    if (cleaned.geometry.type === 'MultiPolygon') {
        return cleaned.geometry.coordinates.map((poly) => {
            const outer = poly[0] ?? [];
            return outer.map((pt) => {
                const [lng, lat] = pt;
                return { latitude: lat, longitude: lng };
            });
        });
    }
    return [];
}
// Helper to normalize data shape if we ever store/load territories from a backend.
function serializeTerritory(territory) {
    return territory ? territory : null;
}
function deserializeTerritory(data) {
    if (!data)
        return null;
    // Assume stored as GeoJSON Feature<Polygon|MultiPolygon>
    if (data.type === 'Feature' && data.geometry?.type) {
        return data;
    }
    return null;
}
// --- Helpers to convert between GeoJSON Features and polygon-clipping coords ---
// polygon-clipping uses MultiPolygon coords: Array of polygons, each polygon is Array of rings (closed).
function featureToMultiCoords(feat) {
    if (feat.geometry.type === 'Polygon') {
        return [feat.geometry.coordinates];
    }
    if (feat.geometry.type === 'MultiPolygon') {
        return feat.geometry.coordinates;
    }
    return [];
}
function multiCoordsToFeature(coords) {
    if (!coords || coords.length === 0)
        return null;
    const arr = coords;
    // If only one polygon, return Polygon; else MultiPolygon
    if (arr.length === 1) {
        return (0, helpers_1.polygon)(arr[0]);
    }
    return (0, helpers_1.multiPolygon)(arr);
}

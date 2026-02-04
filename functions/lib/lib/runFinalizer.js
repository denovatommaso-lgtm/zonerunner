"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeRun = finalizeRun;
const geoMetrics_1 = require("./geo/geoMetrics");
const runBackgroundTracking_1 = require("./runBackgroundTracking");
/**
 * Finalize raw run data into an immutable payload for persistence.
 * - Merges background buffer (route + distance) if available.
 * - Computes area + elevation gain/loss.
 * - Builds the `RunDoc` payload (minus userId).
 *
 * Note: run validation (like "distance must be > 0") is intentionally NOT done here.
 */
async function finalizeRun(input) {
    // Merge any background-collected route/distance (best-effort).
    let mergedRoute = input.route;
    let mergedDistance = input.distanceMeters;
    try {
        const { coords: bgCoords, distanceMeters: bgDist } = await (0, runBackgroundTracking_1.readBackgroundBuffer)();
        if (bgCoords.length) {
            mergedRoute = [...mergedRoute, ...bgCoords];
        }
        mergedDistance += bgDist;
        await (0, runBackgroundTracking_1.clearBackgroundBuffer)();
    }
    catch (e) {
        // Keep foreground data if background buffer can't be read.
        console.log('Failed to merge background data', e);
    }
    // Ensure at least one route point so downstream consumers don't crash.
    const safeRoute = mergedRoute.length ? mergedRoute : input.route;
    const areaKm2 = safeRoute.length >= 3 ? (0, geoMetrics_1.approximatePolygonAreaKm2)(safeRoute) : 0;
    const { gainM: elevationGainM, lossM: elevationLossM } = (0, geoMetrics_1.computeElevationGainLossMeters)(safeRoute);
    const createdAt = Date.now();
    const runPayload = {
        mode: input.mode,
        scope: input.mode,
        groupId: input.mode === 'group' ? input.groupId : undefined,
        groupRunType: input.mode === 'group' ? input.groupRunType : undefined,
        distance: Math.max(0, mergedDistance),
        elapsedSeconds: Math.max(0, input.elapsedSeconds),
        startedAt: input.startedAt.toISOString(),
        route: safeRoute,
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

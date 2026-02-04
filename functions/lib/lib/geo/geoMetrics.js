"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineMeters = haversineMeters;
exports.approximatePolygonAreaKm2 = approximatePolygonAreaKm2;
exports.computeElevationGainLossMeters = computeElevationGainLossMeters;
function haversineMeters(a, b) {
    const R = 6371000; // meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const aa = sinDLat * sinDLat +
        Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
}
// Approximate polygon area on Earth surface (for relatively small routes)
// using a simple local planar projection in meters and the shoelace formula.
function approximatePolygonAreaKm2(points) {
    if (!points || points.length < 3)
        return 0;
    const R = 6371000; // meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    // Use the first point as origin for local projection
    const origin = points[0];
    const originLatRad = toRad(origin.latitude);
    const toXY = (p) => {
        const x = R * (toRad(p.longitude - origin.longitude) * Math.cos(originLatRad));
        const y = R * toRad(p.latitude - origin.latitude);
        return { x, y };
    };
    const xy = points.map(toXY);
    let area = 0;
    for (let i = 0; i < xy.length; i++) {
        const j = (i + 1) % xy.length;
        area += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
    }
    area = Math.abs(area) / 2; // m²
    return area / 1000000; // km²
}
function computeElevationGainLossMeters(points) {
    // Best-effort elevation calculation from GPS altitude samples.
    // GPS altitude can be noisy; apply simple filtering to avoid obvious spikes.
    const MAX_ALT_ACCURACY_M = 25;
    const MIN_DELTA_M = 1.5;
    const MAX_STEP_M = 35;
    let lastAlt = null;
    let gainM = 0;
    let lossM = 0;
    for (const p of points) {
        const alt = typeof p.altitudeM === 'number' ? p.altitudeM : null;
        const acc = typeof p.altitudeAccuracyM === 'number' ? p.altitudeAccuracyM : null;
        if (alt == null)
            continue;
        if (acc != null && acc > MAX_ALT_ACCURACY_M)
            continue;
        if (lastAlt == null) {
            lastAlt = alt;
            continue;
        }
        const d = alt - lastAlt;
        if (!Number.isFinite(d)) {
            lastAlt = alt;
            continue;
        }
        // Drop obvious spikes/glitches.
        if (Math.abs(d) > MAX_STEP_M) {
            lastAlt = alt;
            continue;
        }
        if (Math.abs(d) < MIN_DELTA_M) {
            lastAlt = alt;
            continue;
        }
        if (d > 0)
            gainM += d;
        else
            lossM += -d;
        lastAlt = alt;
    }
    return { gainM: Math.round(gainM), lossM: Math.round(lossM) };
}

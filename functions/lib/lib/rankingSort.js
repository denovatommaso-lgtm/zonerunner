"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareRankEntries = compareRankEntries;
function compareRankEntries(a, b) {
    const distanceDiff = (b.distanceMeters ?? 0) - (a.distanceMeters ?? 0);
    if (distanceDiff !== 0)
        return distanceDiff > 0 ? 1 : -1;
    const aTs = Number.isFinite(a.lastActivityAtMs)
        ? a.lastActivityAtMs
        : Number.MAX_SAFE_INTEGER;
    const bTs = Number.isFinite(b.lastActivityAtMs)
        ? b.lastActivityAtMs
        : Number.MAX_SAFE_INTEGER;
    if (aTs !== bTs)
        return aTs - bTs;
    return (a.userId ?? '').localeCompare(b.userId ?? '');
}

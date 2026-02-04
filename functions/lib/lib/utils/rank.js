"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankColor = void 0;
exports.computeRanks = computeRanks;
const rankColor = (rank) => rank === 1
    ? '#fbbf24' // gold
    : rank === 2
        ? '#c0c7d1' // silver
        : rank === 3
            ? '#f97316' // bronze
            : '#e5e7eb'; // white
exports.rankColor = rankColor;
/**
 * Compute area and distance ranks for the current user.
 * If the user has no runs, ranks are 0.
 */
function computeRanks(entries, userId, hasRuns = true) {
    const safeEntries = entries.map((e) => ({
        ...e,
        areaKm2: e.areaKm2 ?? 0,
        distanceKm: e.distanceKm ?? 0,
    }));
    if (!hasRuns || !userId) {
        return {
            areaRank: 0,
            distanceRank: 0,
            areaRankColor: (0, exports.rankColor)(0),
            distanceRankColor: (0, exports.rankColor)(0),
        };
    }
    const sortedArea = [...safeEntries].sort((a, b) => b.areaKm2 - a.areaKm2);
    const sortedDistance = [...safeEntries].sort((a, b) => b.distanceKm - a.distanceKm);
    const areaRankIndex = sortedArea.findIndex((e) => e.id === userId);
    const distanceRankIndex = sortedDistance.findIndex((e) => e.id === userId);
    const areaRank = areaRankIndex >= 0 ? areaRankIndex + 1 : 0;
    const distanceRank = distanceRankIndex >= 0 ? distanceRankIndex + 1 : 0;
    return {
        areaRank,
        distanceRank,
        areaRankColor: (0, exports.rankColor)(areaRank),
        distanceRankColor: (0, exports.rankColor)(distanceRank),
    };
}

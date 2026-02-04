"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLeaderboardEntries = buildLeaderboardEntries;
exports.buildHomeStats = buildHomeStats;
function buildLeaderboardEntries(runs, { mode, activeGroupId, groups, userId, areaByOwner, }) {
    const aggregates = new Map();
    const filtered = mode === 'group'
        ? runs.filter((r) => r.groupRunType === 'official')
        : runs;
    filtered.forEach((run) => {
        const uid = mode === 'group' ? run.groupId || 'unknown' : run.userId || 'unknown';
        const agg = aggregates.get(uid) ?? { areaKm2: 0, distanceKm: 0 };
        agg.distanceKm += (run.distance ?? 0) / 1000;
        aggregates.set(uid, agg);
    });
    return Array.from(aggregates.entries()).map(([uid, agg]) => {
        const name = `User ${uid.slice(0, 6)}`;
        const initials = (name[0] || 'U').toUpperCase();
        const color = mode === 'group' && activeGroupId
            ? groups.find((g) => g.id === activeGroupId)?.color ?? '#38bdf8'
            : '#38bdf8';
        return {
            id: uid,
            name,
            initials,
            color,
            isYou: uid === userId,
            areaKm2: areaByOwner?.get(uid) ?? agg.areaKm2,
            distanceKm: agg.distanceKm,
        };
    });
}
function buildHomeStats(mode, runs, groupStats, opts) {
    const normalizeRun = (r) => {
        if (!r)
            return null;
        const startedAt = r.startedAt ||
            (r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString());
        return {
            ...r,
            distance: r.distance ?? 0,
            elapsedSeconds: r.elapsedSeconds ?? 0,
            startedAt,
        };
    };
    if (mode === 'group') {
        const lastRunRaw = runs.length
            ? [...runs].sort((a, b) => (b.createdAt ?? new Date(b.startedAt || '').getTime()) -
                (a.createdAt ?? new Date(a.startedAt || '').getTime()))[0]
            : null;
        const lastRun = normalizeRun(lastRunRaw);
        return {
            totalRuns: groupStats.runs,
            totalDistanceMeters: groupStats.distanceKm * 1000,
            totalTimeSeconds: runs.reduce((s, r) => s + (r.elapsedSeconds ?? 0), 0),
            totalAreaKm2: opts?.groupAreaKm2 ?? groupStats.areaKm2,
            lastRun,
        };
    }
    const totalRuns = runs.length;
    const totalDistanceMeters = runs.reduce((sum, r) => sum + (r.distance ?? 0), 0);
    const totalTimeSeconds = runs.reduce((sum, r) => sum + (r.elapsedSeconds ?? 0), 0);
    const personalAreaRuns = runs.filter((r) => r.mode !== 'group' && !r.groupId);
    const totalAreaKm2 = opts?.currentAreaKm2 ?? 0;
    const lastRun = normalizeRun(runs.length
        ? [...runs].sort((a, b) => (b.createdAt ?? new Date(b.startedAt || '').getTime()) -
            (a.createdAt ?? new Date(a.startedAt || '').getTime()))[0]
        : null);
    return {
        totalRuns,
        totalDistanceMeters,
        totalTimeSeconds,
        totalAreaKm2,
        lastRun,
    };
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndRecordMainRanking = checkAndRecordMainRanking;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const runContext_1 = require("./runContext");
const authService_1 = require("./authService");
const monthlyChallengesService_1 = require("./monthlyChallengesService");
const monthlyChallengesConfig_1 = require("./monthlyChallengesConfig");
const bootstrapLogger_1 = require("./bootstrapLogger");
const monthlyChallenges_1 = require("./monthlyChallenges");
const rankingSort_1 = require("./rankingSort");
const rankingLocationData_1 = require("./rankingLocationData");
const LAST_SUCCESS_KEY_PREFIX = 'ranking:lastSuccessAtMs:';
const SNAPSHOT_KEY_PREFIX = 'ranking:snapshot';
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function isRetryableTxnError(err) {
    const code = err?.code;
    return (code === 'failed-precondition' ||
        code === 'aborted' ||
        code === 'unavailable' ||
        code === 'deadline-exceeded' ||
        code === 'resource-exhausted' ||
        code === 'internal' ||
        code === 'unknown');
}
function devLog(event, data) {
    if (!__DEV__)
        return;
    try {
        console.log(`[RankingTracker] ${event} ${JSON.stringify(data)}`);
    }
    catch {
        console.log(`[RankingTracker] ${event}`, data);
    }
}
function monthBoundsMs(now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
    return { start, end };
}
function runTimestampMs(run) {
    const createdAt = Number(run?.createdAt);
    if (Number.isFinite(createdAt) && createdAt > 0)
        return createdAt;
    const startedAt = Date.parse(run?.startedAt ?? '');
    return Number.isFinite(startedAt) ? startedAt : 0;
}
function snapshotKey(userId, monthKey, scope) {
    return `${SNAPSHOT_KEY_PREFIX}:${userId}:${monthKey}:${scope}`;
}
function normalizeState(value) {
    return (value ?? '').trim().toUpperCase();
}
function normalizeCountry(value) {
    return (value ?? '').trim().toUpperCase();
}
function rankForUser(entries, latestTsByUser, userId) {
    const sorted = entries
        .map((entry) => ({
        userId: entry.id,
        distanceMeters: (entry.distanceKm ?? 0) * 1000,
        lastActivityAtMs: Number.isFinite(latestTsByUser[entry.id])
            ? latestTsByUser[entry.id]
            : Number.MAX_SAFE_INTEGER,
    }))
        .sort(rankingSort_1.compareRankEntries);
    const idx = sorted.findIndex((e) => e.userId === userId);
    return idx >= 0 ? idx + 1 : null;
}
const inFlightByUser = new Map();
const lastAttemptAtByUser = new Map();
const hydratedUsers = new Map();
async function hydrateCachedSnapshots(userId, monthKey) {
    const lastHydrated = hydratedUsers.get(userId);
    if (lastHydrated === monthKey)
        return;
    hydratedUsers.set(userId, monthKey);
    const scopes = ['state', 'country', 'world'];
    const keys = scopes.map((scope) => snapshotKey(userId, monthKey, scope));
    const entries = await async_storage_1.default.multiGet(keys);
    for (let i = 0; i < entries.length; i += 1) {
        const [key, raw] = entries[i] ?? [];
        if (!key || !raw)
            continue;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.rank !== 'number' || typeof parsed.atMs !== 'number')
                continue;
            const scope = parsed.scope ?? scopes[i];
            await monthlyChallengesService_1.MonthlyChallengesService.ingestRankingSnapshot({
                userId,
                at: parsed.atMs,
                rank: parsed.rank,
                scope,
            });
        }
        catch {
            // ignore corrupted snapshot cache
        }
    }
}
function getRankForScope(params) {
    const { scope, userId, entries, latestTsByUser, locationByUser } = params;
    if (scope === 'world') {
        return rankForUser(entries, latestTsByUser, userId);
    }
    if (scope === 'state') {
        const userState = normalizeState(params.profileState);
        if (!userState) {
            if (__DEV__) {
                console.warn('[RankingTracker] missing stateCode; set Rankings Location in Settings', {
                    userId,
                });
            }
            return null;
        }
        const filtered = entries.filter((e) => normalizeState(locationByUser[e.id]?.stateCode) === userState);
        if (__DEV__ && filtered.length === 0) {
            const sample = Object.values(locationByUser)
                .slice(0, 5)
                .map((loc) => loc.stateCode || '');
            console.warn('[RankingTracker] state filter empty', {
                userId,
                userState,
                sampleStates: sample,
            });
        }
        return rankForUser(filtered, latestTsByUser, userId);
    }
    const userCountry = normalizeCountry(params.profileCountry);
    if (!userCountry) {
        if (__DEV__) {
            console.warn('[RankingTracker] missing countryCode; set Rankings Location in Settings', {
                userId,
            });
        }
        return null;
    }
    const filtered = entries.filter((e) => normalizeCountry(locationByUser[e.id]?.countryCode) === userCountry);
    if (__DEV__ && filtered.length === 0) {
        const sample = Object.values(locationByUser)
            .slice(0, 5)
            .map((loc) => loc.countryCode || '');
        console.warn('[RankingTracker] country filter empty', {
            userId,
            userCountry,
            sampleCountries: sample,
        });
    }
    return rankForUser(filtered, latestTsByUser, userId);
}
/**
 * Record the user's state/country/world positions for the monthly Ranking challenge.
 *
 * Source-of-truth: distance leaderboard positions computed from monthly runs.
 *
 * This is best-effort and non-blocking; failures must never impact run saving or navigation.
 */
async function checkAndRecordMainRanking(params) {
    const { userId, reason, force } = params;
    if (!userId)
        return;
    const existing = inFlightByUser.get(userId);
    if (existing)
        return existing;
    const run = (async () => {
        const tag = `RankingTracker.checkAndRecordMainRanking:${userId}:${reason}`;
        (0, bootstrapLogger_1.logStart)(tag, { userId, reason });
        const now = Date.now();
        try {
            const mk = (0, monthlyChallenges_1.monthKeyFromEpochMsLocal)(now);
            await hydrateCachedSnapshots(userId, mk);
            const memLast = lastAttemptAtByUser.get(userId) ?? 0;
            const storageKey = `${LAST_SUCCESS_KEY_PREFIX}${userId}`;
            const storedLastSuccess = Number(await async_storage_1.default.getItem(storageKey)) || 0;
            const last = Math.max(memLast, storedLastSuccess);
            const minInterval = monthlyChallengesConfig_1.monthlyRankingConfig.minCheckIntervalMs;
            if (!force && last && now - last < minInterval) {
                return;
            }
            lastAttemptAtByUser.set(userId, now);
            const runs = await (0, runContext_1.fetchRunsForContext)({ global: true });
            const { start, end } = monthBoundsMs(new Date(now));
            const monthRuns = runs.filter((r) => {
                const ts = runTimestampMs(r);
                return ts >= start && ts < end;
            });
            const aggregates = new Map();
            const latestLocationByUser = {};
            const latestTsByUser = {};
            monthRuns.forEach((run) => {
                const uid = run.userId || 'unknown';
                const agg = aggregates.get(uid) ?? { distanceKm: 0 };
                agg.distanceKm += (run.distance ?? 0) / 1000;
                aggregates.set(uid, agg);
                const fallbackCountry = (0, rankingLocationData_1.normalizeCountryInput)((run.countryName ?? run.country ?? run.nation ?? ''));
                const rawCountry = (run.countryCode ?? '').toString().trim();
                const countryCode = normalizeCountry(rawCountry || fallbackCountry || '');
                const rawState = (run.stateCode ?? '').toString().trim();
                const fallbackState = (0, rankingLocationData_1.normalizeStateInput)(countryCode, (run.stateName ?? run.state ?? run.region ?? run.subregion ?? ''));
                const stateCode = normalizeState(rawState || fallbackState || '');
                if (!stateCode && !countryCode)
                    return;
                const ts = run.createdAt ?? Date.parse(run.startedAt ?? '') ?? 0;
                const prevTs = latestTsByUser[uid] ?? -1;
                if (ts >= prevTs) {
                    latestTsByUser[uid] = ts;
                    latestLocationByUser[uid] = {
                        stateCode,
                        countryCode,
                    };
                }
            });
            const entries = Array.from(aggregates.entries()).map(([id, agg]) => ({
                id,
                distanceKm: agg.distanceKm ?? 0,
            }));
            const profile = await (0, authService_1.loadUserProfile)(userId).catch(() => null);
            const profileState = profile?.stateCode ?? '';
            const profileCountry = profile?.countryCode ?? '';
            // Retry around the service in case of contention on the monthlyChallenges doc.
            const maxRetries = 3;
            const scopes = ['state', 'country', 'world'];
            for (const scope of scopes) {
                const rank = getRankForScope({
                    scope,
                    userId,
                    profileState,
                    profileCountry,
                    entries,
                    latestTsByUser,
                    locationByUser: latestLocationByUser,
                });
                if (!rank)
                    continue;
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        const status = await monthlyChallengesService_1.MonthlyChallengesService.ingestRankingSnapshot({
                            userId,
                            at: now,
                            rank,
                            scope,
                        });
                        if (status === 'skipped_invalid_rank') {
                            devLog('skipped_invalid_rank', { userId, reason, rank, scope });
                            (0, bootstrapLogger_1.logSuccess)(tag, { skipped: 'invalid_rank', rank, scope, runsCount: monthRuns.length });
                            break;
                        }
                        await async_storage_1.default.setItem(snapshotKey(userId, mk, scope), JSON.stringify({ rank, atMs: now, scope }));
                        break;
                    }
                    catch (e) {
                        if (attempt < maxRetries && isRetryableTxnError(e)) {
                            const backoff = 150 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
                            await sleep(backoff);
                            continue;
                        }
                        throw e;
                    }
                }
            }
            await async_storage_1.default.setItem(storageKey, String(now));
            devLog('recorded', { userId, reason });
            (0, bootstrapLogger_1.logSuccess)(tag, { runsCount: monthRuns.length });
        }
        catch (e) {
            devLog('failed', { userId, reason, error: e?.message ?? String(e) });
            (0, bootstrapLogger_1.logFailure)(tag, e, { userId, reason });
        }
    })();
    inFlightByUser.set(userId, run);
    try {
        await run;
    }
    finally {
        inFlightByUser.delete(userId);
    }
}

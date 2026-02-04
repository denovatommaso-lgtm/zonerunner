"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonthlyChallengesService = void 0;
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const monthlyChallenges_1 = require("./monthlyChallenges");
const monthlyChallengesStore_1 = require("./monthlyChallengesStore");
const runService_1 = require("./runService");
const perfLogger_1 = require("./perfLogger");
const bootstrapLogger_1 = require("./bootstrapLogger");
function devLog(event, data) {
    if (!__DEV__)
        return;
    try {
        console.log(`[MonthlyChallenges] ${event} ${JSON.stringify(data)}`);
    }
    catch {
        console.log(`[MonthlyChallenges] ${event}`, data);
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function getLegacyMonthlyState(userId) {
    try {
        const userSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, 'users', userId));
        const data = userSnap.data() ?? {};
        return data.monthlyChallenges ?? null;
    }
    catch {
        return null;
    }
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
function isPermissionDenied(err) {
    const code = err?.code;
    return code === 'permission-denied';
}
exports.MonthlyChallengesService = {
    async ensureCurrentMonth(userId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'MonthlyChallengesService',
            phase: 'DATA',
            label: 'ensureCurrentMonth',
            meta: { userId },
        });
        const tag = `MonthlyChallengesService.ensureCurrentMonth:${userId}`;
        (0, bootstrapLogger_1.logStart)(tag, { userId });
        const stateRef = (0, monthlyChallengesStore_1.monthlyChallengesDocRef)(userId);
        const userRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'users', userId);
        const legacy = await getLegacyMonthlyState(userId);
        const maxRetries = 3;
        try {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                        const stateSnap = await tx.get(stateRef);
                        const existing = (stateSnap.exists() ? stateSnap.data() : null) ??
                            legacy ??
                            (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
                        const next = (0, monthlyChallenges_1.ensureMonthRollover)(existing, new Date());
                        if (next.updatedAt !== existing.updatedAt || next.lastMonthKey !== existing.lastMonthKey || !stateSnap.exists()) {
                            tx.set(stateRef, next, { merge: false });
                        }
                    });
                    endPerf({ path: 'stateRef' });
                    (0, bootstrapLogger_1.logSuccess)(tag, { path: 'stateRef' });
                    return;
                }
                catch (e) {
                    if (attempt < maxRetries && isRetryableTxnError(e)) {
                        const backoff = 120 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
                        await sleep(backoff);
                        continue;
                    }
                    if (!isPermissionDenied(e))
                        throw e;
                    break;
                }
            }
            await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                const snap = await tx.get(userRef);
                const data = snap.data() ?? {};
                const existing = data.monthlyChallenges ?? (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
                const next = (0, monthlyChallenges_1.ensureMonthRollover)(existing, new Date());
                if (next.updatedAt !== existing.updatedAt || next.lastMonthKey !== existing.lastMonthKey) {
                    tx.set(userRef, { monthlyChallenges: next }, { merge: true });
                }
            });
            endPerf({ path: 'userRef' });
            (0, bootstrapLogger_1.logSuccess)(tag, { path: 'userRef' });
        }
        catch (e) {
            (0, bootstrapLogger_1.logFailure)(tag, e, { userId });
            if (!isPermissionDenied(e))
                throw e;
            // If both paths are blocked we surface the original error.
            throw e;
        }
    },
    async ingestRun(params) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'MonthlyChallengesService',
            phase: 'DATA',
            label: 'ingestRun',
            meta: { userId: params.userId, runId: params.runId },
        });
        const tag = `MonthlyChallengesService.ingestRun:${params.userId}:${params.runId}`;
        (0, bootstrapLogger_1.logStart)(tag, { userId: params.userId, runId: params.runId });
        const { userId, runId, run } = params;
        const stateRef = (0, monthlyChallengesStore_1.monthlyChallengesDocRef)(userId);
        const userRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'users', userId);
        const legacy = await getLegacyMonthlyState(userId);
        const maxRetries = 3;
        let awardedCount = 0;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                    const stateSnap = await tx.get(stateRef);
                    const base = (stateSnap.exists() ? stateSnap.data() : null) ??
                        legacy ??
                        (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
                    const rolled = (0, monthlyChallenges_1.ensureMonthRollover)(base, new Date());
                    const { nextState, awardedMilestones } = (0, monthlyChallenges_1.applyRunToMonthlyChallenges)({
                        state: rolled,
                        userId,
                        runId,
                        run,
                    });
                    if (awardedMilestones.length) {
                        devLog('milestones_awarded', { userId, runId, awardedMilestones });
                    }
                    awardedCount = Math.max(awardedCount, awardedMilestones.length);
                    tx.set(stateRef, nextState, { merge: false });
                });
                endPerf();
                (0, bootstrapLogger_1.logSuccess)(tag, { awardedCount });
                return;
            }
            catch (e) {
                if (isPermissionDenied(e))
                    break;
                if (attempt < maxRetries && isRetryableTxnError(e)) {
                    const backoff = 120 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
                    await sleep(backoff);
                    continue;
                }
                (0, bootstrapLogger_1.logFailure)(tag, e, { userId, runId });
                throw e;
            }
        }
        await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
            const snap = await tx.get(userRef);
            const data = snap.data() ?? {};
            const base = data.monthlyChallenges ?? legacy ?? (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
            const rolled = (0, monthlyChallenges_1.ensureMonthRollover)(base, new Date());
            const { nextState, awardedMilestones } = (0, monthlyChallenges_1.applyRunToMonthlyChallenges)({
                state: rolled,
                userId,
                runId,
                run,
            });
            if (awardedMilestones.length) {
                devLog('milestones_awarded', { userId, runId, awardedMilestones });
            }
            awardedCount = Math.max(awardedCount, awardedMilestones.length);
            tx.set(userRef, { monthlyChallenges: nextState }, { merge: true });
        });
        endPerf();
        (0, bootstrapLogger_1.logSuccess)(tag, { awardedCount, fallback: true });
    },
    async ingestFriendAdded(params) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'MonthlyChallengesService',
            phase: 'DATA',
            label: 'ingestFriendAdded',
            meta: { userId: params.userId, eventId: params.eventId },
        });
        const { userId, eventId, acceptedAt } = params;
        const stateRef = (0, monthlyChallengesStore_1.monthlyChallengesDocRef)(userId);
        const userRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'users', userId);
        const mk = (0, monthlyChallenges_1.monthKeyFromEpochMsLocal)(acceptedAt);
        const legacy = await getLegacyMonthlyState(userId);
        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                    const stateSnap = await tx.get(stateRef);
                    const base = (stateSnap.exists() ? stateSnap.data() : null) ??
                        legacy ??
                        (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
                    const rolled = (0, monthlyChallenges_1.ensureMonthRollover)(base, new Date());
                    const { nextState, awardedMilestones } = (0, monthlyChallenges_1.applyMonthlyEventIncrement)({
                        state: rolled,
                        monthKey: mk,
                        challengeId: 'friends',
                        eventId,
                        amount: 1,
                    });
                    if (awardedMilestones.length) {
                        devLog('milestones_awarded', { userId, eventId, awardedMilestones });
                    }
                    tx.set(stateRef, nextState, { merge: false });
                });
                endPerf();
                return;
            }
            catch (e) {
                if (isPermissionDenied(e))
                    break;
                if (attempt < maxRetries && isRetryableTxnError(e)) {
                    const backoff = 120 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
                    await sleep(backoff);
                    continue;
                }
                throw e;
            }
        }
        await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
            const snap = await tx.get(userRef);
            const data = snap.data() ?? {};
            const base = data.monthlyChallenges ?? legacy ?? (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
            const rolled = (0, monthlyChallenges_1.ensureMonthRollover)(base, new Date());
            const { nextState, awardedMilestones } = (0, monthlyChallenges_1.applyMonthlyEventIncrement)({
                state: rolled,
                monthKey: mk,
                challengeId: 'friends',
                eventId,
                amount: 1,
            });
            if (awardedMilestones.length) {
                devLog('milestones_awarded', { userId, eventId, awardedMilestones });
            }
            tx.set(userRef, { monthlyChallenges: nextState }, { merge: true });
        });
        endPerf();
    },
    /**
     * Record a ranking snapshot for the monthly Ranking challenge.
     *
     * Source-of-truth: distance leaderboard positions for state/country/world scopes.
     */
    async ingestRankingSnapshot(params) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'MonthlyChallengesService',
            phase: 'DATA',
            label: 'ingestRankingSnapshot',
            meta: { userId: params.userId, rank: params.rank, scope: params.scope },
        });
        const tag = `MonthlyChallengesService.ingestRankingSnapshot:${params.userId}:${params.scope}:${params.rank}`;
        (0, bootstrapLogger_1.logStart)(tag, { userId: params.userId, rank: params.rank, scope: params.scope });
        const { userId, at, scope } = params;
        const normalizedRank = Number.isFinite(params.rank) ? Math.floor(params.rank) : NaN;
        if (!Number.isFinite(normalizedRank) || normalizedRank <= 0) {
            endPerf({ skipped: 'invalid_rank' });
            (0, bootstrapLogger_1.logSuccess)(tag, { skipped: 'invalid_rank' });
            return 'skipped_invalid_rank';
        }
        const stateRef = (0, monthlyChallengesStore_1.monthlyChallengesDocRef)(userId);
        const userRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'users', userId);
        const legacy = await getLegacyMonthlyState(userId);
        // Ranking updates can race with other monthly-challenge writes (run saves, month rollover, etc).
        // Make this more robust with a small retry loop for transaction contention errors.
        const maxRetries = 5;
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const { awarded } = await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                    const stateSnap = await tx.get(stateRef);
                    const base = (stateSnap.exists() ? stateSnap.data() : null) ?? legacy ?? (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
                    const rolled = (0, monthlyChallenges_1.ensureMonthRollover)(base, new Date());
                    const { nextState, awardedMilestones } = (0, monthlyChallenges_1.applyRankingSnapshotToMonthlyChallenges)({
                        state: rolled,
                        atMs: at,
                        rank: normalizedRank,
                        scope,
                    });
                    tx.set(stateRef, nextState, { merge: false });
                    return { awarded: awardedMilestones };
                });
                if ((awarded ?? []).length) {
                    devLog('milestones_awarded', { userId, challengeId: 'ranking', rank: normalizedRank, scope, awardedMilestones: awarded });
                }
                endPerf({ awarded: (awarded ?? []).length });
                (0, bootstrapLogger_1.logSuccess)(tag, { awardedCount: (awarded ?? []).length });
                return;
            }
            catch (e) {
                lastError = e;
                if (isPermissionDenied(e)) {
                    // Fallback to legacy storage (users/{uid}.monthlyChallenges) if needed.
                    const { awarded } = await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                        const snap = await tx.get(userRef);
                        const data = snap.data() ?? {};
                        const base = data.monthlyChallenges ?? legacy ?? (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
                        const rolled = (0, monthlyChallenges_1.ensureMonthRollover)(base, new Date());
                        const { nextState, awardedMilestones } = (0, monthlyChallenges_1.applyRankingSnapshotToMonthlyChallenges)({
                            state: rolled,
                            atMs: at,
                            rank: normalizedRank,
                            scope,
                        });
                        tx.set(userRef, { monthlyChallenges: nextState }, { merge: true });
                        return { awarded: awardedMilestones };
                    });
                    if ((awarded ?? []).length) {
                        devLog('milestones_awarded', { userId, challengeId: 'ranking', rank: normalizedRank, scope, awardedMilestones: awarded });
                    }
                    endPerf({ awarded: (awarded ?? []).length, fallback: true });
                    (0, bootstrapLogger_1.logSuccess)(tag, { awardedCount: (awarded ?? []).length, fallback: true });
                    return;
                }
                if (attempt < maxRetries && isRetryableTxnError(e)) {
                    const backoff = 120 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
                    await sleep(backoff);
                    continue;
                }
                break;
            }
        }
        // Fallback path for non-permission errors after retries: store under users/{uid}.monthlyChallenges
        try {
            const { awarded } = await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                const snap = await tx.get(userRef);
                const data = snap.data() ?? {};
                const base = data.monthlyChallenges ?? legacy ?? (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
                const rolled = (0, monthlyChallenges_1.ensureMonthRollover)(base, new Date());
                const { nextState, awardedMilestones } = (0, monthlyChallenges_1.applyRankingSnapshotToMonthlyChallenges)({
                    state: rolled,
                    atMs: at,
                    rank: normalizedRank,
                    scope,
                });
                tx.set(userRef, { monthlyChallenges: nextState }, { merge: true });
                return { awarded: awardedMilestones };
            });
            if ((awarded ?? []).length) {
                devLog('milestones_awarded', { userId, challengeId: 'ranking', rank: normalizedRank, scope, awardedMilestones: awarded });
            }
            endPerf({ awarded: (awarded ?? []).length, fallback: true });
            (0, bootstrapLogger_1.logSuccess)(tag, { awardedCount: (awarded ?? []).length, fallback: true });
        }
        catch (fallbackErr) {
            (0, bootstrapLogger_1.logFailure)(tag, fallbackErr, { userId, rank: normalizedRank, scope });
            // Surface the original error if fallback also fails.
            throw lastError ?? fallbackErr;
        }
    },
    // Backfill-safe: can be used if you computed a new state client-side and want to persist it.
    async saveState(userId, state) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'MonthlyChallengesService',
            phase: 'DATA',
            label: 'saveState',
            meta: { userId },
        });
        const stateRef = (0, monthlyChallengesStore_1.monthlyChallengesDocRef)(userId);
        await (0, firestore_1.setDoc)(stateRef, state, { merge: false });
        endPerf({ bytes: (0, perfLogger_1.perfBytes)(state) });
    },
    // Recompute monthly challenges from all runs (useful when older runs were not applied).
    async reconcileFromRuns(userId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'MonthlyChallengesService',
            phase: 'DATA',
            label: 'reconcileFromRuns',
            meta: { userId },
        });
        if (__DEV__) {
            console.log(`[RUNS_CALLSITE] file=lib/monthlyChallengesService.ts fn=reconcileFromRuns reason=monthlyReconcile ts=${Date.now()}`);
        }
        const runs = await (0, runService_1.loadRunsForUser)(userId);
        const ordered = [...runs].sort((a, b) => Date.parse(a.startedAt ?? '') - Date.parse(b.startedAt ?? ''));
        let state = (0, monthlyChallenges_1.initMonthlyChallengesState)(new Date());
        for (const run of ordered) {
            const runId = run.id ?? `${run.userId}-${run.startedAt}-${Math.random().toString(16).slice(2, 8)}`;
            const { nextState } = (0, monthlyChallenges_1.applyRunToMonthlyChallenges)({
                state,
                userId,
                runId,
                run,
            });
            state = nextState;
        }
        const stateRef = (0, monthlyChallengesStore_1.monthlyChallengesDocRef)(userId);
        await (0, firestore_1.setDoc)(stateRef, state, { merge: false });
        endPerf({ runs: runs.length, bytes: (0, perfLogger_1.perfBytes)(state) });
        return state;
    },
};

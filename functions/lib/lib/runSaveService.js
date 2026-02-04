"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunSaveService = void 0;
const Crypto = __importStar(require("expo-crypto"));
const runService_1 = require("./runService");
const monthlyChallengesService_1 = require("./monthlyChallengesService");
const yearlyChallengesService_1 = require("./yearlyChallengesService");
const pendingRunsStore_1 = require("./pendingRunsStore");
const deletedRunsStore_1 = require("./deletedRunsStore");
const rankingTracker_1 = require("./rankingTracker");
const territoryPrefetch_1 = require("./territoryPrefetch");
const territoryState_1 = require("./territoryState");
const offlineQueue_1 = require("./offlineQueue");
function devLog(event, data) {
    if (!__DEV__)
        return;
    try {
        // Keep it 1-line JSON for easy copy/paste from device logs.
        console.log(`[RunSave] ${event} ${JSON.stringify(data)}`);
    }
    catch {
        console.log(`[RunSave] ${event}`, data);
    }
}
function asFirebaseError(err) {
    if (!err || typeof err !== 'object')
        return null;
    const anyErr = err;
    if (typeof anyErr.code === 'string' && typeof anyErr.message === 'string') {
        return anyErr;
    }
    return null;
}
function isTransientFirestoreError(err) {
    const fe = asFirebaseError(err);
    const code = fe?.code ?? '';
    return (code === 'unavailable' ||
        code === 'deadline-exceeded' ||
        code === 'resource-exhausted' ||
        code === 'aborted' ||
        code === 'internal' ||
        code === 'unknown');
}
function isAuthError(err) {
    const fe = asFirebaseError(err);
    const code = fe?.code ?? '';
    return code === 'unauthenticated' || code === 'auth/unauthenticated';
}
function isPermissionError(err) {
    const fe = asFirebaseError(err);
    const code = fe?.code ?? '';
    return code === 'permission-denied';
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
// Pending run storage is centralized in `lib/pendingRunsStore.ts`.
async function attemptUpsertWithRetry(payload, runId, options) {
    const maxRetries = options?.maxRetries ?? 3;
    const baseDelayMs = options?.baseDelayMs ?? 350;
    let attempt = 0;
    // attempt count here is "retries after first try"
    // total tries = 1 + maxRetries
    for (;;) {
        try {
            attempt += 1;
            await (0, runService_1.upsertRun)(runId, payload);
            return { ok: true, attempts: attempt };
        }
        catch (err) {
            const fe = asFirebaseError(err);
            const code = fe?.code;
            devLog('upsert_failed', {
                runId,
                attempt,
                code,
                message: fe?.message ?? String(err),
            });
            // Definitive failures: do not retry here.
            if (isPermissionError(err) || isAuthError(err)) {
                return { ok: false, attempts: attempt, error: err };
            }
            // Retry only transient/network-ish failures, up to maxRetries.
            if (!isTransientFirestoreError(err) || attempt > 1 + maxRetries) {
                return { ok: false, attempts: attempt, error: err };
            }
            const backoff = baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = Math.floor(Math.random() * 120);
            await sleep(backoff + jitter);
        }
    }
}
exports.RunSaveService = {
    createRunId() {
        // stable id for idempotent upserts + offline queue
        return Crypto.randomUUID();
    },
    async saveRun(userId, run, options) {
        if (!userId) {
            return {
                status: 'auth_required',
                message: `You're not signed in. Sign in to save runs.`,
            };
        }
        const runId = options?.runId ?? exports.RunSaveService.createRunId();
        const payload = {
            ...run,
            userId,
        };
        devLog('save_start', {
            runId,
            userId,
            groupId: payload.groupId ?? null,
            scope: payload.scope ?? payload.mode ?? null,
            points: payload.route?.length ?? 0,
            distance: payload.distance,
            elapsedSeconds: payload.elapsedSeconds,
        });
        const cleanedPayload = { ...payload };
        Object.keys(cleanedPayload).forEach((k) => {
            if (cleanedPayload[k] === undefined) {
                delete cleanedPayload[k];
            }
        });
        const isWebOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (isWebOffline) {
            await pendingRunsStore_1.PendingRunsStore.upsert(userId, {
                userId,
                runId,
                payload: cleanedPayload,
                createdAt: Date.now(),
                attempts: 0,
                lastError: { code: 'offline', message: 'offline' },
            });
            await (0, offlineQueue_1.enqueueEvent)({
                id: runId,
                type: 'run.save',
                createdAt: Date.now(),
                payload: { userId },
            });
            (0, territoryPrefetch_1.upsertPrefetchedTerritoryRun)({ id: runId, ...payload, pending: true });
            if (payload.groupId) {
                (0, territoryState_1.invalidateTerritoryState)({ mode: 'group', groupId: payload.groupId });
            }
            else {
                await (0, territoryState_1.invalidatePersonalWithPending)(userId);
            }
            return { status: 'queued', runId };
        }
        const res = await attemptUpsertWithRetry(cleanedPayload, runId, options);
        if (res.ok) {
            devLog('save_success', { runId, attempts: res.attempts });
            // If it previously queued, remove it.
            await pendingRunsStore_1.PendingRunsStore.remove(userId, runId).catch(() => { });
            (0, territoryPrefetch_1.upsertPrefetchedTerritoryRun)({ id: runId, ...payload });
            // Territory changed; invalidate canonical state.
            if (payload.groupId) {
                (0, territoryState_1.invalidateTerritoryState)({ mode: 'group', groupId: payload.groupId });
            }
            else {
                (0, territoryState_1.invalidateTerritoryState)({ mode: 'personal' });
            }
            // Best-effort challenge ingest so stars/xp are up to date immediately.
            void (async () => {
                try {
                    await monthlyChallengesService_1.MonthlyChallengesService.ingestRun({ userId, runId, run: payload });
                    await yearlyChallengesService_1.YearlyChallengesService.ingestRun({ userId, runId, run: payload });
                }
                catch (e) {
                    devLog('challenge_ingest_failed', {
                        runId,
                        message: e?.message ?? String(e),
                    });
                }
            })();
            return { status: 'saved', runId };
        }
        const fe = asFirebaseError(res.error);
        const code = fe?.code;
        const message = fe?.message ?? 'Unknown error';
        if (isAuthError(res.error)) {
            return {
                status: 'auth_required',
                message: `You're not signed in. Sign in to save runs.`,
            };
        }
        // Hard requirement: a run must ALWAYS be saved locally if backend save fails for any reason.
        // Queue locally (even for permission-denied) and retry later; do not block user flow.
        try {
            await pendingRunsStore_1.PendingRunsStore.upsert(userId, {
                userId,
                runId,
                payload,
                createdAt: Date.now(),
                attempts: res.attempts,
                lastError: { code, message },
            });
            devLog('save_queued', { runId, code });
            // Update map cache so the user's territory reflects the run immediately, even if offline/queued.
            (0, territoryPrefetch_1.upsertPrefetchedTerritoryRun)({ id: runId, ...payload, pending: true });
            // Invalidate so pending territory is recomputed on next read.
            if (payload.groupId) {
                (0, territoryState_1.invalidateTerritoryState)({ mode: 'group', groupId: payload.groupId });
            }
            else {
                await (0, territoryState_1.invalidatePersonalWithPending)(userId);
            }
            return { status: 'queued', runId };
        }
        catch (queueErr) {
            devLog('queue_failed', { runId, message: queueErr?.message ?? String(queueErr) });
            return {
                status: 'failed',
                runId,
                errorCode: code,
                message: message,
            };
        }
    },
    async syncPendingRuns(userId, options) {
        const pending = await pendingRunsStore_1.PendingRunsStore.list(userId);
        if (!pending.length)
            return { synced: 0, remaining: 0 };
        const deleted = await deletedRunsStore_1.DeletedRunsStore.getSet();
        devLog('sync_start', { userId, pending: pending.length });
        let synced = 0;
        for (const item of pending) {
            if (deleted.has(item.runId)) {
                await pendingRunsStore_1.PendingRunsStore.remove(userId, item.runId).catch(() => { });
                continue;
            }
            const res = await attemptUpsertWithRetry(item.payload, item.runId, options);
            if (res.ok) {
                synced += 1;
                await pendingRunsStore_1.PendingRunsStore.remove(userId, item.runId);
                try {
                    await monthlyChallengesService_1.MonthlyChallengesService.ingestRun({
                        userId,
                        runId: item.runId,
                        run: item.payload,
                    });
                    await yearlyChallengesService_1.YearlyChallengesService.ingestRun({
                        userId,
                        runId: item.runId,
                        run: item.payload,
                    });
                }
                catch (e) {
                    devLog('challenge_ingest_failed', {
                        runId: item.runId,
                        message: e?.message ?? String(e),
                    });
                }
                continue;
            }
            const fe = asFirebaseError(res.error);
            const code = fe?.code;
            const message = fe?.message ?? 'Unknown error';
            const updated = {
                ...item,
                attempts: (item.attempts ?? 0) + 1,
                lastError: { code, message },
            };
            // If this isn't a transient error anymore (e.g. permission denied),
            // stop retrying automatically and leave it in the queue for manual handling.
            await pendingRunsStore_1.PendingRunsStore.upsert(userId, updated);
        }
        const remaining = (await pendingRunsStore_1.PendingRunsStore.list(userId)).length;
        devLog('sync_done', { userId, synced, remaining });
        if (synced > 0) {
            // Best-effort: rankings can change after runs sync; never block sync on this.
            void (0, rankingTracker_1.checkAndRecordMainRanking)({ userId, reason: 'after_run_save' });
        }
        return { synced, remaining };
    },
};

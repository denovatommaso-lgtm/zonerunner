"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertRun = upsertRun;
exports.saveRun = saveRun;
exports.loadRunsForUser = loadRunsForUser;
exports.loadAllRuns = loadAllRuns;
exports.loadAllGroupRuns = loadAllGroupRuns;
exports.loadRunById = loadRunById;
exports.deleteRun = deleteRun;
// lib/runService.ts
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const pendingRunsStore_1 = require("./pendingRunsStore");
const deletedRunsStore_1 = require("./deletedRunsStore");
const perfLogger_1 = require("./perfLogger");
// Firestore collection reference
const runsCol = (0, firestore_1.collection)(firebaseConfig_1.db, "runs");
const countersCol = (0, firestore_1.collection)(firebaseConfig_1.db, "counters"); // per-user counters
let allRunsInFlight = null;
let allRunsSessionCache = null;
const runsForUserInFlight = new Map();
const runsForUserSessionCache = new Map();
function devLog(message, meta) {
    if (!__DEV__)
        return;
    try {
        console.log(`[RunService] ${message} ${meta ? JSON.stringify(meta) : ''}`.trim());
    }
    catch {
        console.log(`[RunService] ${message}`);
    }
}
/**
 * Idempotently write a run document at a known id.
 * This is the preferred API for reliable saves (supports retry without duplicates).
 */
async function upsertRun(runId, payload) {
    const ref = (0, firestore_1.doc)(firebaseConfig_1.db, "runs", runId);
    await (0, firestore_1.setDoc)(ref, payload, { merge: true });
    return runId;
}
/**
 * Save a run to Firestore.
 * Returns the created document id.
 */
async function saveRun(run) {
    const createdAt = run.createdAt ?? Date.now();
    let seq = undefined;
    // Allocate a per-user sequential number using a transaction
    if (run.userId) {
        try {
            const counterRef = (0, firestore_1.doc)(countersCol, `runs_${run.userId}`);
            await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                const snap = await tx.get(counterRef);
                const current = (snap.exists() ? snap.data().value : 0) || 0;
                const next = current + 1;
                tx.set(counterRef, { value: next }, { merge: true });
                seq = next;
            });
        }
        catch (e) {
            // Never let an optional counter write block saving the actual run.
            console.log('Failed to allocate run seq counter; saving run without seq', e);
            seq = undefined;
        }
    }
    const payload = {
        ...run,
        createdAt,
        seq,
        mode: run.mode || run.scope || 'personal',
        scope: run.scope || run.mode || 'personal',
        groupRunType: run.groupRunType || (run.groupId ? 'official' : undefined),
    };
    const docRef = await (0, firestore_1.addDoc)(runsCol, payload);
    return docRef.id;
}
function parseGroupRunType(value) {
    if (value === 'casual' || value === 'official')
        return value;
    return undefined;
}
function normalizeRunDoc(data, id) {
    const raw = (data && typeof data === 'object' ? data : {});
    const rawMode = raw.mode;
    const mode = rawMode === 'personal' || rawMode === 'group'
        ? rawMode
        : raw.groupId
            ? 'group'
            : raw.userId
                ? 'personal'
                : undefined;
    if (__DEV__ && rawMode !== undefined && rawMode !== 'personal' && rawMode !== 'group') {
        throw new Error(`[RunService] Invalid mode value for run ${id}: ${String(rawMode)}`);
    }
    const groupRunType = parseGroupRunType(raw.groupRunType) ?? (raw.groupId ? 'official' : undefined);
    const base = raw;
    return {
        ...base,
        id,
        mode,
        scope: mode,
        groupRunType,
    };
}
/**
 * Load all runs for a specific user, newest first.
 */
async function loadRunsForUser(userId, force = false) {
    if (!force) {
        const cached = runsForUserSessionCache.get(userId);
        if (cached) {
            devLog('loadRunsForUser session cache hit', { userId, count: cached.length });
            return cached;
        }
    }
    const inflight = runsForUserInFlight.get(userId);
    if (inflight) {
        devLog('loadRunsForUser reuse inFlight', { userId });
        return inflight;
    }
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "RunService",
        phase: "DATA",
        label: "loadRunsForUser",
        meta: { userId },
    });
    // Use a simple equality query and sort on the client to avoid needing a composite index.
    const q = (0, firestore_1.query)(runsCol, (0, firestore_1.where)("userId", "==", userId));
    const promise = (async () => {
        const snap = await (0, firestore_1.getDocs)(q);
        const runs = snap.docs.map((doc) => normalizeRunDoc(doc.data(), doc.id));
        const pending = await pendingRunsStore_1.PendingRunsStore.listRunDocs(userId);
        const deleted = await deletedRunsStore_1.DeletedRunsStore.getSet();
        const merged = [...pending, ...runs];
        // Deduplicate by id (server wins over pending).
        const seen = new Set();
        const deduped = merged.filter((r) => {
            const id = (r.id ?? '').toString();
            if (!id)
                return false;
            if (deleted.has(id))
                return false;
            if (seen.has(id))
                return false;
            seen.add(id);
            return true;
        });
        const sorted = deduped.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        endPerf({ count: sorted.length, bytes: (0, perfLogger_1.perfBytes)(sorted) });
        runsForUserSessionCache.set(userId, sorted);
        return sorted;
    })();
    runsForUserInFlight.set(userId, promise);
    try {
        return await promise;
    }
    finally {
        runsForUserInFlight.delete(userId);
    }
}
/**
 * Load all runs (for leaderboard / global map).
 */
async function loadAllRuns(force = false) {
    if (!force && allRunsSessionCache) {
        devLog('loadAllRuns session cache hit', { count: allRunsSessionCache.length });
        return allRunsSessionCache;
    }
    if (allRunsInFlight) {
        devLog('loadAllRuns reuse inFlight');
        return allRunsInFlight;
    }
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "RunService",
        phase: "DATA",
        label: "loadAllRuns",
    });
    const promise = (async () => {
        const snap = await (0, firestore_1.getDocs)((0, firestore_1.query)(runsCol, (0, firestore_1.orderBy)("createdAt", "desc")));
        const runs = snap.docs.map((doc) => normalizeRunDoc(doc.data(), doc.id));
        endPerf({ count: runs.length, bytes: (0, perfLogger_1.perfBytes)(runs) });
        allRunsSessionCache = runs;
        return runs;
    })();
    allRunsInFlight = promise;
    try {
        return await promise;
    }
    finally {
        allRunsInFlight = null;
    }
}
async function loadAllGroupRuns() {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "RunService",
        phase: "DATA",
        label: "loadAllGroupRuns",
    });
    const snap = await (0, firestore_1.getDocs)((0, firestore_1.query)(runsCol, (0, firestore_1.where)("mode", "==", "group")));
    const runs = snap.docs
        .map((doc) => normalizeRunDoc(doc.data(), doc.id))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    endPerf({ count: runs.length, bytes: (0, perfLogger_1.perfBytes)(runs) });
    return runs;
}
/**
 * Load a single run by id.
 */
async function loadRunById(id) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "RunService",
        phase: "DATA",
        label: "loadRunById",
        meta: { id },
    });
    if (await deletedRunsStore_1.DeletedRunsStore.has(id)) {
        endPerf({ cached: true });
        return null;
    }
    const ref = (0, firestore_1.doc)(firebaseConfig_1.db, "runs", id);
    const snap = await (0, firestore_1.getDoc)(ref);
    if (snap.exists()) {
        const run = normalizeRunDoc(snap.data(), snap.id);
        endPerf({ bytes: (0, perfLogger_1.perfBytes)(run) });
        return run;
    }
    // Fallback for locally queued runs (offline or backend failure).
    const pending = await pendingRunsStore_1.PendingRunsStore.getById(id);
    if (pending?.payload) {
        const run = normalizeRunDoc(pending.payload, id);
        endPerf({ bytes: (0, perfLogger_1.perfBytes)(run) });
        return run;
    }
    endPerf();
    return null;
}
async function deleteRun(runId) {
    // Immediately hide locally (even if backend delete fails).
    await deletedRunsStore_1.DeletedRunsStore.add(runId);
    // If the run is still pending locally, remove it so it doesn't show up / sync later.
    const pending = await pendingRunsStore_1.PendingRunsStore.getById(runId);
    if (pending?.userId) {
        await pendingRunsStore_1.PendingRunsStore.remove(pending.userId, runId).catch(() => { });
    }
    // Best-effort backend delete.
    try {
        const ref = (0, firestore_1.doc)(firebaseConfig_1.db, "runs", runId);
        await (0, firestore_1.deleteDoc)(ref);
    }
    catch (e) {
        console.log('Failed to delete run from backend (kept deleted locally)', e);
    }
}

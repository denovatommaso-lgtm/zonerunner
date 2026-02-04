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
exports.YearlyChallengesService = void 0;
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const yearlyChallenges_1 = require("./yearlyChallenges");
const yearlyChallengesStore_1 = require("./yearlyChallengesStore");
const runService_1 = require("./runService");
const Location = __importStar(require("expo-location"));
const perfLogger_1 = require("./perfLogger");
const geocodeCache = new Map();
const geocodeInFlight = new Map();
function geocodeKeyForRun(run, lat, lng) {
    const roundedLat = Number.isFinite(lat) ? lat.toFixed(4) : '0';
    const roundedLng = Number.isFinite(lng) ? lng.toFixed(4) : '0';
    const ts = run.startedAt ? Date.parse(run.startedAt) : (run.createdAt ?? Date.now());
    const date = new Date(Number.isFinite(ts) ? ts : Date.now());
    const keyMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return `${keyMonth}:${roundedLat},${roundedLng}`;
}
function isRetryable(err) {
    const code = err?.code;
    return ['failed-precondition', 'aborted', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal', 'unknown'].includes(code);
}
exports.YearlyChallengesService = {
    async enrichRunWithRegion(run) {
        if ((run.countryCode && run.countryCode.length) || (run.stateCode && run.stateCode.length) || (run.stateName && run.stateName.length)) {
            return run;
        }
        try {
            const firstValid = Array.isArray(run.route)
                ? run.route.find((p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude))
                : null;
            if (!firstValid) {
                return run;
            }
            const key = geocodeKeyForRun(run, firstValid.latitude, firstValid.longitude);
            const cached = geocodeCache.get(key);
            if (cached) {
                return {
                    ...run,
                    ...cached,
                };
            }
            const inflight = geocodeInFlight.get(key);
            if (inflight) {
                const res = await inflight;
                return {
                    ...run,
                    ...res,
                };
            }
            const endPerf = (0, perfLogger_1.perfStart)({
                screen: 'YearlyChallengesService',
                phase: 'MAP',
                label: 'reverseGeocodeAsync',
            });
            const request = Location.reverseGeocodeAsync({
                latitude: firstValid.latitude,
                longitude: firstValid.longitude,
            });
            geocodeInFlight.set(key, request
                .then((res) => {
                const entry = res?.[0];
                if (!entry)
                    return {};
                return {
                    countryCode: (entry.isoCountryCode ?? run.countryCode)?.toUpperCase(),
                    stateName: run.stateName ?? entry.region ?? entry.subregion ?? undefined,
                    stateCode: run.stateCode ?? entry.subregion ?? entry.region ?? undefined,
                };
            })
                .finally(() => {
                geocodeInFlight.delete(key);
            }));
            const res = await request;
            const entry = res?.[0];
            endPerf({ results: res?.length ?? 0 });
            if (!entry)
                return run;
            const result = {
                ...run,
                countryCode: (entry.isoCountryCode ?? run.countryCode)?.toUpperCase(),
                stateName: run.stateName ?? entry.region ?? entry.subregion ?? undefined,
                stateCode: run.stateCode ?? entry.subregion ?? entry.region ?? undefined,
            };
            geocodeCache.set(key, {
                countryCode: result.countryCode,
                stateName: result.stateName,
                stateCode: result.stateCode,
            });
            return result;
        }
        catch {
            return run;
        }
    },
    async ensureCurrentYear(userId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'YearlyChallengesService',
            phase: 'DATA',
            label: 'ensureCurrentYear',
            meta: { userId },
        });
        const ref = (0, yearlyChallengesStore_1.yearlyChallengesDocRef)(userId);
        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                    const snap = await tx.get(ref);
                    const existing = snap.exists() ? snap.data() : (0, yearlyChallenges_1.initYearlyChallengesState)(new Date());
                    const next = (0, yearlyChallenges_1.ensureYearRollover)(existing, new Date());
                    if (!snap.exists() || next.lastYearKey !== existing.lastYearKey) {
                        tx.set(ref, next, { merge: false });
                    }
                });
                // Best-effort: reconcile past runs once to ensure historical runs are counted.
                void exports.YearlyChallengesService.reconcileFromRuns(userId).catch(() => { });
                endPerf();
                return;
            }
            catch (e) {
                if (attempt < maxRetries && isRetryable(e)) {
                    await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }
                throw e;
            }
        }
    },
    async ingestRun(params) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'YearlyChallengesService',
            phase: 'DATA',
            label: 'ingestRun',
            meta: { userId: params.userId, runId: params.runId },
        });
        const { userId, runId } = params;
        const run = await exports.YearlyChallengesService.enrichRunWithRegion(params.run);
        const ref = (0, yearlyChallengesStore_1.yearlyChallengesDocRef)(userId);
        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
                    const snap = await tx.get(ref);
                    const base = snap.exists() ? snap.data() : (0, yearlyChallenges_1.initYearlyChallengesState)(new Date());
                    const rolled = (0, yearlyChallenges_1.ensureYearRollover)(base, new Date());
                    const { nextState } = (0, yearlyChallenges_1.applyRunToYearlyChallenges)({ state: rolled, runId, run });
                    tx.set(ref, nextState, { merge: false });
                });
                endPerf();
                return;
            }
            catch (e) {
                if (attempt < maxRetries && isRetryable(e)) {
                    await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }
                throw e;
            }
        }
    },
    // Rebuild the yearly challenges state from all runs (useful if past runs were missed).
    async reconcileFromRuns(userId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'YearlyChallengesService',
            phase: 'DATA',
            label: 'reconcileFromRuns',
            meta: { userId },
        });
        if (__DEV__) {
            console.log(`[RUNS_CALLSITE] file=lib/yearlyChallengesService.ts fn=reconcileFromRuns reason=yearlyReconcile ts=${Date.now()}`);
        }
        const runsRaw = await (0, runService_1.loadRunsForUser)(userId);
        const runs = await Promise.all(runsRaw.map((r) => exports.YearlyChallengesService.enrichRunWithRegion(r)));
        const ref = (0, yearlyChallengesStore_1.yearlyChallengesDocRef)(userId);
        let nextState = (0, yearlyChallenges_1.initYearlyChallengesState)(new Date());
        // Process runs oldest to newest for deterministic milestones
        const ordered = [...runs].sort((a, b) => {
            const aTs = Number.isFinite(Date.parse(a.startedAt ?? '')) ? Date.parse(a.startedAt ?? '') : (a.createdAt ?? 0);
            const bTs = Number.isFinite(Date.parse(b.startedAt ?? '')) ? Date.parse(b.startedAt ?? '') : (b.createdAt ?? 0);
            return aTs - bTs;
        });
        for (const run of ordered) {
            const runId = run.id ?? `${run.userId}-${run.startedAt}-${Math.random().toString(16).slice(2, 8)}`;
            const res = (0, yearlyChallenges_1.applyRunToYearlyChallenges)({ state: nextState, runId, run });
            nextState = res.nextState;
        }
        await (0, firestore_1.runTransaction)(firebaseConfig_1.db, async (tx) => {
            tx.set(ref, nextState, { merge: false });
        });
        endPerf({ runs: runs.length, bytes: (0, perfLogger_1.perfBytes)(nextState) });
        return nextState;
    },
};

import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { RunDoc } from './runService';
import {
  applyRunToYearlyChallenges,
  ensureYearRollover,
  initYearlyChallengesState,
  type YearlyChallengesState,
} from './yearlyChallenges';
import { yearlyChallengesDocRef } from './yearlyChallengesStore';
import { loadRunsForUser } from './runService';
import * as Location from 'expo-location';
import { perfBytes, perfStart } from './perfLogger';

type GeocodeKey = string;
type GeocodeResult = {
  countryCode?: string;
  stateName?: string;
  stateCode?: string;
};

const geocodeCache = new Map<GeocodeKey, GeocodeResult>();
const geocodeInFlight = new Map<GeocodeKey, Promise<GeocodeResult>>();

function geocodeKeyForRun(run: RunDoc, lat: number, lng: number): GeocodeKey {
  const roundedLat = Number.isFinite(lat) ? lat.toFixed(4) : '0';
  const roundedLng = Number.isFinite(lng) ? lng.toFixed(4) : '0';
  const ts = run.startedAt ? Date.parse(run.startedAt) : (run.createdAt ?? Date.now());
  const date = new Date(Number.isFinite(ts) ? ts : Date.now());
  const keyMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${keyMonth}:${roundedLat},${roundedLng}`;
}

function isRetryable(err: unknown) {
  const code = (err as any)?.code;
  return ['failed-precondition', 'aborted', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal', 'unknown'].includes(
    code
  );
}

export const YearlyChallengesService = {
  async enrichRunWithRegion(run: RunDoc): Promise<RunDoc> {
    if ((run.countryCode && run.countryCode.length) || (run.stateCode && run.stateCode.length) || (run.stateName && run.stateName.length)) {
      return run;
    }
    try {
      const firstValid = Array.isArray(run.route)
        ? (run.route.find((p: any) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)) as any)
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
      const endPerf = perfStart({
        screen: 'YearlyChallengesService',
        phase: 'MAP',
        label: 'reverseGeocodeAsync',
      });
      const request = Location.reverseGeocodeAsync({
        latitude: firstValid.latitude,
        longitude: firstValid.longitude,
      });
      geocodeInFlight.set(
        key,
        request
          .then((res) => {
            const entry = res?.[0];
            if (!entry) return {};
            return {
              countryCode: (entry.isoCountryCode ?? run.countryCode)?.toUpperCase(),
              stateName: run.stateName ?? entry.region ?? entry.subregion ?? undefined,
              stateCode: run.stateCode ?? entry.subregion ?? entry.region ?? undefined,
            };
          })
          .finally(() => {
            geocodeInFlight.delete(key);
          })
      );
      const res = await request;
      const entry = res?.[0];
      endPerf({ results: res?.length ?? 0 });
      if (!entry) return run;
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
    } catch {
      return run;
    }
  },

  async ensureCurrentYear(userId: string) {
    const endPerf = perfStart({
      screen: 'YearlyChallengesService',
      phase: 'DATA',
      label: 'ensureCurrentYear',
      meta: { userId },
    });
    const ref = yearlyChallengesDocRef(userId);
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const existing = snap.exists() ? ((snap.data() as any) as YearlyChallengesState) : initYearlyChallengesState(new Date());
          const next = ensureYearRollover(existing, new Date());
          if (!snap.exists() || next.lastYearKey !== existing.lastYearKey) {
            tx.set(ref, next, { merge: false });
          }
        });
        // Best-effort: reconcile past runs once to ensure historical runs are counted.
        void YearlyChallengesService.reconcileFromRuns(userId).catch(() => {});
        endPerf();
        return;
      } catch (e) {
        if (attempt < maxRetries && isRetryable(e)) {
          await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }
        throw e;
      }
    }
  },

  async ingestRun(params: { userId: string; runId: string; run: RunDoc }) {
    const endPerf = perfStart({
      screen: 'YearlyChallengesService',
      phase: 'DATA',
      label: 'ingestRun',
      meta: { userId: params.userId, runId: params.runId },
    });
    const { userId, runId } = params;
    const run = await YearlyChallengesService.enrichRunWithRegion(params.run);
    const ref = yearlyChallengesDocRef(userId);
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const base = snap.exists() ? ((snap.data() as any) as YearlyChallengesState) : initYearlyChallengesState(new Date());
          const rolled = ensureYearRollover(base, new Date());
          const { nextState } = applyRunToYearlyChallenges({ state: rolled, runId, run });
          tx.set(ref, nextState, { merge: false });
        });
        endPerf();
        return;
      } catch (e) {
        if (attempt < maxRetries && isRetryable(e)) {
          await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }
        throw e;
      }
    }
  },

  // Rebuild the yearly challenges state from all runs (useful if past runs were missed).
  async reconcileFromRuns(userId: string) {
    const endPerf = perfStart({
      screen: 'YearlyChallengesService',
      phase: 'DATA',
      label: 'reconcileFromRuns',
      meta: { userId },
    });
    if (__DEV__) {
      console.log(`[RUNS_CALLSITE] file=lib/yearlyChallengesService.ts fn=reconcileFromRuns reason=yearlyReconcile ts=${Date.now()}`);
    }
    const runsRaw = await loadRunsForUser(userId);
    const runs = await Promise.all(runsRaw.map((r) => YearlyChallengesService.enrichRunWithRegion(r as RunDoc)));
    const ref = yearlyChallengesDocRef(userId);
    let nextState = initYearlyChallengesState(new Date());
    // Process runs oldest to newest for deterministic milestones
    const ordered = [...runs].sort((a, b) => {
      const aTs = Number.isFinite(Date.parse(a.startedAt ?? '')) ? Date.parse(a.startedAt ?? '') : (a.createdAt ?? 0);
      const bTs = Number.isFinite(Date.parse(b.startedAt ?? '')) ? Date.parse(b.startedAt ?? '') : (b.createdAt ?? 0);
      return aTs - bTs;
    });
    for (const run of ordered) {
      const runId = (run as any).id ?? `${run.userId}-${run.startedAt}-${Math.random().toString(16).slice(2, 8)}`;
      const res = applyRunToYearlyChallenges({ state: nextState, runId, run });
      nextState = res.nextState;
    }
    await runTransaction(db, async (tx) => {
      tx.set(ref, nextState, { merge: false });
    });
    endPerf({ runs: runs.length, bytes: perfBytes(nextState) });
    return nextState;
  },
};

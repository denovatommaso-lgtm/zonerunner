import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { RunDoc } from './runService';
import {
  applyMonthlyEventIncrement,
  applyRankingSnapshotToMonthlyChallenges,
  applyRunToMonthlyChallenges,
  ensureMonthRollover,
  initMonthlyChallengesState,
  monthKeyFromEpochMsLocal,
  type MonthlyChallengesState,
} from './monthlyChallenges';
import { monthlyChallengesDocRef } from './monthlyChallengesStore';
import { loadRunsForUser } from './runService';
import { perfBytes, perfStart } from './perfLogger';
import { logFailure, logStart, logSuccess } from './bootstrapLogger';

function devLog(event: string, data: Record<string, unknown>) {
  if (!__DEV__) return;
  try {
    console.log(`[MonthlyChallenges] ${event} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[MonthlyChallenges] ${event}`, data);
  }
}

type UserDocShape = {
  monthlyChallenges?: MonthlyChallengesState;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getLegacyMonthlyState(userId: string): Promise<MonthlyChallengesState | null> {
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const data = (userSnap.data() as UserDocShape | undefined) ?? {};
    return data.monthlyChallenges ?? null;
  } catch {
    return null;
  }
}

function isRetryableTxnError(err: unknown): boolean {
  const code = (err as any)?.code as string | undefined;
  return (
    code === 'failed-precondition' ||
    code === 'aborted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    code === 'internal' ||
    code === 'unknown'
  );
}

function isPermissionDenied(err: unknown): boolean {
  const code = (err as any)?.code as string | undefined;
  return code === 'permission-denied';
}

export const MonthlyChallengesService = {
  async ensureCurrentMonth(userId: string) {
    const endPerf = perfStart({
      screen: 'MonthlyChallengesService',
      phase: 'DATA',
      label: 'ensureCurrentMonth',
      meta: { userId },
    });
    const tag = `MonthlyChallengesService.ensureCurrentMonth:${userId}`;
    logStart(tag, { userId });
    const stateRef = monthlyChallengesDocRef(userId);
    const userRef = doc(db, 'users', userId);
    const legacy = await getLegacyMonthlyState(userId);
    const maxRetries = 3;
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await runTransaction(db, async (tx) => {
            const stateSnap = await tx.get(stateRef);
            const existing =
              (stateSnap.exists() ? (stateSnap.data() as any as MonthlyChallengesState) : null) ??
              legacy ??
              initMonthlyChallengesState(new Date());
            const next = ensureMonthRollover(existing, new Date());
            if (next.updatedAt !== existing.updatedAt || next.lastMonthKey !== existing.lastMonthKey || !stateSnap.exists()) {
              tx.set(stateRef, next, { merge: false });
            }
          });
          endPerf({ path: 'stateRef' });
          logSuccess(tag, { path: 'stateRef' });
          return;
        } catch (e) {
          if (attempt < maxRetries && isRetryableTxnError(e)) {
            const backoff = 120 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
            await sleep(backoff);
            continue;
          }
          if (!isPermissionDenied(e)) throw e;
          break;
        }
      }

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = (snap.data() as UserDocShape | undefined) ?? {};
        const existing = data.monthlyChallenges ?? initMonthlyChallengesState(new Date());
        const next = ensureMonthRollover(existing, new Date());
        if (next.updatedAt !== existing.updatedAt || next.lastMonthKey !== existing.lastMonthKey) {
          tx.set(userRef, { monthlyChallenges: next }, { merge: true });
        }
      });
      endPerf({ path: 'userRef' });
      logSuccess(tag, { path: 'userRef' });
    } catch (e) {
      logFailure(tag, e, { userId });
      if (!isPermissionDenied(e)) throw e;
      // If both paths are blocked we surface the original error.
      throw e;
    }
  },

  async ingestRun(params: { userId: string; runId: string; run: RunDoc }) {
    const endPerf = perfStart({
      screen: 'MonthlyChallengesService',
      phase: 'DATA',
      label: 'ingestRun',
      meta: { userId: params.userId, runId: params.runId },
    });
    const tag = `MonthlyChallengesService.ingestRun:${params.userId}:${params.runId}`;
    logStart(tag, { userId: params.userId, runId: params.runId });
    const { userId, runId, run } = params;
    const stateRef = monthlyChallengesDocRef(userId);
    const userRef = doc(db, 'users', userId);
    const legacy = await getLegacyMonthlyState(userId);
    const maxRetries = 3;
    let awardedCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await runTransaction(db, async (tx) => {
          const stateSnap = await tx.get(stateRef);
          const base =
            (stateSnap.exists() ? (stateSnap.data() as any as MonthlyChallengesState) : null) ??
            legacy ??
            initMonthlyChallengesState(new Date());
          const rolled = ensureMonthRollover(base, new Date());
          const { nextState, awardedMilestones } = applyRunToMonthlyChallenges({
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
        logSuccess(tag, { awardedCount });
        return;
      } catch (e) {
        if (isPermissionDenied(e)) break;
        if (attempt < maxRetries && isRetryableTxnError(e)) {
          const backoff = 120 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
          await sleep(backoff);
          continue;
        }
        logFailure(tag, e, { userId, runId });
        throw e;
      }
    }

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const data = (snap.data() as UserDocShape | undefined) ?? {};
      const base = data.monthlyChallenges ?? legacy ?? initMonthlyChallengesState(new Date());
      const rolled = ensureMonthRollover(base, new Date());
      const { nextState, awardedMilestones } = applyRunToMonthlyChallenges({
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
    logSuccess(tag, { awardedCount, fallback: true });
  },

  async ingestFriendAdded(params: { userId: string; eventId: string; acceptedAt: number }) {
    const endPerf = perfStart({
      screen: 'MonthlyChallengesService',
      phase: 'DATA',
      label: 'ingestFriendAdded',
      meta: { userId: params.userId, eventId: params.eventId },
    });
    const { userId, eventId, acceptedAt } = params;
    const stateRef = monthlyChallengesDocRef(userId);
    const userRef = doc(db, 'users', userId);
    const mk = monthKeyFromEpochMsLocal(acceptedAt);
    const legacy = await getLegacyMonthlyState(userId);
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await runTransaction(db, async (tx) => {
          const stateSnap = await tx.get(stateRef);
          const base =
            (stateSnap.exists() ? (stateSnap.data() as any as MonthlyChallengesState) : null) ??
            legacy ??
            initMonthlyChallengesState(new Date());
          const rolled = ensureMonthRollover(base, new Date());
          const { nextState, awardedMilestones } = applyMonthlyEventIncrement({
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
      } catch (e) {
        if (isPermissionDenied(e)) break;
        if (attempt < maxRetries && isRetryableTxnError(e)) {
          const backoff = 120 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
          await sleep(backoff);
          continue;
        }
        throw e;
      }
    }

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const data = (snap.data() as UserDocShape | undefined) ?? {};
      const base = data.monthlyChallenges ?? legacy ?? initMonthlyChallengesState(new Date());
      const rolled = ensureMonthRollover(base, new Date());
      const { nextState, awardedMilestones } = applyMonthlyEventIncrement({
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
  async ingestRankingSnapshot(params: { userId: string; at: number; rank: number; scope: 'state' | 'country' | 'world' }) {
    const endPerf = perfStart({
      screen: 'MonthlyChallengesService',
      phase: 'DATA',
      label: 'ingestRankingSnapshot',
      meta: { userId: params.userId, rank: params.rank, scope: params.scope },
    });
    const tag = `MonthlyChallengesService.ingestRankingSnapshot:${params.userId}:${params.scope}:${params.rank}`;
    logStart(tag, { userId: params.userId, rank: params.rank, scope: params.scope });
    const { userId, at, scope } = params;
    const normalizedRank = Number.isFinite(params.rank) ? Math.floor(params.rank) : NaN;
    if (!Number.isFinite(normalizedRank) || normalizedRank <= 0) {
      endPerf({ skipped: 'invalid_rank' });
      logSuccess(tag, { skipped: 'invalid_rank' });
      return 'skipped_invalid_rank' as const;
    }
    const stateRef = monthlyChallengesDocRef(userId);
    const userRef = doc(db, 'users', userId);
    const legacy = await getLegacyMonthlyState(userId);

    // Ranking updates can race with other monthly-challenge writes (run saves, month rollover, etc).
    // Make this more robust with a small retry loop for transaction contention errors.
    const maxRetries = 5;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { awarded } = await runTransaction(db, async (tx) => {
          const stateSnap = await tx.get(stateRef);
          const base = (stateSnap.exists() ? (stateSnap.data() as any as MonthlyChallengesState) : null) ?? legacy ?? initMonthlyChallengesState(new Date());
          const rolled = ensureMonthRollover(base, new Date());
          const { nextState, awardedMilestones } = applyRankingSnapshotToMonthlyChallenges({
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
        logSuccess(tag, { awardedCount: (awarded ?? []).length });
        return;
      } catch (e) {
        lastError = e;
        if (isPermissionDenied(e)) {
          // Fallback to legacy storage (users/{uid}.monthlyChallenges) if needed.
          const { awarded } = await runTransaction(db, async (tx) => {
            const snap = await tx.get(userRef);
            const data = (snap.data() as UserDocShape | undefined) ?? {};
            const base = data.monthlyChallenges ?? legacy ?? initMonthlyChallengesState(new Date());
            const rolled = ensureMonthRollover(base, new Date());
            const { nextState, awardedMilestones } = applyRankingSnapshotToMonthlyChallenges({
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
          logSuccess(tag, { awardedCount: (awarded ?? []).length, fallback: true });
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
      const { awarded } = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = (snap.data() as UserDocShape | undefined) ?? {};
        const base = data.monthlyChallenges ?? legacy ?? initMonthlyChallengesState(new Date());
        const rolled = ensureMonthRollover(base, new Date());
      const { nextState, awardedMilestones } = applyRankingSnapshotToMonthlyChallenges({
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
      logSuccess(tag, { awardedCount: (awarded ?? []).length, fallback: true });
    } catch (fallbackErr) {
      logFailure(tag, fallbackErr, { userId, rank: normalizedRank, scope });
      // Surface the original error if fallback also fails.
      throw lastError ?? fallbackErr;
    }
  },

  // Backfill-safe: can be used if you computed a new state client-side and want to persist it.
  async saveState(userId: string, state: MonthlyChallengesState) {
    const endPerf = perfStart({
      screen: 'MonthlyChallengesService',
      phase: 'DATA',
      label: 'saveState',
      meta: { userId },
    });
    const stateRef = monthlyChallengesDocRef(userId);
    await setDoc(stateRef, state, { merge: false });
    endPerf({ bytes: perfBytes(state) });
  },

  // Recompute monthly challenges from all runs (useful when older runs were not applied).
  async reconcileFromRuns(userId: string) {
    const endPerf = perfStart({
      screen: 'MonthlyChallengesService',
      phase: 'DATA',
      label: 'reconcileFromRuns',
      meta: { userId },
    });
    if (__DEV__) {
      console.log(`[RUNS_CALLSITE] file=lib/monthlyChallengesService.ts fn=reconcileFromRuns reason=monthlyReconcile ts=${Date.now()}`);
    }
    const runs = await loadRunsForUser(userId);
    const ordered = [...runs].sort((a, b) => Date.parse(a.startedAt ?? '') - Date.parse(b.startedAt ?? ''));
    let state = initMonthlyChallengesState(new Date());
    for (const run of ordered) {
      const runId = (run as any).id ?? `${run.userId}-${run.startedAt}-${Math.random().toString(16).slice(2, 8)}`;
      const { nextState } = applyRunToMonthlyChallenges({
        state,
        userId,
        runId,
        run,
      });
      state = nextState;
    }
    const stateRef = monthlyChallengesDocRef(userId);
    await setDoc(stateRef, state, { merge: false });
    endPerf({ runs: runs.length, bytes: perfBytes(state) });
    return state;
  },
};

import * as Crypto from 'expo-crypto';
import type { FirebaseError } from 'firebase/app';
import { upsertRun } from './runService';
import type { RunDoc } from './runService';
import { MonthlyChallengesService } from './monthlyChallengesService';
import { YearlyChallengesService } from './yearlyChallengesService';
import { PendingRunsStore } from './pendingRunsStore';
import { DeletedRunsStore } from './deletedRunsStore';
import { checkAndRecordMainRanking } from './rankingTracker';
import { upsertPrefetchedTerritoryRun } from './territoryPrefetch';
import { invalidateTerritoryState, invalidatePersonalWithPending } from './territoryState';
import { enqueueEvent } from './offlineQueue';

export type RunSaveResult =
  | { status: 'saved'; runId: string }
  | { status: 'queued'; runId: string }
  | { status: 'auth_required'; message: string }
  | { status: 'failed'; runId: string; message: string; errorCode?: string };

type SaveOptions = {
  runId?: string;
  maxRetries?: number;
  baseDelayMs?: number;
};

function devLog(event: string, data: Record<string, unknown>) {
  if (!__DEV__) return;
  try {
    // Keep it 1-line JSON for easy copy/paste from device logs.
    console.log(`[RunSave] ${event} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[RunSave] ${event}`, data);
  }
}

function asFirebaseError(err: unknown): FirebaseError | null {
  if (!err || typeof err !== 'object') return null;
  const anyErr = err as any;
  if (typeof anyErr.code === 'string' && typeof anyErr.message === 'string') {
    return anyErr as FirebaseError;
  }
  return null;
}

function isTransientFirestoreError(err: unknown): boolean {
  const fe = asFirebaseError(err);
  const code = fe?.code ?? '';
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    code === 'aborted' ||
    code === 'internal' ||
    code === 'unknown'
  );
}

function isAuthError(err: unknown): boolean {
  const fe = asFirebaseError(err);
  const code = fe?.code ?? '';
  return code === 'unauthenticated' || code === 'auth/unauthenticated';
}

function isPermissionError(err: unknown): boolean {
  const fe = asFirebaseError(err);
  const code = fe?.code ?? '';
  return code === 'permission-denied';
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pending run storage is centralized in `lib/pendingRunsStore.ts`.

async function attemptUpsertWithRetry(payload: RunDoc, runId: string, options?: SaveOptions) {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 350;

  let attempt = 0;
  // attempt count here is "retries after first try"
  // total tries = 1 + maxRetries
  for (;;) {
    try {
      attempt += 1;
      await upsertRun(runId, payload);
      return { ok: true as const, attempts: attempt };
    } catch (err) {
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
        return { ok: false as const, attempts: attempt, error: err };
      }

      // Retry only transient/network-ish failures, up to maxRetries.
      if (!isTransientFirestoreError(err) || attempt > 1 + maxRetries) {
        return { ok: false as const, attempts: attempt, error: err };
      }

      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 120);
      await sleep(backoff + jitter);
    }
  }
}

export const RunSaveService = {
  createRunId(): string {
    // stable id for idempotent upserts + offline queue
    return Crypto.randomUUID();
  },

  async saveRun(userId: string | undefined, run: Omit<RunDoc, 'userId'>, options?: SaveOptions): Promise<RunSaveResult> {
    if (!userId) {
      return {
        status: 'auth_required',
        message: `You're not signed in. Sign in to save runs.`,
      };
    }

    const runId = options?.runId ?? RunSaveService.createRunId();
    const payload: RunDoc = {
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
      if ((cleanedPayload as any)[k] === undefined) {
        delete (cleanedPayload as any)[k];
      }
    });

    const isWebOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isWebOffline) {
      await PendingRunsStore.upsert(userId, {
        userId,
        runId,
        payload: cleanedPayload,
        createdAt: Date.now(),
        attempts: 0,
        lastError: { code: 'offline', message: 'offline' },
      });
      await enqueueEvent({
        id: runId,
        type: 'run.save',
        createdAt: Date.now(),
        payload: { userId },
      });
      upsertPrefetchedTerritoryRun({ id: runId, ...payload, pending: true });
      if (payload.groupId) {
        invalidateTerritoryState({ mode: 'group', groupId: payload.groupId });
      } else {
        await invalidatePersonalWithPending(userId);
      }
      return { status: 'queued', runId };
    }

    const res = await attemptUpsertWithRetry(cleanedPayload, runId, options);
    if (res.ok) {
      devLog('save_success', { runId, attempts: res.attempts });
      // If it previously queued, remove it.
      await PendingRunsStore.remove(userId, runId).catch(() => {});
      upsertPrefetchedTerritoryRun({ id: runId, ...payload });
      // Territory changed; invalidate canonical state.
      if (payload.groupId) {
        invalidateTerritoryState({ mode: 'group', groupId: payload.groupId });
      } else {
        invalidateTerritoryState({ mode: 'personal' });
      }
      // Best-effort challenge ingest so stars/xp are up to date immediately.
      void (async () => {
        try {
          await MonthlyChallengesService.ingestRun({ userId, runId, run: payload });
          await YearlyChallengesService.ingestRun({ userId, runId, run: payload });
        } catch (e) {
          devLog('challenge_ingest_failed', {
            runId,
            message: (e as any)?.message ?? String(e),
          });
        }
      })();
      return { status: 'saved', runId };
    }

    const fe = asFirebaseError((res as any).error);
    const code = fe?.code;
    const message = fe?.message ?? 'Unknown error';

    if (isAuthError((res as any).error)) {
      return {
        status: 'auth_required',
        message: `You're not signed in. Sign in to save runs.`,
      };
    }

    // Hard requirement: a run must ALWAYS be saved locally if backend save fails for any reason.
    // Queue locally (even for permission-denied) and retry later; do not block user flow.
    try {
      await PendingRunsStore.upsert(userId, {
        userId,
        runId,
        payload,
        createdAt: Date.now(),
        attempts: res.attempts,
        lastError: { code, message },
      });
      devLog('save_queued', { runId, code });
      // Update map cache so the user's territory reflects the run immediately, even if offline/queued.
      upsertPrefetchedTerritoryRun({ id: runId, ...payload, pending: true });
      // Invalidate so pending territory is recomputed on next read.
      if (payload.groupId) {
        invalidateTerritoryState({ mode: 'group', groupId: payload.groupId });
      } else {
        await invalidatePersonalWithPending(userId);
      }
      return { status: 'queued', runId };
    } catch (queueErr) {
      devLog('queue_failed', { runId, message: (queueErr as any)?.message ?? String(queueErr) });
      return {
        status: 'failed',
        runId,
        errorCode: code,
        message: message,
      };
    }
  },

  async syncPendingRuns(userId: string, options?: SaveOptions): Promise<{ synced: number; remaining: number }> {
    const pending = await PendingRunsStore.list(userId);
    if (!pending.length) return { synced: 0, remaining: 0 };
    const deleted = await DeletedRunsStore.getSet();

    devLog('sync_start', { userId, pending: pending.length });

    let synced = 0;
    for (const item of pending) {
      if (deleted.has(item.runId)) {
        await PendingRunsStore.remove(userId, item.runId).catch(() => {});
        continue;
      }
      const res = await attemptUpsertWithRetry(item.payload, item.runId, options);
      if (res.ok) {
        synced += 1;
        await PendingRunsStore.remove(userId, item.runId);
          try {
            await MonthlyChallengesService.ingestRun({
              userId,
              runId: item.runId,
              run: item.payload,
            });
            await YearlyChallengesService.ingestRun({
              userId,
              runId: item.runId,
              run: item.payload,
            });
          } catch (e) {
            devLog('challenge_ingest_failed', {
              runId: item.runId,
              message: (e as any)?.message ?? String(e),
            });
        }
        continue;
      }

      const fe = asFirebaseError((res as any).error);
      const code = fe?.code;
      const message = fe?.message ?? 'Unknown error';
      const updated = {
        ...item,
        attempts: (item.attempts ?? 0) + 1,
        lastError: { code, message },
      };

      // If this isn't a transient error anymore (e.g. permission denied),
      // stop retrying automatically and leave it in the queue for manual handling.
      await PendingRunsStore.upsert(userId, updated as any);
    }

    const remaining = (await PendingRunsStore.list(userId)).length;
    devLog('sync_done', { userId, synced, remaining });
    if (synced > 0) {
      // Best-effort: rankings can change after runs sync; never block sync on this.
      void checkAndRecordMainRanking({ userId, reason: 'after_run_save' });
    }
    return { synced, remaining };
  },
};

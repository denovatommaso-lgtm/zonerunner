import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyRunToYearlyChallenges,
  buildYearlyChallengeViews,
  ensureYearRollover,
  initYearlyChallengesState,
} from '../lib/yearlyChallenges';
import { YearlyChallengesService } from '../lib/yearlyChallengesService';
import { loadYearlyChallengesState, subscribeYearlyChallengesState } from '../lib/yearlyChallengesStore';
import { loadRunsForUser } from '../lib/runService';
import { perfLog, perfStart } from '../lib/perfLogger';
import { logFailure, logStart, logSuccess } from '../lib/bootstrapLogger';

export function useYearlyChallenges(userId: string | undefined) {
  const [state, setState] = useState(initYearlyChallengesState(new Date()));
  const reconcileGuardRef = React.useRef<{ ranAt: number | null }>({ ranAt: null });
  const reconcileInFlight = React.useRef(false);
  const cacheKey = userId ? `yearlyChallenges:cache:${userId}` : null;

  useEffect(() => {
    if (!userId) return;
    const endEnsure = perfStart({
      screen: "YearlyChallenges",
      phase: "DATA",
      label: "ensureCurrentYear",
    });
    const ensureTag = `YearlyChallenges.ensureCurrentYear:${userId}`;
    logStart(ensureTag, { userId });
    void YearlyChallengesService.ensureCurrentYear(userId)
      .then(() => {
        endEnsure({ ok: true });
        logSuccess(ensureTag, { ok: true });
      })
      .catch((e) => {
        endEnsure({ ok: false });
        logFailure(ensureTag, e, { ok: false });
      });
    // Initial fetch (best-effort) plus a live subscription so UI reflects new runs immediately.
    const unsub = subscribeYearlyChallengesState(
      userId,
      (s) => {
        setState(s ?? initYearlyChallengesState(new Date()));
      },
      () => {}
    );
    void loadYearlyChallengesState(userId)
      .then((s) => {
        if (s) setState(s);
      })
      .catch(() => {});
    return () => {
      unsub?.();
    };
  }, [userId]);

  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!cancelled && parsed) {
          setState(parsed);
          perfLog({
            screen: "YearlyChallenges",
            phase: "DATA",
            label: "cache-hydrated",
            durationMs: 0,
          });
        }
      } catch {
        // ignore cache errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const rolled = useMemo(() => ensureYearRollover(state, new Date()), [state]);
  const views = useMemo(() => buildYearlyChallengeViews(rolled, new Date()), [rolled]);

  useEffect(() => {
    if (!cacheKey) return;
    AsyncStorage.setItem(cacheKey, JSON.stringify(rolled)).catch(() => {});
    perfLog({
      screen: "YearlyChallenges",
      phase: "DATA",
      label: "cache-write",
      durationMs: 0,
    });
  }, [cacheKey, rolled]);

  useEffect(() => {
    if (!userId) return;
    const now = Date.now();
    const guard = reconcileGuardRef.current;
    const countries = views.find((v) => v.id === 'countries');
    const states = views.find((v) => v.id === 'states');
    const missingEither =
      ((countries?.progressValue ?? 0) === 0 && (countries?.starsEarned ?? 0) === 0) ||
      ((states?.progressValue ?? 0) === 0 && (states?.starsEarned ?? 0) === 0);
    // Reconcile immediately if data is missing; otherwise, throttle to every 6h.
    const intervalMs = missingEither ? 0 : 6 * 60 * 60 * 1000;
    const stale = !guard.ranAt || now - guard.ranAt > intervalMs;
    if (!stale && !missingEither) return;
    guard.ranAt = now;
    const run = async () => {
      if (reconcileInFlight.current) return;
      reconcileInFlight.current = true;
      const endReconcile = perfStart({
        screen: "YearlyChallenges",
        phase: "DATA",
        label: "reconcileFromRuns",
      });
      const reconcileTag = `YearlyChallenges.reconcileFromRuns:${userId}`;
      logStart(reconcileTag, { userId });
      try {
        const next = await YearlyChallengesService.reconcileFromRuns(userId);
        if (next) setState(next);
        endReconcile({ ok: true });
        logSuccess(reconcileTag, { ok: true });
      } catch {
        // Fallback: compute locally and set state so UI is correct even if backend write fails.
        try {
          if (__DEV__) {
            console.log(`[RUNS_CALLSITE] file=hooks/useYearlyChallenges.ts fn=reconcile fallback reason=localRebuild ts=${Date.now()}`);
          }
          const runs = await loadRunsForUser(userId);
          let nextState = initYearlyChallengesState(new Date());
          const ordered = [...runs].sort((a, b) => {
            const aTs = Number.isFinite(Date.parse(a.startedAt ?? '')) ? Date.parse(a.startedAt ?? '') : (a.createdAt ?? 0);
            const bTs = Number.isFinite(Date.parse(b.startedAt ?? '')) ? Date.parse(b.startedAt ?? '') : (b.createdAt ?? 0);
            return aTs - bTs;
          });
          for (const run of ordered) {
            const runId = (run as any).id ?? `${run.userId}-${run.startedAt}-${Math.random().toString(16).slice(2, 8)}`;
            const res = applyRunToYearlyChallenges({ state: nextState, runId, run: run as any });
            nextState = res.nextState;
          }
          setState(nextState);
          endReconcile({ ok: true, fallback: true });
          logSuccess(reconcileTag, { ok: true, fallback: true });
        } catch {
          // ignore
          endReconcile({ ok: false });
          logFailure(reconcileTag, new Error('YearlyChallenges reconcile failed'), { ok: false });
        }
      } finally {
        reconcileInFlight.current = false;
      }
    };
    void run();
  }, [userId, views]);

  return {
    yearKey: rolled.lastYearKey,
    views,
    totalChallengeXp: rolled.totalChallengeXp ?? 0,
    state: rolled,
  };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile } from '../lib/authService';
import { buildMonthlyChallengeViews, ensureMonthRollover, initMonthlyChallengesState } from '../lib/monthlyChallenges';
import { MonthlyChallengesService } from '../lib/monthlyChallengesService';
import { loadMonthlyChallengesState, subscribeMonthlyChallengesState } from '../lib/monthlyChallengesStore';
import { perfLog, perfStart } from '../lib/perfLogger';
import { logFailure, logStart, logSuccess } from '../lib/bootstrapLogger';

export function useMonthlyChallenges(userId: string | undefined, profile: UserProfile | null) {
  const [state, setState] = useState(profile?.monthlyChallenges ?? initMonthlyChallengesState(new Date()));
  const reconciledRef = useRef(false);
  const cacheKey = userId ? `monthlyChallenges:cache:${userId}` : null;

  useEffect(() => {
    setState(profile?.monthlyChallenges ?? initMonthlyChallengesState(new Date()));
  }, [profile?.monthlyChallenges]);

  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!cancelled && parsed) {
          const parsedUpdatedAt = typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 0;
          const currentUpdatedAt = typeof state?.updatedAt === 'number' ? state.updatedAt : 0;
          if (parsedUpdatedAt >= currentUpdatedAt) {
            setState(parsed);
          }
          perfLog({
            screen: "MonthlyChallenges",
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
  }, [cacheKey, state?.updatedAt]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    if (!userId) return;
    // Live subscription so medals and XP update promptly.
    unsub = subscribeMonthlyChallengesState(
      userId,
      (s) => {
        if (s) setState(s);
      },
      () => {}
    );
    // One-time load in case subscription is slow.
    void loadMonthlyChallengesState(userId)
      .then((s) => {
        if (s) setState(s);
      })
      .catch(() => {});
    return () => {
      unsub?.();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // Ensure month rollover happens promptly when entering the app/screen.
    // This is intentionally best-effort (no UI blocking).
    const endEnsure = perfStart({
      screen: "MonthlyChallenges",
      phase: "DATA",
      label: "ensureCurrentMonth",
    });
    const ensureTag = `MonthlyChallenges.ensureCurrentMonth:${userId}`;
    logStart(ensureTag, { userId });
    void MonthlyChallengesService.ensureCurrentMonth(userId)
      .then(() => {
        endEnsure({ ok: true });
        logSuccess(ensureTag, { ok: true });
      })
      .catch((e) => {
        if (__DEV__) console.log('Failed to ensure monthly challenge month', e);
        endEnsure({ ok: false });
        logFailure(ensureTag, e, { ok: false });
      });
    // Always reconcile once on first load to backfill any missed runs.
    if (!reconciledRef.current) {
      reconciledRef.current = true;
      const endReconcile = perfStart({
        screen: "MonthlyChallenges",
        phase: "DATA",
        label: "reconcileFromRuns",
      });
      const reconcileTag = `MonthlyChallenges.reconcileFromRuns:${userId}`;
      logStart(reconcileTag, { userId });
      void MonthlyChallengesService.reconcileFromRuns(userId)
        .then(() => {
          endReconcile({ ok: true });
          logSuccess(reconcileTag, { ok: true });
        })
        .catch((e) => {
          if (__DEV__) console.log('Failed to reconcile monthly challenges', e);
          endReconcile({ ok: false });
          logFailure(reconcileTag, e, { ok: false });
        });
    }
  }, [userId]);

  const rolled = useMemo(() => ensureMonthRollover(state, new Date()), [state]);
  const views = useMemo(() => buildMonthlyChallengeViews(rolled, new Date()), [rolled]);

  useEffect(() => {
    if (!cacheKey) return;
    AsyncStorage.setItem(cacheKey, JSON.stringify(rolled)).catch(() => {});
    perfLog({
      screen: "MonthlyChallenges",
      phase: "DATA",
      label: "cache-write",
      durationMs: 0,
    });
  }, [cacheKey, rolled]);

  return {
    monthKey: rolled.lastMonthKey,
    views,
    totalChallengeXp: rolled.totalChallengeXp ?? 0,
    state: rolled,
  };
}

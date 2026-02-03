import { User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { RunDoc, loadAllRuns, loadRunsForUser } from '../lib/runService';
import { computeCurrentStreakDays } from '../lib/utils/streak';
import { defaultXPConfig, levelFromTotalXp, xpFromSources } from '../lib/xpProgression';
import type { UserProfile } from '../lib/authService';
import { updateUserProfile } from '../lib/authService';
import { useRef } from 'react';
import { loadMonthlyChallengesState, subscribeMonthlyChallengesState } from '../lib/monthlyChallengesStore';
import { computeCurrentAreasFromRuns } from '../lib/utils/currentAreas';

type Stats = {
  totalRuns: number;
  totalDistanceMeters: number;
  totalDistanceKm: number;
  totalTimeSeconds: number;
  areaCapturedKm2: number;
  totalCaloriesKcal: number;
};

type LevelInfo = ReturnType<typeof levelFromTotalXp> & { totalXp: number };

export function useProfileRuns(
  currentUser: User | null,
  userProfile: UserProfile | null,
  groups: { id: string }[]
) {
  const [runs, setRuns] = useState<RunDoc[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [challengeXpFallback, setChallengeXpFallback] = useState<number | null>(null);
  const [currentAreaKm2, setCurrentAreaKm2] = useState<number>(0);
  const [challengeXpLive, setChallengeXpLive] = useState<number | null>(null);
  const lastPersistedLifetimeXpRef = useRef<number>(0);

  const loadRuns = useCallback(async () => {
    try {
      setLoadingRuns(true);
      if (!currentUser?.uid) {
        setRuns([]);
        return;
      }
      if (__DEV__) {
        console.log(`[RUNS_CALLSITE] file=hooks/useProfileRuns.ts fn=loadRuns reason=profileRuns ts=${Date.now()}`);
      }
      const fetched = await loadRunsForUser(currentUser.uid);
      setRuns(fetched as any);
    } catch (error) {
      console.log('Failed to load runs for profile screen', error);
    } finally {
      setLoadingRuns(false);
    }
  }, [currentUser?.uid]);

  // Compute current owned area from territory polygons (not summed run area).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      if (!currentUser?.uid) {
        setCurrentAreaKm2(0);
        return;
      }
      try {
        const refresh = async () => {
          if (__DEV__) {
            console.log(`[RUNS_CALLSITE] file=hooks/useProfileRuns.ts fn=refresh reason=profileAreaRefresh ts=${Date.now()}`);
          }
          const runs = await loadAllRuns();
          const areaMap = computeCurrentAreasFromRuns(runs as any[], { mode: 'personal', activeGroupId: null });
          if (!cancelled) setCurrentAreaKm2(areaMap.get(currentUser.uid) ?? 0);
        };
        await refresh();
        timer = setInterval(refresh, 45_000); // keep reasonably fresh
      } catch (e) {
        if (!cancelled) setCurrentAreaKm2(0);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [currentUser?.uid]);

  // If the profile payload doesn't include monthly challenges (e.g., subdoc not yet loaded),
  // fetch it once so challenge XP is reflected in level calculations.
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      if (!currentUser?.uid) {
        setChallengeXpFallback(null);
        setChallengeXpLive(null);
        return;
      }
      if (userProfile?.monthlyChallenges?.totalChallengeXp != null) {
        setChallengeXpFallback(null);
        setChallengeXpLive(userProfile.monthlyChallenges.totalChallengeXp);
        return;
      }
      // Live subscription so XP updates quickly after a run save.
      unsub = subscribeMonthlyChallengesState(
        currentUser.uid,
        (s) => {
          if (cancelled) return;
          if (s?.totalChallengeXp != null) {
            setChallengeXpLive(s.totalChallengeXp);
          }
        },
        () => {}
      );
      try {
        const state = await loadMonthlyChallengesState(currentUser.uid);
        if (!cancelled && state?.totalChallengeXp != null) {
          setChallengeXpFallback(state.totalChallengeXp);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [currentUser?.uid, userProfile?.monthlyChallenges?.totalChallengeXp]);

  const stats: Stats = useMemo(() => {
    const totalRuns = runs.length;
    const totalDistanceMeters = runs.reduce((sum, r) => sum + r.distance, 0);
    const totalTimeSeconds = runs.reduce((sum, r) => sum + r.elapsedSeconds, 0);
    const totalDistanceKm = totalDistanceMeters / 1000;
    const weight = userProfile?.weightKg ?? 70;
    const totalCaloriesKcal = weight * totalDistanceKm;

    return {
      totalRuns,
      totalDistanceMeters,
      totalDistanceKm,
      totalTimeSeconds,
      areaCapturedKm2: currentAreaKm2,
      totalCaloriesKcal,
    };
  }, [runs, userProfile?.weightKg, currentAreaKm2]);

  const levelInfo: LevelInfo = useMemo(() => {
    const groupRuns = runs.filter((r: any) => (r as any).mode === 'group').length;
    const currentStreak = computeCurrentStreakDays(runs);

    const sortedRuns = [...runs].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
    let bestWeeklyKm = 0;
    const distances = sortedRuns.map((r) => ({
      t: new Date(r.startedAt).getTime(),
      km: r.distance / 1000,
    }));
    let start = 0;
    let windowSum = 0;
    for (let end = 0; end < distances.length; end++) {
      windowSum += distances[end].km;
      while (distances[end].t - distances[start].t > 7 * 24 * 60 * 60 * 1000) {
        windowSum -= distances[start].km;
        start += 1;
      }
      bestWeeklyKm = Math.max(bestWeeklyKm, windowSum);
    }

    const challengeXp =
      userProfile?.monthlyChallenges?.totalChallengeXp ??
      challengeXpLive ??
      challengeXpFallback ??
      0;
    const sourceXp = xpFromSources(
      {
        distanceKm: stats.totalDistanceKm,
        territoryKm2: stats.areaCapturedKm2,
        challengeXp, // monthly challenge XP (granted via milestones)
      },
      defaultXPConfig
    );
    const totalXp = Math.max(userProfile?.lifetimeXp ?? 0, sourceXp);

    const lv = levelFromTotalXp(totalXp, defaultXPConfig);
    return { ...lv, totalXp };
  }, [
    runs,
    stats.totalDistanceKm,
    stats.areaCapturedKm2,
    stats.totalRuns,
    stats.totalTimeSeconds,
    userProfile?.friendsCount,
    userProfile?.bestLeaderboardRank,
    groups.length,
    userProfile?.lifetimeXp,
    challengeXpLive,
    challengeXpFallback,
  ]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const baseline = userProfile?.lifetimeXp ?? 0;
    const computed = levelInfo.totalXp ?? 0;
    const next = Math.max(baseline, computed);
    if (next <= baseline) return;
    if (next <= lastPersistedLifetimeXpRef.current) return;
    lastPersistedLifetimeXpRef.current = next;
    void updateUserProfile(currentUser.uid, { lifetimeXp: next }).catch(() => {});
  }, [currentUser?.uid, levelInfo.totalXp, userProfile?.lifetimeXp]);

  const recentRuns = useMemo(() => {
    return [...runs]
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
      .slice(0, 3);
  }, [runs]);

  return {
    runs,
    loadingRuns,
    loadRuns,
    stats,
    levelInfo,
    recentRuns,
    setRuns,
  };
}

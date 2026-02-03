import { useEffect, useState } from 'react';
import { getAvailableColors } from '../lib/level';
import { loadRunsForUser } from '../lib/runService';
import { defaultXPConfig, levelFromTotalXp, xpFromSources } from '../lib/xpProgression';
import { computeCurrentStreakDays } from '../lib/utils/streak';
import { loadUserProfile } from '../lib/authService';
import { logFailure, logStart, logSuccess } from '../lib/bootstrapLogger';

/**
 * Compute the set of accent colors available for the user's current level.
 */
export function useLevelColors(userId?: string | null) {
  const [levelColors, setLevelColors] = useState<string[]>(getAvailableColors(1));

  useEffect(() => {
    let cancelled = false;

    const loadLevel = async () => {
      if (!userId) {
        if (!cancelled) setLevelColors(getAvailableColors(1));
        return;
      }
      const tag = `LevelColors.load:${userId}`;
      logStart(tag, { userId });
      try {
        const profile = await loadUserProfile(userId);
        if (__DEV__) {
          console.log(`[RUNS_CALLSITE] file=hooks/useLevelColors.ts fn=loadLevel reason=levelColorsBootstrap ts=${Date.now()}`);
        }
        const allRuns = await loadRunsForUser(userId);
        const totalDistanceMeters = allRuns.reduce((s, r) => s + (r.distance || 0), 0);
        const totalAreaKm2 = allRuns.reduce((s, r) => s + (r.areaKm2 || 0), 0);
        const totalRuns = allRuns.length;
        const totalTimeHours =
          allRuns.reduce((s, r) => s + (r.elapsedSeconds ?? 0), 0) / 3600;
        const groupRuns = allRuns.filter((r: any) => (r as any).mode === 'group').length;
        const currentStreakDays = computeCurrentStreakDays(allRuns);
        const challengeXp = profile?.monthlyChallenges?.totalChallengeXp ?? 0;
        const sourceXp = xpFromSources(
          {
            distanceKm: totalDistanceMeters / 1000,
            territoryKm2: totalAreaKm2,
            challengeXp,
          },
          defaultXPConfig
        );
        const lv = levelFromTotalXp(sourceXp, defaultXPConfig);
        if (!cancelled) setLevelColors(getAvailableColors(lv.level));
        logSuccess(tag, { level: lv.level, runsCount: allRuns.length, colorsCount: getAvailableColors(lv.level).length });
      } catch (e) {
        if (!cancelled) setLevelColors(getAvailableColors(1));
        logFailure(tag, e, { userId });
      }
    };

    loadLevel();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return levelColors;
}

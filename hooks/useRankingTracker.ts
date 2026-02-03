import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { checkAndRecordMainRanking } from '../lib/rankingTracker';
import { monthlyRankingConfig } from '../lib/monthlyChallengesConfig';

export function useRankingTracker(userId: string | undefined) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!userId) return;
    void checkAndRecordMainRanking({ userId, reason: 'app_launch' });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const startInterval = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        void checkAndRecordMainRanking({ userId, reason: 'interval' });
      }, monthlyRankingConfig.minCheckIntervalMs);
    };

    const stopInterval = () => {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    const onAppStateChange = (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === 'active') {
        void checkAndRecordMainRanking({ userId, reason: 'app_resume' });
        startInterval();
      }
      if (nextState.match(/inactive|background/)) {
        stopInterval();
      }
    };

    const sub = AppState.addEventListener('change', onAppStateChange);
    // App might already be active when the hook mounts.
    if (AppState.currentState === 'active') startInterval();

    return () => {
      sub.remove();
      stopInterval();
    };
  }, [userId]);
}

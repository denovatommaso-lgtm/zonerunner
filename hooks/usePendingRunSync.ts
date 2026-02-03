import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { RunSaveService } from '../lib/runSaveService';

export function usePendingRunSync(userId: string | undefined) {
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const sync = async () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        await RunSaveService.syncPendingRuns(userId);
      } finally {
        syncingRef.current = false;
      }
    };

    void sync();

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void sync();
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => {
      sub.remove();
    };
  }, [userId]);
}


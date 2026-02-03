import { useEffect } from 'react';
import { persistWatchRun, subscribeWatchRuns, type WatchRunPayload } from '../lib/watchBridge';

/**
 * Subscribes to native watch run events and saves them using existing run flows.
 */
export function useWatchRunIngestor() {
  useEffect(() => {
    const sub = subscribeWatchRuns(async (payload: WatchRunPayload) => {
      try {
        await persistWatchRun(payload);
      } catch (e) {
        console.log('Failed to persist watch run', e);
      }
    });
    return () => sub.remove();
  }, []);
}

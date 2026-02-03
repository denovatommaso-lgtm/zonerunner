import { useCallback, useEffect, useState } from 'react';
import { fetchRunsForContext } from '../lib/runContext';
import type { RunDoc } from '../lib/runService';

type Mode = 'personal' | 'group';

export function useRunsContext(params: { mode: Mode; groupId?: string; userId?: string }) {
  const { mode, groupId, userId } = params;
  const [runs, setRuns] = useState<RunDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (opts?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchRunsForContext({
        mode,
        groupId,
        userId,
        force: opts?.force,
      });
      setRuns(fetched as RunDoc[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load runs');
    } finally {
      setLoading(false);
    }
    },
    [mode, groupId, userId]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { runs, loading, error, reload, setRuns };
}

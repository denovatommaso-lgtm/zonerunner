import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeletedRunsStore } from '../lib/deletedRunsStore';
import { PendingRunsStore } from '../lib/pendingRunsStore';
import { fetchRunsForContext } from '../lib/runContext';
import { buildLeaderboardEntries } from '../lib/utils/homeAggregates';
import type { LeaderboardEntry } from '../app/(tabs)/leaderboard';
import { computeCurrentAreasFromRuns } from '../lib/utils/currentAreas';
import { logFailure, logStart, logSuccess } from '../lib/bootstrapLogger';

export function useHomeLeaderboard(params: {
  mode: 'personal' | 'group';
  activeGroupId?: string | null;
  groups: Array<{ id: string; name: string; color: string }>;
  userId?: string;
}) {
  const { mode, activeGroupId, groups, userId } = params;
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [ownedTerritoryKm2, setOwnedTerritoryKm2] = useState<number>(0);
  const [groupAreaKm2, setGroupAreaKm2] = useState<number>(0);
  const [areaByOwner, setAreaByOwner] = useState<Map<string, number>>(new Map());
  const groupsRef = useRef(groups);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const inFlightRef = useRef(false);
  const lastRequestKeyRef = useRef<string>('');

  const leaderboardById = useMemo(() => {
    const m = new Map<string, LeaderboardEntry>();
    for (const e of leaderboardEntries) m.set(e.id, e);
    return m;
  }, [leaderboardEntries]);

  const loadLeaderboard = useCallback(async () => {
    const tag = 'HomeLeaderboard.loadLeaderboard';
    const requestKey = `${mode}|${mode === 'group' ? (activeGroupId ?? '') : ''}|${userId ?? ''}`;
    if (inFlightRef.current) return;
    if (lastRequestKeyRef.current === requestKey) return;
    try {
      inFlightRef.current = true;
      lastRequestKeyRef.current = requestKey;
      logStart(tag, {
        mode,
        activeGroupId: activeGroupId ?? null,
        userId: userId ?? null,
      });
      if (mode === 'personal' && !userId) {
        logSuccess(tag, { skipped: true, reason: 'missing-userId' });
        return;
      }
      const runs =
        mode === 'group'
          ? await fetchRunsForContext({ mode: 'group', groupId: activeGroupId ?? undefined })
          : await fetchRunsForContext({ global: true });

      const [pendingMine, deleted] = await Promise.all([
        userId ? PendingRunsStore.listRunDocs(userId) : Promise.resolve([]),
        DeletedRunsStore.getSet(),
      ]);
      const merged = [...(pendingMine as any[]), ...(runs as any[])].filter((r: any) => {
        const id = (r?.id ?? '').toString();
        if (!id) return false;
        if (deleted.has(id)) return false;
        return Array.isArray(r.route) && r.route.length >= 3;
      });

      const areaMap = computeCurrentAreasFromRuns(merged as any[], {
        mode,
        activeGroupId: mode === 'group' ? activeGroupId ?? null : null,
      });
      setAreaByOwner(areaMap);

      const entries = buildLeaderboardEntries(merged as any[], {
        mode,
        activeGroupId: mode === 'group' ? activeGroupId ?? undefined : undefined,
        groups: groupsRef.current,
        userId,
        areaByOwner: areaMap,
      });
      setLeaderboardEntries(entries);

      if (mode === 'personal' && userId) {
        setOwnedTerritoryKm2(areaMap.get(userId) ?? 0);
        setGroupAreaKm2(0);
      } else if (mode === 'group') {
        const gid = activeGroupId ?? '';
        setGroupAreaKm2(areaMap.get(gid) ?? 0);
        setOwnedTerritoryKm2(0);
      } else {
        setOwnedTerritoryKm2(0);
        setGroupAreaKm2(0);
      }
      logSuccess(tag, {
        runsCount: runs.length,
        entries: entries.length,
      });
    } catch (e) {
      logFailure(tag, e, {
        mode,
        activeGroupId: activeGroupId ?? null,
        userId: userId ?? null,
      });
      console.log('Failed to load leaderboard for home', e);
    } finally {
      inFlightRef.current = false;
    }
  }, [activeGroupId, mode, userId]);

  return {
    leaderboardEntries,
    leaderboardById,
    ownedTerritoryKm2,
    groupAreaKm2,
    areaByOwner,
    loadLeaderboard,
  };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadUserProfile } from '../lib/authService';
import { listAllGroups } from '../lib/groupService';
import { fetchRunsForContext } from '../lib/runContext';
import { DeletedRunsStore } from '../lib/deletedRunsStore';
import { PendingRunsStore } from '../lib/pendingRunsStore';
import { rebuildTerritoriesFromRuns, territoryAreaKm2, territoryToMapPolygons, type TerritoryFeature } from '../lib/territoryEngine';
import { getPrefetchedTerritory, preloadTerritoryData, setPrefetchedTerritoryRuns } from '../lib/territoryPrefetch';
import { isRunAffectingGroupTerritory } from '../lib/utils/groupRunPermissions';
import { getTerritoryState, subscribeTerritoryState } from '../lib/territoryState';
import { logFailure, logStart, logSuccess } from '../lib/bootstrapLogger';
import { loadTerritories, saveTerritories } from '../lib/webOfflineStore';

type Coord = {
  latitude: number;
  longitude: number;
};

export type TerritoryMapRunSummary = {
  id: string;
  distance: number; // meters
  elapsedSeconds: number; // seconds
  startedAt: string; // ISO date string
  route: Coord[];
  areaKm2?: number;
  userId?: string;
  createdAt?: number;
  groupId?: string;
  mode?: 'personal' | 'group';
};

const COMMUNITY_OWNER_COLOR_CACHE_KEY = 'communityOwnerColors:v1';
const COMMUNITY_OWNER_COLOR_BATCH_SIZE = 40;

export function useTerritoryMapData(params: {
  userId?: string;
  mode: 'personal' | 'group' | 'community';
  groupId?: string | null;
  territoryColor: string;
}) {
  const { userId, mode, groupId, territoryColor } = params;
  const resolvedUserId = userId ?? undefined;
  const resolvedGroupId = groupId ?? undefined;

  const [pastRuns, setPastRuns] = useState<TerritoryMapRunSummary[]>([]);
  const [userColors, setUserColors] = useState<Record<string, string>>({});
  const [territories, setTerritories] = useState<Map<string, TerritoryFeature | null>>(new Map());
  const [ownerPolygons, setOwnerPolygons] = useState<Array<{ ownerId: string; rings: Coord[][] }>>([]);
  const [myTerritory, setMyTerritory] = useState<TerritoryFeature | null>(null);
  const [totalAreaKm2, setTotalAreaKm2] = useState<number>(0);
  const [communitySnapshotUpdatedAtMs, setCommunitySnapshotUpdatedAtMs] = useState<number>(0);
  const [communitySnapshotLoadId, setCommunitySnapshotLoadId] = useState(0);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityHasEverLoaded, setCommunityHasEverLoaded] = useState(false);
  const communityReloadInFlightRef = useRef<Promise<void> | null>(null);
  const communityInitialLoadRef = useRef(false);
  const communityColorRefreshPendingRef = useRef(false);
  const communityOwnerColorCacheRef = useRef<Record<string, string>>({});
  const communityOwnerColorCacheLoadedRef = useRef(false);
  const communityLoadedOnceRef = useRef(false);
  const lastColorFetchSnapshotUpdatedAtMsRef = useRef<number | null>(null);
  const lastCommunityTerritoriesRef = useRef<Map<string, TerritoryFeature | null> | null>(null);
  const lastCommunityOwnerPolygonsRef = useRef<Array<{ ownerId: string; rings: Coord[][] }> | null>(null);
  const lastCommunityUserColorsRef = useRef<Record<string, string> | null>(null);

  const userProfileCacheRef = useRef(
    new Map<string, { displayName?: string; username?: string; avatarUrl?: string; territoryColor?: string }>()
  );
  const groupInfoByIdRef = useRef(new Map<string, { name: string; color?: string }>());

  const colorForOwner = useCallback((ownerId: string) => {
    let hash = 0;
    for (let i = 0; i < ownerId.length; i += 1) {
      hash = (hash * 31 + ownerId.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    const s = 60 / 100;
    const l = 45 / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) {
      r = c;
      g = x;
    } else if (hue < 120) {
      r = x;
      g = c;
    } else if (hue < 180) {
      g = c;
      b = x;
    } else if (hue < 240) {
      g = x;
      b = c;
    } else if (hue < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    const toHex = (v: number) => {
      const n = Math.round((v + m) * 255);
      return n.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }, []);

  useEffect(() => {
    setPastRuns([]);
    if (mode === 'community') {
      if (lastCommunityTerritoriesRef.current) {
        setTerritories(new Map(lastCommunityTerritoriesRef.current));
      } else {
        setTerritories(new Map());
      }
      if (lastCommunityOwnerPolygonsRef.current) {
        setOwnerPolygons(lastCommunityOwnerPolygonsRef.current);
      } else {
        setOwnerPolygons([]);
      }
      if (lastCommunityUserColorsRef.current) {
        setUserColors(lastCommunityUserColorsRef.current);
      } else {
        setUserColors({});
      }
    } else {
      setUserColors({});
      setTerritories(new Map());
      setOwnerPolygons([]);
    }
    setMyTerritory(null);
    setTotalAreaKm2(0);
    setCommunitySnapshotUpdatedAtMs(0);
    setCommunitySnapshotLoadId(0);
    setCommunityLoading(false);
    setCommunityHasEverLoaded(false);
    communityInitialLoadRef.current = false;
    communityColorRefreshPendingRef.current = false;
    communityLoadedOnceRef.current = false;
    lastColorFetchSnapshotUpdatedAtMsRef.current = null;
    communityOwnerColorCacheLoadedRef.current = false;
  }, [mode, resolvedGroupId, resolvedUserId]);

  const loadRuns = useCallback(async () => {
    if (mode === 'community') {
      if (!resolvedUserId) {
        setPastRuns([]);
        return;
      }
      const personalRuns = await fetchRunsForContext({ mode: 'personal', userId: resolvedUserId });
      setPastRuns(personalRuns as any);
      return;
    }
    const tag = 'TerritoryMapData.loadRuns';
    logStart(tag, {
      mode,
      userId: resolvedUserId ?? null,
      groupId: resolvedGroupId ?? null,
    });
    try {
      if (mode === 'group') {
        const groupRuns = (await fetchRunsForContext({ mode: 'group', groupId: resolvedGroupId })) as any[];
        setPastRuns(groupRuns as any);

        const uniqueGroupIds = Array.from(
          new Set(groupRuns.map((r: any) => r.groupId).filter(Boolean))
        ) as string[];

        const allGroups = await listAllGroups();
        groupInfoByIdRef.current = new Map(allGroups.map((g) => [g.id, { name: g.name, color: g.color }]));
        const colorEntries = allGroups
          .filter((g) => uniqueGroupIds.includes(g.id))
          .map((g) => [g.id, g.color ?? '#22c55e'] as const);
        setUserColors(Object.fromEntries(colorEntries));
        logSuccess(tag, {
          runsCount: groupRuns.length,
        });
        return;
      }

      // Fast path: show cached/prefetched territory runs immediately.
      const prefetched = getPrefetchedTerritory().runs;
      if (prefetched?.length) setPastRuns(prefetched as any);

      if (mode === 'personal' && !resolvedUserId) {
        logSuccess(tag, { skipped: true, reason: 'missing-userId' });
        return;
      }

      // Territory map personal mode shows all captured territories (global), not only the user's runs.
      // Also merge locally queued runs so a just-finished run appears immediately even if offline.
      const [allRuns, pendingMine, deleted] = await Promise.all([
        fetchRunsForContext({ mode: 'personal', userId: resolvedUserId }),
        resolvedUserId ? PendingRunsStore.listRunDocs(resolvedUserId) : Promise.resolve([]),
        DeletedRunsStore.getSet(),
      ]);

      const merged = [...(pendingMine as any[]), ...(allRuns as any[])].filter((r: any) => {
        const id = (r?.id ?? '').toString();
        if (!id) return false;
        if (deleted.has(id)) return false;
        return true;
      });

      // Deduplicate by id (prefer pending/most-recent first).
      const seen = new Set<string>();
      const deduped = merged.filter((r: any) => {
        const id = (r?.id ?? '').toString();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      setPastRuns(deduped as any);
      setPrefetchedTerritoryRuns(deduped as any);

      const uniqueUserIds = Array.from(
        new Set(deduped.map((r: any) => r.userId).filter(Boolean))
      ) as string[];

      // Fetch profiles in background; keep colors neutral until resolved to avoid flash of wrong colors.
      const fallbackColor = '#6b7280';
      setUserColors((prev) => ({
        ...prev,
        ...Object.fromEntries(uniqueUserIds.map((uid) => [uid, prev[uid] ?? fallbackColor])),
      }));
      void Promise.all(
        uniqueUserIds.map(async (uid) => {
          try {
            const profile = await loadUserProfile(uid);
            if (profile) {
              userProfileCacheRef.current.set(uid, {
                displayName: profile.displayName,
                username: profile.username,
                avatarUrl: profile.avatarUrl,
                territoryColor: profile.territoryColor,
              });
              setUserColors((prev) => ({ ...prev, [uid]: profile.territoryColor ?? fallbackColor }));
            }
          } catch {
            // ignore
          }
        })
      );

      logSuccess(tag, {
        runsCount: deduped.length,
      });
    } catch (e) {
      logFailure(tag, e, {
        mode,
        userId: resolvedUserId ?? null,
        groupId: resolvedGroupId ?? null,
      });
      console.log('Failed to load runs', e);
    }
  }, [mode, resolvedGroupId, resolvedUserId]);

  useEffect(() => {
    if (mode !== 'community') {
      preloadTerritoryData().catch(() => console.log('Prefetch territory data failed'));
    }
    loadRuns();
  }, [loadRuns, mode]);

  useEffect(() => {
    if (mode !== 'community') return;
    if (communityOwnerColorCacheLoadedRef.current) return;
    communityOwnerColorCacheLoadedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(COMMUNITY_OWNER_COLOR_CACHE_KEY);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') return;
        const nextColors: Record<string, string> = {};
        Object.entries(parsed).forEach(([uid, value]) => {
          if (typeof value === 'string' && value) {
            nextColors[uid] = value;
            userProfileCacheRef.current.set(uid, { territoryColor: value });
          }
        });
        if (!Object.keys(nextColors).length || cancelled) return;
        communityOwnerColorCacheRef.current = {
          ...communityOwnerColorCacheRef.current,
          ...nextColors,
        };
        setUserColors((prev) => ({ ...nextColors, ...prev }));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Canonical territory state loader
  const recomputeDerived = useCallback(
    (terr: Map<string, TerritoryFeature | null>) => {
      setTerritories(terr);
      if (mode === 'community') {
        let total = 0;
        terr.forEach((t) => {
          if (!t) return;
          total += territoryAreaKm2(t);
        });
        setMyTerritory(null);
        setTotalAreaKm2(total);
      } else {
        const ownerKey =
          mode === 'group'
            ? resolvedGroupId ?? ''
            : mode === 'personal'
              ? resolvedUserId ?? ''
              : '';
        const mine = ownerKey ? terr.get(ownerKey) ?? null : null;
        setMyTerritory(mine);
        setTotalAreaKm2(mine ? territoryAreaKm2(mine) : 0);
      }
      const polys = Array.from(terr.entries())
        .filter(([, t]) => t)
        .map(([ownerId, t]) => ({
          ownerId,
          rings: territoryToMapPolygons(t),
        }))
        .filter((p) => p.rings.length > 0);
      setOwnerPolygons(polys);
    },
    [mode, resolvedGroupId, resolvedUserId]
  );

  const persistTerritories = useCallback(
    async (terr: Map<string, TerritoryFeature | null>) => {
      if (Platform.OS !== 'web') return;
      try {
        await saveTerritories({
          mode,
          userId: resolvedUserId,
          groupId: resolvedGroupId ?? undefined,
          territories: terr,
        });
      } catch {
        // ignore cache errors
      }
    },
    [mode, resolvedGroupId, resolvedUserId]
  );

  const loadTerritoryState = useCallback(async () => {
    try {
      if (mode === 'community') {
        setCommunityLoading(true);
      }
      const state = await getTerritoryState({ mode, groupId: resolvedGroupId, userId: resolvedUserId });
      if (mode === 'community' && state.territories.size === 0 && lastCommunityTerritoriesRef.current) {
        setCommunityLoading(state.communityLoading ?? false);
        setCommunityHasEverLoaded(state.communityHasEverLoaded ?? false);
        return;
      }
      recomputeDerived(state.territories);
      void persistTerritories(state.territories);
      if (mode === 'community') {
        const nextUpdatedAtMs = state.snapshotUpdatedAtMs ?? 0;
        setCommunitySnapshotUpdatedAtMs(nextUpdatedAtMs);
        setCommunitySnapshotLoadId((value) => value + 1);
        if (!communityLoadedOnceRef.current) {
          communityLoadedOnceRef.current = true;
          lastColorFetchSnapshotUpdatedAtMsRef.current = nextUpdatedAtMs;
        }
        setCommunityLoading(state.communityLoading ?? false);
        setCommunityHasEverLoaded(state.communityHasEverLoaded ?? false);
      }
    } catch (e) {
      if (mode === 'community') setCommunityLoading(false);
      console.log('Failed to load territory state', e);
      if (Platform.OS === 'web') {
        try {
          const cached = await loadTerritories({
            mode,
            userId: resolvedUserId,
            groupId: resolvedGroupId ?? undefined,
          });
          if (cached) {
            recomputeDerived(cached);
          }
        } catch {
          // ignore cache errors
        }
      }
    }
  }, [mode, persistTerritories, recomputeDerived, resolvedGroupId, resolvedUserId]);

  const reloadTerritoryState = useCallback(() => {
    if (mode !== 'community') return loadTerritoryState();
    if (communityReloadInFlightRef.current) return communityReloadInFlightRef.current;
    const run = (async () => {
      await loadTerritoryState();
    })();
    communityReloadInFlightRef.current = run;
    return run.finally(() => {
      communityReloadInFlightRef.current = null;
    });
  }, [loadTerritoryState, mode]);

  useEffect(() => {
    if (mode === 'community') {
      if (communityInitialLoadRef.current) return;
      communityInitialLoadRef.current = true;
    }
    void reloadTerritoryState();
  }, [mode, reloadTerritoryState]);

  useEffect(() => {
    const unsub = subscribeTerritoryState(
      { mode, groupId: resolvedGroupId, userId: resolvedUserId },
      () => loadTerritoryState()
    );
    return () => {
      unsub?.();
    };
  }, [loadTerritoryState, mode, resolvedGroupId, resolvedUserId]);

  // Polygon-based territory ownership (last runner wins).
  // Use all runs in chronological order; do not filter out overlaps so union/difference can resolve ownership.
  const territoryRuns = useMemo(() => {
    if (mode === 'community') return [];
    if (mode === 'group') {
      return pastRuns
        .filter(
          (r): r is TerritoryMapRunSummary & { groupId: string } =>
            !!r.groupId && isRunAffectingGroupTerritory(r as any)
        )
        .map((r) => ({ ...r, userId: r.groupId }));
    }
    return pastRuns.filter(
      (r): r is TerritoryMapRunSummary & { userId: string } =>
        !!r.userId && !(r as any).groupId && (r as any).mode !== 'group'
    );
  }, [pastRuns, mode]);

  // Fallback: if canonical state is empty but we have runs, compute locally.
  useEffect(() => {
    if (territories.size === 0 && territoryRuns.length > 0) {
      const tag = 'TerritoryMapData.rebuildTerritories';
      logStart(tag, { runsCount: territoryRuns.length });
      try {
        const terr = rebuildTerritoriesFromRuns(territoryRuns as any);
        recomputeDerived(terr);
        logSuccess(tag, { territoriesCount: terr.size });
      } catch (e) {
        logFailure(tag, e, { runsCount: territoryRuns.length });
      }
    }
  }, [territories.size, territoryRuns, recomputeDerived]);

  // Ensure we have a color for every owner (personal mode).
  useEffect(() => {
    if (mode !== 'personal') return;
    const ownerIds = Array.from(territories.keys());
    if (!ownerIds.length) return;

    let cancelled = false;
    (async () => {
      const nextColors: Record<string, string> = {};

      // Use cached profiles when available.
      ownerIds.forEach((id) => {
        const cached = userProfileCacheRef.current.get(id);
        if (cached?.territoryColor) {
          nextColors[id] = cached.territoryColor;
        }
      });

      // Fetch profiles for owners without a color yet.
      const missing = ownerIds.filter((id) => !nextColors[id]);
      for (const uid of missing) {
        try {
          const profile = await loadUserProfile(uid);
          if (profile?.territoryColor) {
            userProfileCacheRef.current.set(uid, {
              displayName: profile.displayName,
              username: profile.username,
              avatarUrl: profile.avatarUrl,
              territoryColor: profile.territoryColor,
            });
            nextColors[uid] = profile.territoryColor;
          }
        } catch {
          // ignore
        }
      }

      if (!cancelled && Object.keys(nextColors).length) {
        setUserColors((prev) => ({ ...prev, ...nextColors }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, territories]);

  useEffect(() => {
    if (mode !== 'community') return;
    const ownerIds = ownerPolygons.map((p) => p.ownerId);
    if (!ownerIds.length) return;
    setUserColors((prev) => {
      const next = { ...prev };
      ownerIds.forEach((id) => {
        if (next[id]) return;
        if (resolvedUserId && id === resolvedUserId) {
          next[id] = territoryColor;
          return;
        }
        const cached = userProfileCacheRef.current.get(id);
        if (cached?.territoryColor) {
          next[id] = cached.territoryColor;
          return;
        }
        const cachedColor = communityOwnerColorCacheRef.current[id];
        if (cachedColor) {
          next[id] = cachedColor;
          return;
        }
        next[id] = colorForOwner(id);
      });
      return next;
    });
  }, [colorForOwner, mode, ownerPolygons, resolvedUserId, territoryColor]);

  useEffect(() => {
    if (mode !== 'community') return;
    if (territories.size === 0 || ownerPolygons.length === 0) return;
    lastCommunityTerritoriesRef.current = new Map(territories);
    lastCommunityOwnerPolygonsRef.current = ownerPolygons;
    lastCommunityUserColorsRef.current = userColors;
  }, [mode, ownerPolygons, territories, userColors]);

  useEffect(() => {
    if (mode !== 'community') return;
    if (!communityLoadedOnceRef.current) return;
    if (!communitySnapshotLoadId) return;
    const ownerIds = ownerPolygons.map((p) => p.ownerId);
    if (!ownerIds.length) return;
    const snapshotChanged =
      lastColorFetchSnapshotUpdatedAtMsRef.current !== communitySnapshotUpdatedAtMs;
    const shouldFetch = communityColorRefreshPendingRef.current || snapshotChanged;
    if (!shouldFetch) return;
    communityColorRefreshPendingRef.current = false;
    lastColorFetchSnapshotUpdatedAtMsRef.current = communitySnapshotUpdatedAtMs;
    let cancelled = false;
    (async () => {
      const missingOrOutdated = ownerIds.filter((id) => {
        const cached = userProfileCacheRef.current.get(id);
        const cachedColor = cached?.territoryColor ?? communityOwnerColorCacheRef.current[id];
        return !cachedColor;
      });
      if (!missingOrOutdated.length) return;
      const nextColors: Record<string, string> = {};
      for (let i = 0; i < missingOrOutdated.length; i += COMMUNITY_OWNER_COLOR_BATCH_SIZE) {
        const batch = missingOrOutdated.slice(i, i + COMMUNITY_OWNER_COLOR_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (uid) => {
            try {
              const profile = await loadUserProfile(uid);
              if (!profile?.territoryColor) return null;
              return { uid, profile };
            } catch {
              return null;
            }
          })
        );
        batchResults.forEach((result) => {
          if (!result) return;
          const { uid, profile } = result;
          userProfileCacheRef.current.set(uid, {
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
            territoryColor: profile.territoryColor,
          });
          nextColors[uid] = profile.territoryColor!;
        });
      }
      if (cancelled || !Object.keys(nextColors).length) return;
      communityOwnerColorCacheRef.current = {
        ...communityOwnerColorCacheRef.current,
        ...nextColors,
      };
      AsyncStorage.setItem(
        COMMUNITY_OWNER_COLOR_CACHE_KEY,
        JSON.stringify(communityOwnerColorCacheRef.current)
      ).catch(() => {});
      setUserColors((prev) => ({ ...prev, ...nextColors }));
    })();
    return () => {
      cancelled = true;
    };
  }, [communitySnapshotLoadId, communitySnapshotUpdatedAtMs, mode, ownerPolygons]);

  const refreshCommunityColors = useCallback(() => {
    if (mode !== 'community') return;
    communityColorRefreshPendingRef.current = true;
  }, [mode]);

  return {
    pastRuns,
    userColors,
    setUserColors,
    territories,
    ownerPolygons,
    myTerritory,
    totalAreaKm2,
    territoryRuns,
    groupInfoById: groupInfoByIdRef.current,
    userProfileCache: userProfileCacheRef.current,
    reloadRuns: loadRuns,
    refreshCommunityColors,
    // Convenience fallback color (avoid repeating defaults in UI).
    defaultOwnerColor: territoryColor,
    communityLoading,
    communityHasEverLoaded,
    reloadTerritoryState,
  };
}

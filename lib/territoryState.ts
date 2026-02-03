import { DeletedRunsStore } from './deletedRunsStore';
import { PendingRunsStore } from './pendingRunsStore';
import { clearGlobalSnapshotCache, loadGlobalSnapshotCached } from './globalTerritorySnapshot';
import { fetchRunsForContext } from './runContext';
import { rebuildTerritoriesFromRuns, territoryAreaKm2, type TerritoryFeature } from './territoryEngine';
import { logFailure, logStart, logSuccess } from './bootstrapLogger';

type TerritoryContextKey = 'personal' | `personal:${string}` | `group:${string}` | 'community';

type TerritoryState = {
  territories: Map<string, TerritoryFeature | null>;
  areaByOwner: Map<string, number>;
  snapshotUpdatedAtMs?: number;
  communityLoading?: boolean;
  communityHasEverLoaded?: boolean;
};

const cache = new Map<TerritoryContextKey, Promise<TerritoryState>>();
const listeners = new Map<TerritoryContextKey, Set<() => void>>();
let communityForceRefresh = false;
let lastCommunityState: TerritoryState | null = null;
let lastCommunityUpdatedAtMs: number | null = null;
let communityLoading = false;
let communityHasEverLoaded = false;
let communityNeedsRefresh = true;
let communityInFlight: Promise<TerritoryState> | null = null;
const COMMUNITY_SNAPSHOT_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('community_snapshot_timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function contextKey(
  mode: 'personal' | 'group' | 'community',
  groupId?: string | null,
  userId?: string | null
): TerritoryContextKey {
  if (mode === 'community') return 'community';
  if (mode === 'group') return `group:${groupId ?? ''}` as TerritoryContextKey;
  if (userId) return `personal:${userId}` as TerritoryContextKey;
  return 'personal';
}

function featureFromGeometry(raw: any): TerritoryFeature | null {
  if (!raw) return null;
  if (raw.type === 'Feature' && raw.geometry?.type) return raw as TerritoryFeature;
  if (raw.type === 'Polygon' || raw.type === 'MultiPolygon') {
    return {
      type: 'Feature',
      geometry: raw,
      properties: {},
    } as TerritoryFeature;
  }
  return null;
}

async function buildTerritoryState(key: TerritoryContextKey): Promise<TerritoryState> {
  const tag = `TerritoryState.build:${key}`;
  logStart(tag, { key });
  if (key === 'community') {
    try {
      const force = communityForceRefresh;
      communityForceRefresh = false;
      communityLoading = true;
      const nextState = await withTimeout(
        (async () => {
          const snapshot = await loadGlobalSnapshotCached({ ttlHours: 24, force });
          if (snapshot.territories.length === 0) {
            communityNeedsRefresh = false;
            if (lastCommunityState) {
              return {
                ...lastCommunityState,
                snapshotUpdatedAtMs: lastCommunityUpdatedAtMs ?? lastCommunityState.snapshotUpdatedAtMs,
                communityLoading: false,
                communityHasEverLoaded,
              };
            }
            return {
              territories: new Map(),
              areaByOwner: new Map(),
              snapshotUpdatedAtMs: snapshot.updatedAtMs,
              communityLoading: false,
              communityHasEverLoaded,
            };
          }
          const territories = new Map<string, TerritoryFeature | null>();
          const areaByOwner = new Map<string, number>();
          for (const entry of snapshot.territories) {
            const ownerId = (entry.ownerId ?? '').toString();
            if (!ownerId) continue;
            let geometry: any = null;
            if (typeof (entry as any).geometryJson === 'string') {
              try {
                geometry = JSON.parse((entry as any).geometryJson as string);
              } catch {
                geometry = null;
              }
            } else if (__DEV__) {
              geometry = (entry as any).geometry ?? null;
            }
            const feature = featureFromGeometry(geometry);
            if (feature) territories.set(ownerId, feature);
            const area = Number.isFinite(entry.areaKm2) ? entry.areaKm2 : 0;
            areaByOwner.set(ownerId, (areaByOwner.get(ownerId) ?? 0) + area);
          }
          if (__DEV__ && snapshot.ownersCount > 0 && territories.size === 0) {
            throw new Error('Community snapshot reports owners but no valid territories were built');
          }
          logSuccess(tag, { runsCount: 0, territoriesCount: territories.size });
          if (territories.size > 0) {
            communityHasEverLoaded = true;
            communityNeedsRefresh = false;
            const updated = {
              territories,
              areaByOwner,
              snapshotUpdatedAtMs: snapshot.updatedAtMs,
              communityLoading: false,
              communityHasEverLoaded,
            };
            lastCommunityState = updated;
            lastCommunityUpdatedAtMs = snapshot.updatedAtMs;
            return updated;
          }
          communityNeedsRefresh = false;
          if (lastCommunityState) {
            return {
              ...lastCommunityState,
              snapshotUpdatedAtMs: lastCommunityUpdatedAtMs ?? lastCommunityState.snapshotUpdatedAtMs,
              communityLoading: false,
              communityHasEverLoaded,
            };
          }
          return {
            territories,
            areaByOwner,
            snapshotUpdatedAtMs: snapshot.updatedAtMs,
            communityLoading: false,
            communityHasEverLoaded,
          };
        })(),
        COMMUNITY_SNAPSHOT_TIMEOUT_MS
      );
      return nextState;
    } catch (e) {
      communityLoading = false;
      logFailure(tag, e, { key });
      if (lastCommunityState) {
        return {
          ...lastCommunityState,
          snapshotUpdatedAtMs: lastCommunityUpdatedAtMs ?? lastCommunityState.snapshotUpdatedAtMs,
          communityLoading,
          communityHasEverLoaded,
        };
      }
      return {
        territories: new Map(),
        areaByOwner: new Map(),
        snapshotUpdatedAtMs: lastCommunityUpdatedAtMs ?? 0,
        communityLoading,
        communityHasEverLoaded,
      };
    } finally {
      communityLoading = false;
    }
  }
  const isGroup = key.startsWith('group:');
  const groupId = isGroup ? key.slice('group:'.length) || undefined : undefined;
  const isPersonalScoped = key.startsWith('personal:');
  const userId = isPersonalScoped ? key.slice('personal:'.length) || undefined : undefined;
  const mode: 'personal' | 'group' = isGroup ? 'group' : 'personal';

  try {
    // Load runs for the context plus pending runs (for the current user only, but we don't have userId here;
    // pending runs are per-user so they won't affect other owners' territory. We therefore only merge pending
    // from the current user if requested by caller via a separate invalidate call.)
    if (mode === 'personal' && !userId) {
      logSuccess(tag, { skipped: true, reason: 'missing-userId' });
      return { territories: new Map(), areaByOwner: new Map() };
    }
    const runs =
      mode === 'group'
        ? await fetchRunsForContext({ mode: 'group', groupId })
        : await fetchRunsForContext({ mode: 'personal', userId });

    // Remove deleted runs and dedupe by id.
    const deleted = await DeletedRunsStore.getSet();
    const seen = new Set<string>();
    const filtered = runs.filter((r: any) => {
      const id = (r?.id ?? '').toString();
      if (!id || deleted.has(id)) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return Array.isArray(r.route) && r.route.length >= 3;
    });

    const territories = rebuildTerritoriesFromRuns(
      filtered.map((r: any) => ({
        id: r.id,
        userId: isGroup ? r.groupId : r.userId,
        route: r.route,
        startedAt: r.startedAt,
        createdAt: r.createdAt,
      }))
    );

    const areaByOwner = new Map<string, number>();
    territories.forEach((terr, ownerId) => {
      areaByOwner.set(ownerId, territoryAreaKm2(terr));
    });

    logSuccess(tag, { runsCount: runs.length, territoriesCount: territories.size });
    return { territories, areaByOwner };
  } catch (e) {
    logFailure(tag, e, { key });
    throw e;
  }
}

export async function getTerritoryState(params: {
  mode: 'personal' | 'group' | 'community';
  groupId?: string | null;
  userId?: string | null;
}) {
  const key = contextKey(params.mode, params.groupId, params.userId);
  if (key === 'community') {
    if (cache.has(key)) return cache.get(key)!;
    if (communityInFlight) return communityInFlight;
    if (!communityNeedsRefresh && lastCommunityState) {
      return Promise.resolve(lastCommunityState);
    }
  }
  if (!cache.has(key)) {
    const promise = buildTerritoryState(key).finally(() => {
      // If build failed, drop cache entry so we can retry.
      const p = cache.get(key);
      p?.catch(() => cache.delete(key));
      if (key === 'community') communityInFlight = null;
    });
    cache.set(key, promise);
    if (key === 'community') communityInFlight = promise;
  }
  return cache.get(key)!;
}

export function subscribeTerritoryState(
  params: { mode: 'personal' | 'group' | 'community'; groupId?: string | null; userId?: string | null },
  listener: () => void
) {
  const key = contextKey(params.mode, params.groupId, params.userId);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener);
  return () => {
    listeners.get(key)?.delete(listener);
  };
}

export function invalidateTerritoryState(params?: {
  mode?: 'personal' | 'group' | 'community';
  groupId?: string | null;
  userId?: string | null;
}) {
  const key = params ? contextKey(params.mode ?? 'personal', params.groupId, params.userId) : null;
  if (key) {
    cache.delete(key);
    listeners.get(key)?.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.log('territoryState listener error', e);
      }
    });
  } else {
    // Invalidate all
    Array.from(cache.keys()).forEach((k) => {
      cache.delete(k);
      listeners.get(k)?.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.log('territoryState listener error', e);
        }
      });
    });
  }
}

export function invalidateCommunityTerritoryState() {
  const key: TerritoryContextKey = 'community';
  communityForceRefresh = true;
  communityNeedsRefresh = true;
  void clearGlobalSnapshotCache();
  cache.delete(key);
  listeners.get(key)?.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.log('territoryState listener error', e);
    }
  });
}

// Convenience: merge pending runs for a specific user into the personal territory context.
export async function invalidatePersonalWithPending(userId: string) {
  const pending = await PendingRunsStore.listRunDocs(userId);
  if (!pending.length) {
    invalidateTerritoryState({ mode: 'personal' });
    return;
  }
  // We cannot safely merge pending into global cache without user context here; just invalidate so next read reloads.
  invalidateTerritoryState({ mode: 'personal' });
}

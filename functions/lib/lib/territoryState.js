"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTerritoryState = getTerritoryState;
exports.subscribeTerritoryState = subscribeTerritoryState;
exports.invalidateTerritoryState = invalidateTerritoryState;
exports.invalidateCommunityTerritoryState = invalidateCommunityTerritoryState;
exports.invalidatePersonalWithPending = invalidatePersonalWithPending;
const deletedRunsStore_1 = require("./deletedRunsStore");
const pendingRunsStore_1 = require("./pendingRunsStore");
const globalTerritorySnapshot_1 = require("./globalTerritorySnapshot");
const runContext_1 = require("./runContext");
const territoryEngine_1 = require("./territoryEngine");
const bootstrapLogger_1 = require("./bootstrapLogger");
const cache = new Map();
const listeners = new Map();
let communityForceRefresh = false;
let lastCommunityState = null;
let lastCommunityUpdatedAtMs = null;
let communityLoading = false;
let communityHasEverLoaded = false;
let communityNeedsRefresh = true;
let communityInFlight = null;
const COMMUNITY_SNAPSHOT_TIMEOUT_MS = 10000;
function withTimeout(promise, ms) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('community_snapshot_timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer)
            clearTimeout(timer);
    });
}
function contextKey(mode, groupId, userId) {
    if (mode === 'community')
        return 'community';
    if (mode === 'group')
        return `group:${groupId ?? ''}`;
    if (userId)
        return `personal:${userId}`;
    return 'personal';
}
function featureFromGeometry(raw) {
    if (!raw)
        return null;
    if (raw.type === 'Feature' && raw.geometry?.type)
        return raw;
    if (raw.type === 'Polygon' || raw.type === 'MultiPolygon') {
        return {
            type: 'Feature',
            geometry: raw,
            properties: {},
        };
    }
    return null;
}
async function buildTerritoryState(key) {
    const tag = `TerritoryState.build:${key}`;
    (0, bootstrapLogger_1.logStart)(tag, { key });
    if (key === 'community') {
        try {
            const force = communityForceRefresh;
            communityForceRefresh = false;
            communityLoading = true;
            const nextState = await withTimeout((async () => {
                const snapshot = await (0, globalTerritorySnapshot_1.loadGlobalSnapshotCached)({ ttlHours: 24, force });
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
                const territories = new Map();
                const areaByOwner = new Map();
                for (const entry of snapshot.territories) {
                    const ownerId = (entry.ownerId ?? '').toString();
                    if (!ownerId)
                        continue;
                    let geometry = null;
                    if (typeof entry.geometryJson === 'string') {
                        try {
                            geometry = JSON.parse(entry.geometryJson);
                        }
                        catch {
                            geometry = null;
                        }
                    }
                    else if (__DEV__) {
                        geometry = entry.geometry ?? null;
                    }
                    const feature = featureFromGeometry(geometry);
                    if (feature)
                        territories.set(ownerId, feature);
                    const area = Number.isFinite(entry.areaKm2) ? entry.areaKm2 : 0;
                    areaByOwner.set(ownerId, (areaByOwner.get(ownerId) ?? 0) + area);
                }
                if (__DEV__ && snapshot.ownersCount > 0 && territories.size === 0) {
                    throw new Error('Community snapshot reports owners but no valid territories were built');
                }
                (0, bootstrapLogger_1.logSuccess)(tag, { runsCount: 0, territoriesCount: territories.size });
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
            })(), COMMUNITY_SNAPSHOT_TIMEOUT_MS);
            return nextState;
        }
        catch (e) {
            communityLoading = false;
            (0, bootstrapLogger_1.logFailure)(tag, e, { key });
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
        }
        finally {
            communityLoading = false;
        }
    }
    const isGroup = key.startsWith('group:');
    const groupId = isGroup ? key.slice('group:'.length) || undefined : undefined;
    const isPersonalScoped = key.startsWith('personal:');
    const userId = isPersonalScoped ? key.slice('personal:'.length) || undefined : undefined;
    const mode = isGroup ? 'group' : 'personal';
    try {
        // Load runs for the context plus pending runs (for the current user only, but we don't have userId here;
        // pending runs are per-user so they won't affect other owners' territory. We therefore only merge pending
        // from the current user if requested by caller via a separate invalidate call.)
        if (mode === 'personal' && !userId) {
            (0, bootstrapLogger_1.logSuccess)(tag, { skipped: true, reason: 'missing-userId' });
            return { territories: new Map(), areaByOwner: new Map() };
        }
        const runs = mode === 'group'
            ? await (0, runContext_1.fetchRunsForContext)({ mode: 'group', groupId })
            : await (0, runContext_1.fetchRunsForContext)({ mode: 'personal', userId });
        // Remove deleted runs and dedupe by id.
        const deleted = await deletedRunsStore_1.DeletedRunsStore.getSet();
        const seen = new Set();
        const filtered = runs.filter((r) => {
            const id = (r?.id ?? '').toString();
            if (!id || deleted.has(id))
                return false;
            if (seen.has(id))
                return false;
            seen.add(id);
            return Array.isArray(r.route) && r.route.length >= 3;
        });
        const territories = (0, territoryEngine_1.rebuildTerritoriesFromRuns)(filtered.map((r) => ({
            id: r.id,
            userId: isGroup ? r.groupId : r.userId,
            route: r.route,
            startedAt: r.startedAt,
            createdAt: r.createdAt,
        })));
        const areaByOwner = new Map();
        territories.forEach((terr, ownerId) => {
            areaByOwner.set(ownerId, (0, territoryEngine_1.territoryAreaKm2)(terr));
        });
        (0, bootstrapLogger_1.logSuccess)(tag, { runsCount: runs.length, territoriesCount: territories.size });
        return { territories, areaByOwner };
    }
    catch (e) {
        (0, bootstrapLogger_1.logFailure)(tag, e, { key });
        throw e;
    }
}
async function getTerritoryState(params) {
    const key = contextKey(params.mode, params.groupId, params.userId);
    if (key === 'community') {
        if (cache.has(key))
            return cache.get(key);
        if (communityInFlight)
            return communityInFlight;
        if (!communityNeedsRefresh && lastCommunityState) {
            return Promise.resolve(lastCommunityState);
        }
    }
    if (!cache.has(key)) {
        const promise = buildTerritoryState(key).finally(() => {
            // If build failed, drop cache entry so we can retry.
            const p = cache.get(key);
            p?.catch(() => cache.delete(key));
            if (key === 'community')
                communityInFlight = null;
        });
        cache.set(key, promise);
        if (key === 'community')
            communityInFlight = promise;
    }
    return cache.get(key);
}
function subscribeTerritoryState(params, listener) {
    const key = contextKey(params.mode, params.groupId, params.userId);
    if (!listeners.has(key))
        listeners.set(key, new Set());
    listeners.get(key).add(listener);
    return () => {
        listeners.get(key)?.delete(listener);
    };
}
function invalidateTerritoryState(params) {
    const key = params ? contextKey(params.mode ?? 'personal', params.groupId, params.userId) : null;
    if (key) {
        cache.delete(key);
        listeners.get(key)?.forEach((fn) => {
            try {
                fn();
            }
            catch (e) {
                console.log('territoryState listener error', e);
            }
        });
    }
    else {
        // Invalidate all
        Array.from(cache.keys()).forEach((k) => {
            cache.delete(k);
            listeners.get(k)?.forEach((fn) => {
                try {
                    fn();
                }
                catch (e) {
                    console.log('territoryState listener error', e);
                }
            });
        });
    }
}
function invalidateCommunityTerritoryState() {
    const key = 'community';
    communityForceRefresh = true;
    communityNeedsRefresh = true;
    void (0, globalTerritorySnapshot_1.clearGlobalSnapshotCache)();
    cache.delete(key);
    listeners.get(key)?.forEach((fn) => {
        try {
            fn();
        }
        catch (e) {
            console.log('territoryState listener error', e);
        }
    });
}
// Convenience: merge pending runs for a specific user into the personal territory context.
async function invalidatePersonalWithPending(userId) {
    const pending = await pendingRunsStore_1.PendingRunsStore.listRunDocs(userId);
    if (!pending.length) {
        invalidateTerritoryState({ mode: 'personal' });
        return;
    }
    // We cannot safely merge pending into global cache without user context here; just invalidate so next read reloads.
    invalidateTerritoryState({ mode: 'personal' });
}

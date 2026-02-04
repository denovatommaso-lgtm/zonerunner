"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearGlobalSnapshotCache = clearGlobalSnapshotCache;
exports.buildAndWriteGlobalSnapshotFromRuns = buildAndWriteGlobalSnapshotFromRuns;
exports.loadGlobalSnapshotCached = loadGlobalSnapshotCached;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const territoryEngine_1 = require("./territoryEngine");
const CACHE_KEY = 'globalTerritorySnapshot:v1';
const DEFAULT_TTL_HOURS = 24;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_CHUNK_SIZE = 200;
function emptySnapshot() {
    return {
        schemaVersion: 1,
        updatedAtMs: 0,
        ownersCount: 0,
        territoriesCount: 0,
        territories: [],
    };
}
function toNumber(value, fallback = 0) {
    const n = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(n) ? n : fallback;
}
function toMillis(value) {
    if (!value)
        return 0;
    if (typeof value === 'number')
        return value;
    if (typeof value?.toMillis === 'function')
        return value.toMillis();
    if (typeof value?.seconds === 'number')
        return Math.round(value.seconds * 1000);
    return 0;
}
function normalizeBbox(raw) {
    if (!raw)
        return undefined;
    const minLat = toNumber(raw.minLat, NaN);
    const minLng = toNumber(raw.minLng, NaN);
    const maxLat = toNumber(raw.maxLat, NaN);
    const maxLng = toNumber(raw.maxLng, NaN);
    if (![minLat, minLng, maxLat, maxLng].every((n) => Number.isFinite(n)))
        return undefined;
    return { minLat, minLng, maxLat, maxLng };
}
function normalizeTerritory(raw) {
    const ownerId = (raw?.ownerId ?? raw?.userId ?? '').toString();
    if (!ownerId)
        return null;
    let geometry = null;
    if (typeof raw?.geometryJson === 'string') {
        try {
            geometry = JSON.parse(raw.geometryJson);
        }
        catch {
            geometry = null;
        }
    }
    else if (__DEV__) {
        geometry = raw?.geometry ?? raw?.feature ?? raw?.territory ?? null;
    }
    if (!geometry || !isValidGeometry(geometry))
        return null;
    const areaKm2 = toNumber(raw?.areaKm2, 0);
    const ownerHint = raw?.ownerHint && typeof raw.ownerHint === 'object' ? raw.ownerHint : undefined;
    return { ownerId, areaKm2, geometry, ownerHint, geometryJson: raw?.geometryJson };
}
function isValidGeometry(raw) {
    if (!raw)
        return false;
    const geom = raw?.type === 'Feature' ? raw?.geometry : raw;
    const type = geom?.type;
    const coords = geom?.coordinates;
    if (type !== 'Polygon' && type !== 'MultiPolygon')
        return false;
    return Array.isArray(coords) && coords.length > 0;
}
async function readCache(ttlMs) {
    try {
        const raw = await async_storage_1.default.getItem(CACHE_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        const cachedAtMs = toNumber(parsed?.cachedAtMs, 0);
        if (!cachedAtMs || Date.now() - cachedAtMs > ttlMs)
            return null;
        if (!parsed?.snapshot || typeof parsed.snapshot !== 'object')
            return null;
        if (!Array.isArray(parsed.snapshot.territories) || parsed.snapshot.territories.length === 0) {
            return null;
        }
        return parsed.snapshot;
    }
    catch {
        return null;
    }
}
async function writeCache(snapshot) {
    const payload = {
        cachedAtMs: Date.now(),
        snapshot,
    };
    try {
        await async_storage_1.default.setItem(CACHE_KEY, JSON.stringify(payload));
    }
    catch {
        // ignore cache errors
    }
}
async function clearGlobalSnapshotCache() {
    try {
        await async_storage_1.default.removeItem(CACHE_KEY);
    }
    catch {
        // ignore cache errors
    }
}
function hasNestedArrays(value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            if (Array.isArray(item))
                return true;
            if (hasNestedArrays(item))
                return true;
        }
        return false;
    }
    if (value && typeof value === 'object') {
        for (const v of Object.values(value)) {
            if (hasNestedArrays(v))
                return true;
        }
    }
    return false;
}
async function buildAndWriteGlobalSnapshotFromRuns(runs) {
    const runLikes = runs.filter((r) => r?.userId && Array.isArray(r.route) && r.route.length >= 3);
    const territories = (0, territoryEngine_1.rebuildTerritoriesFromRuns)(runLikes);
    const territoryEntries = Array.from(territories.entries())
        .map(([ownerId, feature]) => {
        if (!feature)
            return null;
        return {
            ownerId,
            areaKm2: (0, territoryEngine_1.territoryAreaKm2)(feature),
            geometryJson: JSON.stringify(feature),
        };
    })
        .filter((t) => !!t);
    if (__DEV__ && territoryEntries.length) {
        const normalizedCount = territoryEntries.reduce((acc, entry) => {
            try {
                const geometry = JSON.parse(entry.geometryJson);
                return acc + (isValidGeometry(geometry) ? 1 : 0);
            }
            catch {
                return acc;
            }
        }, 0);
        if (normalizedCount === 0) {
            const sample = territoryEntries[0];
            console.warn(`[SnapshotWriteSample] ownerId=${sample.ownerId} areaKm2=${sample.areaKm2} geometryJson=${sample.geometryJson.slice(0, 50)}`);
        }
    }
    const ownersCount = territories.size;
    const territoriesCount = territoryEntries.length;
    const updatedAtMs = Date.now();
    const chunkSize = Math.max(1, Math.floor(DEFAULT_CHUNK_SIZE));
    const chunks = territoryEntries.length > chunkSize
        ? Array.from({ length: Math.ceil(territoryEntries.length / chunkSize) }, (_, i) => territoryEntries.slice(i * chunkSize, (i + 1) * chunkSize))
        : [];
    const metaRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'globalTerritorySnapshots', 'current');
    if (!chunks.length) {
        chunks.push(territoryEntries);
    }
    let batch = (0, firestore_1.writeBatch)(firebaseConfig_1.db);
    let writes = 0;
    const commitBatch = async () => {
        if (!writes)
            return;
        await batch.commit();
        batch = (0, firestore_1.writeBatch)(firebaseConfig_1.db);
        writes = 0;
    };
    const metaDoc = {
        schemaVersion: 2,
        updatedAtMs,
        ownersCount,
        territoriesCount,
        chunksCount: chunks.length,
    };
    if (__DEV__ && hasNestedArrays(metaDoc)) {
        throw new Error('Snapshot meta contains nested arrays (geometry must be JSON string)');
    }
    batch.set(metaRef, metaDoc);
    writes += 1;
    for (let idx = 0; idx < chunks.length; idx += 1) {
        const chunkRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'globalTerritorySnapshots', 'current', 'chunks', String(idx));
        const chunkDoc = { chunkId: String(idx), territories: chunks[idx] };
        if (__DEV__ && hasNestedArrays(chunkDoc)) {
            throw new Error('Snapshot chunk contains nested arrays (geometry must be JSON string)');
        }
        batch.set(chunkRef, chunkDoc);
        writes += 1;
        if (writes >= 450) {
            await commitBatch();
        }
    }
    await commitBatch();
}
async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    const safeLimit = Math.max(1, Math.min(limit, items.length));
    let index = 0;
    const workers = Array.from({ length: safeLimit }, async () => {
        while (true) {
            const current = index;
            index += 1;
            if (current >= items.length)
                return;
            results[current] = await mapper(items[current]);
        }
    });
    await Promise.all(workers);
    return results;
}
async function fetchRemoteSnapshot(concurrency) {
    const metaRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'globalTerritorySnapshots', 'current');
    const metaSnap = await (0, firestore_1.getDoc)(metaRef);
    if (!metaSnap.exists())
        return emptySnapshot();
    const meta = metaSnap.data() ?? {};
    const chunksCount = Math.max(0, Math.floor(toNumber(meta.chunks ?? meta.chunksCount ?? 0)));
    const metaTerritories = Array.isArray(meta.territories) ? meta.territories : null;
    const chunkIds = Array.from({ length: chunksCount }, (_, i) => String(i));
    const chunks = chunksCount
        ? await mapWithConcurrency(chunkIds, concurrency, async (chunkId) => {
            const chunkRef = (0, firestore_1.doc)(firebaseConfig_1.db, 'globalTerritorySnapshots', 'current', 'chunks', chunkId);
            const chunkSnap = await (0, firestore_1.getDoc)(chunkRef);
            if (!chunkSnap.exists())
                return [];
            const data = chunkSnap.data() ?? {};
            return Array.isArray(data.territories) ? data.territories : [];
        })
        : [];
    const flat = chunksCount > 0 ? chunks.flat() : metaTerritories ?? [];
    const territories = flat
        .map((t) => normalizeTerritory(t))
        .filter((t) => !!t);
    const ownerIds = new Set(territories.map((t) => t.ownerId));
    const ownersCount = Number.isFinite(meta.ownersCount) ? Number(meta.ownersCount) : ownerIds.size;
    const territoriesCount = Number.isFinite(meta.territoriesCount)
        ? Number(meta.territoriesCount)
        : territories.length;
    return {
        schemaVersion: toNumber(meta.schemaVersion, 1),
        updatedAtMs: toMillis(meta.updatedAtMs ?? meta.updatedAt ?? 0),
        ownersCount,
        territoriesCount,
        bbox: normalizeBbox(meta.bbox),
        territories,
    };
}
async function loadGlobalSnapshotCached(opts) {
    const ttlMs = (opts?.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
    if (!opts?.force) {
        const cached = await readCache(ttlMs);
        if (cached)
            return cached;
    }
    try {
        const snapshot = await fetchRemoteSnapshot(opts?.concurrency ?? DEFAULT_CONCURRENCY);
        if (snapshot.territories.length > 0)
            await writeCache(snapshot);
        return snapshot;
    }
    catch {
        return emptySnapshot();
    }
}

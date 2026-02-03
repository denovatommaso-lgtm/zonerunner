import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();
const DEFAULT_CHUNK_SIZE = 200;
const LOCK_TTL_MS = 8 * 60 * 1000;

type RunLike = {
  id?: string;
  userId: string;
  route: Array<{ latitude: number; longitude: number }>;
  startedAt?: string;
  createdAt?: number;
};

function normalizeRoutePoint(point: any) {
  if (!point) return null;
  if (typeof point.latitude === 'number' && typeof point.longitude === 'number') {
    return { latitude: point.latitude, longitude: point.longitude };
  }
  if (Array.isArray(point) && point.length >= 2) {
    const first = Number(point[0]);
    const second = Number(point[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    const looksLikeLngLat = Math.abs(first) > 90 && Math.abs(second) <= 90;
    const longitude = looksLikeLngLat ? first : second;
    const latitude = looksLikeLngLat ? second : first;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }
  return null;
}

function normalizeRoute(rawRoute: any) {
  if (!Array.isArray(rawRoute)) return null;
  const normalized = rawRoute
    .map((p) => normalizeRoutePoint(p))
    .filter((p): p is { latitude: number; longitude: number } => !!p);
  return normalized.length >= 3 ? normalized : null;
}

function toRunLike(raw: any): RunLike | null {
  if (!raw) return null;
  const userId = (raw.userId ?? '').toString();
  if (!userId) return null;
  const route = normalizeRoute(raw.route);
  if (!route) return null;
  return {
    id: raw.id,
    userId,
    route,
    startedAt: raw.startedAt,
    createdAt: raw.createdAt,
  };
}

export const rebuildGlobalTerritorySnapshot = onSchedule(
  { schedule: '*/10 * * * *', timeZone: 'UTC' },
  async () => {
    (globalThis as any).__DEV__ = false;
    const startedAt = Date.now();
    const lockRef = db.doc('globalTerritorySnapshots/_lock');
    const lockBy = process.env.K_SERVICE ?? process.env.FUNCTION_TARGET ?? 'unknown';
    let acquired = false;

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(lockRef);
        const data = snap.exists ? snap.data() ?? {} : {};
        const lockedAtMs = Number(data.lockedAtMs ?? 0);
        if (lockedAtMs && Date.now() - lockedAtMs < LOCK_TTL_MS) {
          return;
        }
        tx.set(lockRef, { lockedAtMs: Date.now(), lockedBy }, { merge: true });
        acquired = true;
      });

      if (!acquired) {
        console.log('[SnapshotJob] skipped: lock held');
        return;
      }

      const { rebuildTerritoriesFromRuns, territoryAreaKm2 } = await import('../../lib/territoryEngine');

      const runsSnap = await db.collection('runs').get();
      const runs = runsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const runLikes = runs.map((r) => toRunLike(r)).filter((r): r is RunLike => !!r);
      if (!runLikes.length) {
        console.log('[SnapshotJob] no runs; skipping write');
        return;
      }

      const territories = rebuildTerritoriesFromRuns(runLikes);
      const territoryEntries = Array.from(territories.entries())
        .map(([ownerId, feature]) => {
          if (!feature) return null;
          return {
            ownerId,
            areaKm2: territoryAreaKm2(feature),
            geometryJson: JSON.stringify(feature),
          };
        })
        .filter((t): t is { ownerId: string; areaKm2: number; geometryJson: string } => !!t);

      const ownersCount = territories.size;
      const territoriesCount = territoryEntries.length;
      const updatedAtMs = Date.now();
      const chunkSize = Math.max(1, Math.floor(DEFAULT_CHUNK_SIZE));
      const chunks =
        territoryEntries.length > chunkSize
          ? Array.from({ length: Math.ceil(territoryEntries.length / chunkSize) }, (_, i) =>
              territoryEntries.slice(i * chunkSize, (i + 1) * chunkSize)
            )
          : [territoryEntries];

      const metaRef = db.doc('globalTerritorySnapshots/current');
      let batch = db.batch();
      let writes = 0;
      const commitBatch = async () => {
        if (!writes) return;
        await batch.commit();
        batch = db.batch();
        writes = 0;
      };

      batch.set(metaRef, {
        schemaVersion: 2,
        updatedAtMs,
        ownersCount,
        territoriesCount,
        chunksCount: chunks.length,
      });
      writes += 1;

      for (let idx = 0; idx < chunks.length; idx += 1) {
        const chunkRef = db.doc(`globalTerritorySnapshots/current/chunks/${idx}`);
        batch.set(chunkRef, { chunkId: String(idx), territories: chunks[idx] });
        writes += 1;
        if (writes >= 450) {
          await commitBatch();
        }
      }

      await commitBatch();
      console.log(
        `[SnapshotJob] runs=${runLikes.length} owners=${ownersCount} territories=${territoriesCount} durationMs=${
          Date.now() - startedAt
        }`
      );
    } catch (err) {
      console.error('[SnapshotJob] failed', err);
    } finally {
      if (acquired) {
        try {
          await lockRef.set({ lockedAtMs: 0, lockedBy: null }, { merge: true });
        } catch (e) {
          console.error('[SnapshotJob] failed to clear lock', e);
        }
      }
    }
  }
);

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import * as webpush from 'web-push';

initializeApp();

const db = getFirestore();
const DEFAULT_CHUNK_SIZE = 200;
const LOCK_TTL_MS = 8 * 60 * 1000;
const TERRITORY_DROP_THRESHOLD_KM2 = 0.01;
const TERRITORY_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@zonerunner.app';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

type RunLike = {
  id?: string;
  userId: string;
  route: Array<{ latitude: number; longitude: number }>;
  startedAt?: string;
  createdAt?: number;
};

type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
};

type NotificationPrefs = {
  pushEnabled?: boolean;
  localEnabled?: boolean;
  territoryStolen?: boolean;
  groupRunStarting?: boolean;
  friendRequest?: boolean;
};

const PUSH_COLLECTION = 'pushSubscriptions';
const USER_STATS_COLLECTION = 'userTerritoryStats';

function hashEndpoint(endpoint: string) {
  return crypto.createHash('sha1').update(endpoint).digest('hex');
}

async function verifyRequestAuth(req: any) {
  const header = req.headers?.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) throw new Error('Missing auth token');
  const token = match[1];
  return getAuth().verifyIdToken(token);
}

async function sendPushToUser(
  userId: string,
  payload: Record<string, unknown>
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys missing; skip send');
    return;
  }
  const snap = await db.collection(PUSH_COLLECTION).where('uid', '==', userId).get();
  if (snap.empty) return;
  const sendTasks: Promise<unknown>[] = [];
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as any;
    const sub = data.subscription as PushSubscriptionPayload | undefined;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return;
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    } as any;
    sendTasks.push(
      webpush.sendNotification(pushSub, JSON.stringify(payload)).catch((err) => {
        const statusCode = (err as any)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          return docSnap.ref.delete().catch(() => undefined);
        }
        console.error('[Push] send failed', err);
      })
    );
  });
  await Promise.all(sendTasks);
}

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

export const registerPushSubscription = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await verifyRequestAuth(req);
    const uid = decoded.uid;
    const subscription = (req.body?.subscription ?? null) as PushSubscriptionPayload | null;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).send('Invalid subscription');
      return;
    }
    const hash = hashEndpoint(subscription.endpoint);
    const docId = `${uid}_${hash}`;
    const ref = db.collection(PUSH_COLLECTION).doc(docId);
    await ref.set(
      {
        uid,
        subscription,
        updatedAt: Date.now(),
        userAgent: req.body?.client?.userAgent ?? null,
        platform: req.body?.client?.platform ?? null,
      },
      { merge: true }
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(401).send(e?.message ?? 'Unauthorized');
  }
});

export const unregisterPushSubscription = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await verifyRequestAuth(req);
    const uid = decoded.uid;
    const endpoint = req.body?.endpoint as string | undefined;
    if (!endpoint) {
      res.status(400).send('Missing endpoint');
      return;
    }
    const hash = hashEndpoint(endpoint);
    const docId = `${uid}_${hash}`;
    await db.collection(PUSH_COLLECTION).doc(docId).delete();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(401).send(e?.message ?? 'Unauthorized');
  }
});

export const notifyGroupRunStarting = onDocumentCreated(
  'groupActiveRuns/{groupId}',
  async (event) => {
    try {
      const snap = event.data;
      if (!snap?.exists) return;
      const data = snap.data() as any;
      const groupId = event.params.groupId as string;
      const startedBy = data?.startedBy as string | undefined;
      if (!groupId) return;

      const groupSnap = await db.doc(`groups/${groupId}`).get();
      const groupName = groupSnap.exists ? (groupSnap.data() as any)?.name ?? 'Your group' : 'Your group';

      const membersSnap = await db.collection('groupMemberships').where('groupId', '==', groupId).get();
      const memberIds = membersSnap.docs
        .map((d) => (d.data() as any)?.userId)
        .filter((id) => !!id && id !== startedBy);
      if (!memberIds.length) return;

      const memberRefs = memberIds.map((id) => db.doc(`users/${id}`));
      const memberDocs = await db.getAll(...memberRefs);
      const allowed = memberDocs
        .filter((d) => d.exists)
        .map((d) => ({ id: d.id, prefs: (d.data() as any)?.notificationPrefs as NotificationPrefs | undefined }))
        .filter((m) => m.prefs?.pushEnabled && m.prefs?.groupRunStarting)
        .map((m) => m.id);

      const payload = {
        title: 'Group run starting',
        body: `${groupName} just started a group run.`,
        tag: `group-run:${groupId}`,
        data: { url: '/', groupId, runId: snap.id },
      };

      for (const uid of allowed) {
        await sendPushToUser(uid, payload);
      }
    } catch (e) {
      console.error('[Push] failed to notify group run', e);
    }
  }
);

export const notifyFriendRequest = onDocumentCreated(
  'friendRequests/{requestId}',
  async (event) => {
    try {
      const snap = event.data;
      if (!snap?.exists) return;
      const data = snap.data() as any;
      const toUserId = (data?.toUserId ?? '').toString();
      const fromUserId = (data?.fromUserId ?? '').toString();
      if (!toUserId) return;

      const toUserSnap = await db.doc(`users/${toUserId}`).get();
      const prefs = (toUserSnap.data() as any)?.notificationPrefs as NotificationPrefs | undefined;
      if (!prefs?.pushEnabled || !prefs?.friendRequest) return;

      let fromDisplayName = data?.fromDisplayName as string | undefined;
      if (!fromDisplayName && fromUserId) {
        try {
          const fromUserSnap = await db.doc(`users/${fromUserId}`).get();
          if (fromUserSnap.exists) {
            fromDisplayName =
              (fromUserSnap.data() as any)?.displayName ??
              (fromUserSnap.data() as any)?.username ??
              'Someone';
          }
        } catch {
          // ignore
        }
      }

      const display = fromDisplayName || data?.fromUsername || 'Someone';
      await sendPushToUser(toUserId, {
        title: 'Friend request',
        body: `${display} sent you a friend request`,
        tag: `friend-request:${snap.id}`,
        data: { url: '/' },
      });
    } catch (e) {
      console.error('[Push] failed to notify friend request', e);
    }
  }
);

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

      const areaByOwner = new Map<string, number>();
      territoryEntries.forEach((entry) => {
        areaByOwner.set(entry.ownerId, (areaByOwner.get(entry.ownerId) ?? 0) + entry.areaKm2);
      });

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

      // Detect territory drops and notify owners (push) with cooldown.
      try {
        const ownerIds = Array.from(areaByOwner.keys());
        const ownerChunks =
          ownerIds.length > DEFAULT_CHUNK_SIZE
            ? Array.from({ length: Math.ceil(ownerIds.length / DEFAULT_CHUNK_SIZE) }, (_, i) =>
                ownerIds.slice(i * DEFAULT_CHUNK_SIZE, (i + 1) * DEFAULT_CHUNK_SIZE)
              )
            : [ownerIds];

        for (const chunkIds of ownerChunks) {
          if (!chunkIds.length) continue;
          const statRefs = chunkIds.map((id) => db.doc(`${USER_STATS_COLLECTION}/${id}`));
          const statDocs = await db.getAll(...statRefs);
          const now = Date.now();

          const notifyCandidates: Array<{ userId: string; dropKm2: number }> = [];
          const statsBatch = db.batch();

          statDocs.forEach((docSnap, idx) => {
            const userId = chunkIds[idx];
            const prevArea = Number((docSnap.data() as any)?.areaKm2 ?? 0) || 0;
            const lastNotifiedAt = Number((docSnap.data() as any)?.lastStolenNotifiedAtMs ?? 0) || 0;
            const nextArea = areaByOwner.get(userId) ?? 0;
            const dropKm2 = prevArea - nextArea;
            const shouldNotify =
              dropKm2 >= TERRITORY_DROP_THRESHOLD_KM2 &&
              now - lastNotifiedAt > TERRITORY_NOTIFY_COOLDOWN_MS;

            if (shouldNotify) {
              notifyCandidates.push({ userId, dropKm2 });
              statsBatch.set(
                docSnap.ref,
                { lastStolenNotifiedAtMs: now, areaKm2: nextArea, updatedAtMs: now },
                { merge: true }
              );
            } else {
              statsBatch.set(docSnap.ref, { areaKm2: nextArea, updatedAtMs: now }, { merge: true });
            }
          });

          await statsBatch.commit();

          if (notifyCandidates.length) {
            const userRefs = notifyCandidates.map((c) => db.doc(`users/${c.userId}`));
            const userDocs = await db.getAll(...userRefs);
            for (let i = 0; i < userDocs.length; i += 1) {
              const userDoc = userDocs[i];
              const candidate = notifyCandidates[i];
              const prefs = (userDoc.data() as any)?.notificationPrefs as NotificationPrefs | undefined;
              if (!prefs?.pushEnabled || !prefs?.territoryStolen) continue;
              await sendPushToUser(candidate.userId, {
                title: 'Territory stolen',
                body: `You lost ${candidate.dropKm2.toFixed(2)} km² of territory.`,
                tag: 'territory-stolen',
                data: { url: '/', dropKm2: candidate.dropKm2 },
              });
            }
          }
        }
      } catch (e) {
        console.error('[SnapshotJob] failed to notify territory drops', e);
      }
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

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebuildGlobalTerritorySnapshot = exports.notifyFriendRequest = exports.notifyGroupRunStarting = exports.sendTestPush = exports.unregisterPushSubscription = exports.registerPushSubscription = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const auth_1 = require("firebase-admin/auth");
const params_1 = require("firebase-functions/params");
const crypto_1 = __importDefault(require("crypto"));
const webpush = __importStar(require("web-push"));
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const DEFAULT_CHUNK_SIZE = 200;
const LOCK_TTL_MS = 8 * 60 * 1000;
const TERRITORY_DROP_THRESHOLD_KM2 = 0.01;
const TERRITORY_NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const VAPID_PUBLIC_KEY = (0, params_1.defineSecret)('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = (0, params_1.defineSecret)('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = (0, params_1.defineSecret)('VAPID_SUBJECT');
let vapidReady = false;
function ensureVapidConfigured() {
    if (vapidReady)
        return true;
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:support@zonerunner.app';
    if (!pub || !priv) {
        console.warn('[Push] VAPID keys missing; skip send');
        return false;
    }
    webpush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
    return true;
}
const PUSH_COLLECTION = 'pushSubscriptions';
const USER_STATS_COLLECTION = 'userTerritoryStats';
function hashEndpoint(endpoint) {
    return crypto_1.default.createHash('sha1').update(endpoint).digest('hex');
}
async function verifyRequestAuth(req) {
    const header = req.headers?.authorization || '';
    const match = header.match(/^Bearer (.+)$/i);
    if (!match)
        throw new Error('Missing auth token');
    const token = match[1];
    return (0, auth_1.getAuth)().verifyIdToken(token);
}
async function sendPushToUser(userId, payload) {
    if (!ensureVapidConfigured()) {
        return;
    }
    const snap = await db.collection(PUSH_COLLECTION).where('uid', '==', userId).get();
    if (snap.empty)
        return;
    const sendTasks = [];
    snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const sub = data.subscription;
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth)
            return;
        const pushSub = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
            },
        };
        sendTasks.push(webpush.sendNotification(pushSub, JSON.stringify(payload)).catch((err) => {
            const statusCode = err?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                return docSnap.ref.delete().catch(() => undefined);
            }
            console.error('[Push] send failed', err);
        }));
    });
    await Promise.all(sendTasks);
}
function normalizeRoutePoint(point) {
    if (!point)
        return null;
    if (typeof point.latitude === 'number' && typeof point.longitude === 'number') {
        return { latitude: point.latitude, longitude: point.longitude };
    }
    if (Array.isArray(point) && point.length >= 2) {
        const first = Number(point[0]);
        const second = Number(point[1]);
        if (!Number.isFinite(first) || !Number.isFinite(second))
            return null;
        const looksLikeLngLat = Math.abs(first) > 90 && Math.abs(second) <= 90;
        const longitude = looksLikeLngLat ? first : second;
        const latitude = looksLikeLngLat ? second : first;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
            return null;
        return { latitude, longitude };
    }
    return null;
}
function normalizeRoute(rawRoute) {
    if (!Array.isArray(rawRoute))
        return null;
    const normalized = rawRoute
        .map((p) => normalizeRoutePoint(p))
        .filter((p) => !!p);
    return normalized.length >= 3 ? normalized : null;
}
function toRunLike(raw) {
    if (!raw)
        return null;
    const userId = (raw.userId ?? '').toString();
    if (!userId)
        return null;
    const route = normalizeRoute(raw.route);
    if (!route)
        return null;
    return {
        id: raw.id,
        userId,
        route,
        startedAt: raw.startedAt,
        createdAt: raw.createdAt,
    };
}
exports.registerPushSubscription = (0, https_1.onRequest)({ cors: true, secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] }, async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }
        const decoded = await verifyRequestAuth(req);
        const uid = decoded.uid;
        const subscription = (req.body?.subscription ?? null);
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            res.status(400).send('Invalid subscription');
            return;
        }
        const hash = hashEndpoint(subscription.endpoint);
        const docId = `${uid}_${hash}`;
        const ref = db.collection(PUSH_COLLECTION).doc(docId);
        await ref.set({
            uid,
            subscription,
            updatedAt: Date.now(),
            userAgent: req.body?.client?.userAgent ?? null,
            platform: req.body?.client?.platform ?? null,
        }, { merge: true });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(401).send(e?.message ?? 'Unauthorized');
    }
});
exports.unregisterPushSubscription = (0, https_1.onRequest)({ cors: true, secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] }, async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }
        const decoded = await verifyRequestAuth(req);
        const uid = decoded.uid;
        const endpoint = req.body?.endpoint;
        if (!endpoint) {
            res.status(400).send('Missing endpoint');
            return;
        }
        const hash = hashEndpoint(endpoint);
        const docId = `${uid}_${hash}`;
        await db.collection(PUSH_COLLECTION).doc(docId).delete();
        res.json({ ok: true });
    }
    catch (e) {
        res.status(401).send(e?.message ?? 'Unauthorized');
    }
});
exports.sendTestPush = (0, https_1.onRequest)({ cors: true, secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] }, async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }
        const decoded = await verifyRequestAuth(req);
        const uid = decoded.uid;
        const userSnap = await db.doc(`users/${uid}`).get();
        const prefs = userSnap.data()?.notificationPrefs;
        if (!prefs?.pushEnabled) {
            res.status(400).send('Push notifications are disabled');
            return;
        }
        await sendPushToUser(uid, {
            title: 'Test push',
            body: 'Push notifications are working.',
            tag: 'test-push',
            data: { url: '/' },
        });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(401).send(e?.message ?? 'Unauthorized');
    }
});
exports.notifyGroupRunStarting = (0, firestore_2.onDocumentCreated)({ document: 'groupActiveRuns/{groupId}', secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] }, async (event) => {
    try {
        const snap = event.data;
        if (!snap?.exists)
            return;
        const data = snap.data();
        const groupId = event.params.groupId;
        const startedBy = data?.startedBy;
        if (!groupId)
            return;
        const groupSnap = await db.doc(`groups/${groupId}`).get();
        const groupName = groupSnap.exists ? groupSnap.data()?.name ?? 'Your group' : 'Your group';
        const membersSnap = await db.collection('groupMemberships').where('groupId', '==', groupId).get();
        const memberIds = membersSnap.docs
            .map((d) => d.data()?.userId)
            .filter((id) => !!id && id !== startedBy);
        if (!memberIds.length)
            return;
        const memberRefs = memberIds.map((id) => db.doc(`users/${id}`));
        const memberDocs = await db.getAll(...memberRefs);
        const allowed = memberDocs
            .filter((d) => d.exists)
            .map((d) => ({ id: d.id, prefs: d.data()?.notificationPrefs }))
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
    }
    catch (e) {
        console.error('[Push] failed to notify group run', e);
    }
});
exports.notifyFriendRequest = (0, firestore_2.onDocumentCreated)({ document: 'friendRequests/{requestId}', secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] }, async (event) => {
    try {
        const snap = event.data;
        if (!snap?.exists)
            return;
        const data = snap.data();
        const toUserId = (data?.toUserId ?? '').toString();
        const fromUserId = (data?.fromUserId ?? '').toString();
        if (!toUserId)
            return;
        const toUserSnap = await db.doc(`users/${toUserId}`).get();
        const prefs = toUserSnap.data()?.notificationPrefs;
        if (!prefs?.pushEnabled || !prefs?.friendRequest)
            return;
        let fromDisplayName = data?.fromDisplayName;
        if (!fromDisplayName && fromUserId) {
            try {
                const fromUserSnap = await db.doc(`users/${fromUserId}`).get();
                if (fromUserSnap.exists) {
                    fromDisplayName =
                        fromUserSnap.data()?.displayName ??
                            fromUserSnap.data()?.username ??
                            'Someone';
                }
            }
            catch {
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
    }
    catch (e) {
        console.error('[Push] failed to notify friend request', e);
    }
});
exports.rebuildGlobalTerritorySnapshot = (0, scheduler_1.onSchedule)({
    schedule: '*/10 * * * *',
    timeZone: 'UTC',
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT],
}, async () => {
    globalThis.__DEV__ = false;
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
            tx.set(lockRef, { lockedAtMs: Date.now(), lockedBy: lockBy }, { merge: true });
            acquired = true;
        });
        if (!acquired) {
            console.log('[SnapshotJob] skipped: lock held');
            return;
        }
        const { rebuildTerritoriesFromRuns, territoryAreaKm2 } = await Promise.resolve().then(() => __importStar(require('../../lib/territoryEngine')));
        const runsSnap = await db.collection('runs').get();
        const runs = runsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const runLikes = runs.map((r) => toRunLike(r)).filter((r) => !!r);
        if (!runLikes.length) {
            console.log('[SnapshotJob] no runs; skipping write');
            return;
        }
        const territories = rebuildTerritoriesFromRuns(runLikes);
        const territoryEntries = Array.from(territories.entries())
            .map(([ownerId, feature]) => {
            if (!feature)
                return null;
            return {
                ownerId,
                areaKm2: territoryAreaKm2(feature),
                geometryJson: JSON.stringify(feature),
            };
        })
            .filter((t) => !!t);
        const areaByOwner = new Map();
        territoryEntries.forEach((entry) => {
            areaByOwner.set(entry.ownerId, (areaByOwner.get(entry.ownerId) ?? 0) + entry.areaKm2);
        });
        const ownersCount = territories.size;
        const territoriesCount = territoryEntries.length;
        const updatedAtMs = Date.now();
        const chunkSize = Math.max(1, Math.floor(DEFAULT_CHUNK_SIZE));
        const chunks = territoryEntries.length > chunkSize
            ? Array.from({ length: Math.ceil(territoryEntries.length / chunkSize) }, (_, i) => territoryEntries.slice(i * chunkSize, (i + 1) * chunkSize))
            : [territoryEntries];
        const metaRef = db.doc('globalTerritorySnapshots/current');
        let batch = db.batch();
        let writes = 0;
        const commitBatch = async () => {
            if (!writes)
                return;
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
            const ownerChunks = ownerIds.length > DEFAULT_CHUNK_SIZE
                ? Array.from({ length: Math.ceil(ownerIds.length / DEFAULT_CHUNK_SIZE) }, (_, i) => ownerIds.slice(i * DEFAULT_CHUNK_SIZE, (i + 1) * DEFAULT_CHUNK_SIZE))
                : [ownerIds];
            for (const chunkIds of ownerChunks) {
                if (!chunkIds.length)
                    continue;
                const statRefs = chunkIds.map((id) => db.doc(`${USER_STATS_COLLECTION}/${id}`));
                const statDocs = await db.getAll(...statRefs);
                const now = Date.now();
                const notifyCandidates = [];
                const statsBatch = db.batch();
                statDocs.forEach((docSnap, idx) => {
                    const userId = chunkIds[idx];
                    const prevArea = Number(docSnap.data()?.areaKm2 ?? 0) || 0;
                    const lastNotifiedAt = Number(docSnap.data()?.lastStolenNotifiedAtMs ?? 0) || 0;
                    const nextArea = areaByOwner.get(userId) ?? 0;
                    const dropKm2 = prevArea - nextArea;
                    const shouldNotify = dropKm2 >= TERRITORY_DROP_THRESHOLD_KM2 &&
                        now - lastNotifiedAt > TERRITORY_NOTIFY_COOLDOWN_MS;
                    if (shouldNotify) {
                        notifyCandidates.push({ userId, dropKm2 });
                        statsBatch.set(docSnap.ref, { lastStolenNotifiedAtMs: now, areaKm2: nextArea, updatedAtMs: now }, { merge: true });
                    }
                    else {
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
                        const prefs = userDoc.data()?.notificationPrefs;
                        if (!prefs?.pushEnabled || !prefs?.territoryStolen)
                            continue;
                        await sendPushToUser(candidate.userId, {
                            title: 'Territory stolen',
                            body: `You lost ${candidate.dropKm2.toFixed(2)} km² of territory.`,
                            tag: 'territory-stolen',
                            data: { url: '/', dropKm2: candidate.dropKm2 },
                        });
                    }
                }
            }
        }
        catch (e) {
            console.error('[SnapshotJob] failed to notify territory drops', e);
        }
        console.log(`[SnapshotJob] runs=${runLikes.length} owners=${ownersCount} territories=${territoriesCount} durationMs=${Date.now() - startedAt}`);
    }
    catch (err) {
        console.error('[SnapshotJob] failed', err);
    }
    finally {
        if (acquired) {
            try {
                await lockRef.set({ lockedAtMs: 0, lockedBy: null }, { merge: true });
            }
            catch (e) {
                console.error('[SnapshotJob] failed to clear lock', e);
            }
        }
    }
});

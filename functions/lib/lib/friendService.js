"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFriendRequest = sendFriendRequest;
exports.loadIncomingFriendRequests = loadIncomingFriendRequests;
exports.respondToFriendRequest = respondToFriendRequest;
exports.loadFriends = loadFriends;
exports.hydrateFriendProfiles = hydrateFriendProfiles;
exports.removeFriend = removeFriend;
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const monthlyChallengesService_1 = require("./monthlyChallengesService");
const perfLogger_1 = require("./perfLogger");
const usersCol = (0, firestore_1.collection)(firebaseConfig_1.db, "users");
const friendRequestsCol = (0, firestore_1.collection)(firebaseConfig_1.db, "friendRequests");
const loadFriendsInFlight = new Map();
async function findUserByUsernameLower(usernameLower) {
    // Try case-insensitive match via stored lowercase field
    let snap = await (0, firestore_1.getDocs)((0, firestore_1.query)(usersCol, (0, firestore_1.where)("usernameLower", "==", usernameLower), (0, firestore_1.limit)(1)));
    if (!snap.empty) {
        const docSnap = snap.docs[0];
        return { id: docSnap.id, ...docSnap.data() };
    }
    // Fallback: some older profiles might not have usernameLower; try direct username match
    snap = await (0, firestore_1.getDocs)((0, firestore_1.query)(usersCol, (0, firestore_1.where)("username", "==", usernameLower), (0, firestore_1.limit)(1)));
    if (!snap.empty) {
        const docSnap = snap.docs[0];
        return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
}
async function sendFriendRequest(fromUserId, fromUsername, toUsername) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "FriendService",
        phase: "DATA",
        label: "sendFriendRequest",
        meta: { fromUserId, toUsername },
    });
    const desiredRaw = toUsername.trim();
    const desired = desiredRaw.toLowerCase();
    if (!desiredRaw) {
        throw new Error("Username required");
    }
    // Support calling this with a userId (some UI paths pass an id rather than a username).
    // Prefer direct user doc lookup first; fallback to username lookup.
    let target = null;
    try {
        const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", desiredRaw));
        if (snap.exists()) {
            target = { id: snap.id, ...snap.data() };
        }
    }
    catch {
        // ignore
    }
    if (!target) {
        target = await findUserByUsernameLower(desired);
    }
    if (!target) {
        throw new Error("No user found with that username.");
    }
    if (target.id === fromUserId) {
        throw new Error("You cannot add yourself.");
    }
    // Enforce "only one outgoing pending request per (from -> to)".
    // If the user tries to send again, cancel the existing request instead of duplicating.
    const existingPending = await (0, firestore_1.getDocs)((0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("fromUserId", "==", fromUserId), (0, firestore_1.where)("toUserId", "==", target.id), (0, firestore_1.where)("status", "==", "pending")));
    if (!existingPending.empty) {
        await Promise.all(existingPending.docs.map((d) => (0, firestore_1.deleteDoc)(d.ref)));
        endPerf({ action: "cancelled" });
        return { action: "cancelled", toUserId: target.id };
    }
    const requestId = `${fromUserId}_${target.id}`;
    await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "friendRequests", requestId), {
        fromUserId,
        fromUsername,
        toUserId: target.id,
        toUsername: target.username ?? target.displayName ?? target.email ?? "",
        participants: [fromUserId, target.id],
        status: "pending",
        createdAt: Date.now(),
    }, { merge: false });
    endPerf({ action: "sent" });
    return { action: "sent", toUserId: target.id, requestId };
}
async function loadIncomingFriendRequests(userId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "FriendService",
        phase: "DATA",
        label: "loadIncomingFriendRequests",
        meta: { userId },
    });
    const snap = await (0, firestore_1.getDocs)((0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("toUserId", "==", userId), (0, firestore_1.where)("status", "==", "pending")));
    const docs = snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
        };
    });
    // Hydrate display names for senders
    const withNames = await Promise.all(docs.map(async (req) => {
        if (!req.fromUserId)
            return req;
        try {
            const userSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", req.fromUserId));
            if (userSnap.exists()) {
                const data = userSnap.data();
                return {
                    ...req,
                    fromDisplayName: data.displayName,
                    fromUsername: req.fromUsername ?? data.username,
                };
            }
        }
        catch {
            // ignore
        }
        return req;
    }));
    endPerf({ count: withNames.length, bytes: (0, perfLogger_1.perfBytes)(withNames) });
    return withNames;
}
async function respondToFriendRequest(requestId, status) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "FriendService",
        phase: "DATA",
        label: "respondToFriendRequest",
        meta: { requestId, status },
    });
    const ref = (0, firestore_1.doc)(firebaseConfig_1.db, "friendRequests", requestId);
    // Ensure participants array exists for older docs so both sides see the friendship
    const snap = await (0, firestore_1.getDocs)((0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("__name__", "==", requestId), (0, firestore_1.limit)(1)));
    let participants = undefined;
    if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data.fromUserId && data.toUserId) {
            participants = [data.fromUserId, data.toUserId];
        }
    }
    const acceptedAt = status === "accepted" ? Date.now() : undefined;
    await (0, firestore_1.updateDoc)(ref, { status, ...(participants ? { participants } : {}), ...(acceptedAt ? { acceptedAt } : {}) });
    // Monthly friends challenge (best-effort; never block the friend accept flow).
    if (status === "accepted" && participants?.length === 2 && acceptedAt) {
        const [a, b] = participants;
        const eventA = `friendRequest:${requestId}:${a}`;
        const eventB = `friendRequest:${requestId}:${b}`;
        monthlyChallengesService_1.MonthlyChallengesService.ingestFriendAdded({ userId: a, eventId: eventA, acceptedAt }).catch(() => { });
        monthlyChallengesService_1.MonthlyChallengesService.ingestFriendAdded({ userId: b, eventId: eventB, acceptedAt }).catch(() => { });
    }
    endPerf({ participants: participants?.length ?? 0 });
}
async function loadFriends(userId) {
    const existing = loadFriendsInFlight.get(userId);
    if (existing)
        return existing;
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "FriendService",
        phase: "DATA",
        label: "loadFriends",
        meta: { userId },
    });
    const promise = (async () => {
        const acceptedWithParticipants = await (0, firestore_1.getDocs)((0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("status", "==", "accepted"), (0, firestore_1.where)("participants", "array-contains", userId)));
        // Fallback for older docs without participants field
        const sentAccepted = await (0, firestore_1.getDocs)((0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("status", "==", "accepted"), (0, firestore_1.where)("fromUserId", "==", userId)));
        const receivedAccepted = await (0, firestore_1.getDocs)((0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("status", "==", "accepted"), (0, firestore_1.where)("toUserId", "==", userId)));
        const allDocs = [
            ...acceptedWithParticipants.docs,
            ...sentAccepted.docs,
            ...receivedAccepted.docs,
        ];
        const seenDocs = new Set();
        const byOther = {};
        for (const d of allDocs) {
            if (seenDocs.has(d.id))
                continue;
            seenDocs.add(d.id);
            const data = d.data();
            const otherId = data.fromUserId === userId ? data.toUserId : data.fromUserId;
            const otherUsername = data.fromUserId === userId ? data.toUsername : data.fromUsername;
            const areaKm2 = data.areaKm2 ?? 0;
            const distanceKm = data.distanceKm ?? 0;
            const createdAt = typeof data.createdAt === "number" ? data.createdAt : Date.now();
            if (!otherId)
                continue;
            const existing = byOther[otherId];
            if (!existing || createdAt < existing.createdAt) {
                byOther[otherId] = {
                    id: d.id,
                    otherUserId: otherId,
                    otherUsername,
                    createdAt,
                    areaKm2,
                    distanceKm,
                };
            }
        }
        const results = Object.values(byOther);
        endPerf({ count: results.length, bytes: (0, perfLogger_1.perfBytes)(results) });
        return results;
    })();
    loadFriendsInFlight.set(userId, promise);
    try {
        return await promise;
    }
    finally {
        loadFriendsInFlight.delete(userId);
    }
}
async function hydrateFriendProfiles(entries) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "FriendService",
        phase: "DATA",
        label: "hydrateFriendProfiles",
        meta: { count: entries.length },
    });
    if (!entries.length) {
        endPerf({ count: 0 });
        return [];
    }
    const results = await Promise.all(entries.map(async (f) => {
        const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", f.otherUserId));
        const data = snap.exists() ? snap.data() : {};
        return {
            ...f,
            id: f.id ?? `${f.otherUserId}-${f.createdAt}`,
            displayName: data.displayName,
            avatarUrl: data.avatarUrl,
            bannerUrl: data.bannerUrl,
            territoryColor: data.territoryColor,
            areaKm2: f.areaKm2,
            distanceKm: f.distanceKm,
            selectedMedals: data?.selectedMedals ?? [],
        };
    }));
    endPerf({ count: results.length, bytes: (0, perfLogger_1.perfBytes)(results) });
    return results;
}
async function removeFriend(currentUserId, otherUserId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "FriendService",
        phase: "DATA",
        label: "removeFriend",
        meta: { currentUserId, otherUserId },
    });
    // Remove any accepted friendRequest docs that tie these two users together
    const queries = [
        (0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("status", "==", "accepted"), (0, firestore_1.where)("participants", "array-contains", currentUserId)),
        (0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("status", "==", "accepted"), (0, firestore_1.where)("fromUserId", "==", currentUserId), (0, firestore_1.where)("toUserId", "==", otherUserId)),
        (0, firestore_1.query)(friendRequestsCol, (0, firestore_1.where)("status", "==", "accepted"), (0, firestore_1.where)("fromUserId", "==", otherUserId), (0, firestore_1.where)("toUserId", "==", currentUserId)),
    ];
    const toDelete = [];
    for (const q of queries) {
        const snap = await (0, firestore_1.getDocs)(q);
        snap.docs.forEach((d) => {
            const data = d.data();
            if ((data.participants &&
                data.participants.includes(currentUserId) &&
                data.participants.includes(otherUserId)) ||
                (data.fromUserId === currentUserId && data.toUserId === otherUserId) ||
                (data.fromUserId === otherUserId && data.toUserId === currentUserId)) {
                toDelete.push(d.id);
            }
        });
    }
    await Promise.all(toDelete.map((id) => (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "friendRequests", id))));
    endPerf({ removed: toDelete.length });
}

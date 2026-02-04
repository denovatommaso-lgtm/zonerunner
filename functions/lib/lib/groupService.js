"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeGroupsForUser = subscribeGroupsForUser;
exports.listGroupsForUser = listGroupsForUser;
exports.joinGroupWithCode = joinGroupWithCode;
exports.createGroup = createGroup;
exports.countAllGroups = countAllGroups;
exports.listAllGroups = listAllGroups;
exports.listGroupRuns = listGroupRuns;
exports.getGroupStats = getGroupStats;
exports.getUserGroupStats = getUserGroupStats;
exports.getGroupById = getGroupById;
exports.getMembershipsForUser = getMembershipsForUser;
exports.leaveGroup = leaveGroup;
exports.sendGroupInvite = sendGroupInvite;
exports.listGroupInvitesForUser = listGroupInvitesForUser;
exports.acceptGroupInvite = acceptGroupInvite;
exports.declineGroupInvite = declineGroupInvite;
exports.getActiveGroupRun = getActiveGroupRun;
exports.subscribeActiveGroupRun = subscribeActiveGroupRun;
exports.startActiveGroupRun = startActiveGroupRun;
exports.joinActiveGroupRun = joinActiveGroupRun;
exports.endActiveGroupRun = endActiveGroupRun;
exports.setMemberRole = setMemberRole;
exports.removeMember = removeMember;
exports.deleteGroup = deleteGroup;
exports.listMembersForGroup = listMembersForGroup;
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const currentAreas_1 = require("./utils/currentAreas");
const perfLogger_1 = require("./perfLogger");
const groupsCol = (0, firestore_1.collection)(firebaseConfig_1.db, "groups");
const membershipsCol = (0, firestore_1.collection)(firebaseConfig_1.db, "groupMemberships"); // flat collection: { userId, groupId, role, joinedAt }
const runsCol = (0, firestore_1.collection)(firebaseConfig_1.db, "runs");
const groupInvitesCol = (0, firestore_1.collection)(firebaseConfig_1.db, "groupInvites");
const groupActiveRunsCol = (0, firestore_1.collection)(firebaseConfig_1.db, "groupActiveRuns");
function generateJoinCode() {
    return `G-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
function parseGroupRunType(value) {
    if (value === 'casual' || value === 'official')
        return value;
    return undefined;
}
function normalizeRunDoc(data, id) {
    const raw = (data && typeof data === 'object' ? data : {});
    const rawMode = raw.mode;
    const mode = rawMode === 'personal' || rawMode === 'group'
        ? rawMode
        : raw.groupId
            ? 'group'
            : raw.userId
                ? 'personal'
                : undefined;
    if (__DEV__ && rawMode !== undefined && rawMode !== 'personal' && rawMode !== 'group') {
        throw new Error(`[GroupService] Invalid mode value for run ${id}: ${String(rawMode)}`);
    }
    const groupRunType = parseGroupRunType(raw.groupRunType) ?? (raw.groupId ? 'official' : undefined);
    const base = raw;
    return {
        ...base,
        id,
        mode,
        scope: mode,
        groupRunType,
    };
}
async function getGroupDoc(groupId) {
    const ref = (0, firestore_1.doc)(firebaseConfig_1.db, "groups", groupId);
    const snap = await (0, firestore_1.getDoc)(ref);
    if (!snap.exists())
        return undefined;
    return { id: snap.id, ...snap.data() };
}
function subscribeGroupsForUser(userId, onChange) {
    const q = (0, firestore_1.query)(membershipsCol, (0, firestore_1.where)("userId", "==", userId));
    return (0, firestore_1.onSnapshot)(q, async (snap) => {
        (0, perfLogger_1.perfLog)({
            screen: "GroupService",
            phase: "DATA",
            label: "subscribeGroupsForUser snapshot",
            durationMs: 0,
            meta: { userId, count: snap.size },
        });
        const groupIds = snap.docs.map((d) => d.data().groupId);
        if (!groupIds.length) {
            onChange([]);
            return;
        }
        const groups = [];
        for (const gid of groupIds) {
            const g = await getGroupDoc(gid);
            if (g)
                groups.push(g);
        }
        onChange(groups);
    });
}
async function listGroupsForUser(userId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "listGroupsForUser",
        meta: { userId },
    });
    const q = (0, firestore_1.query)(membershipsCol, (0, firestore_1.where)("userId", "==", userId));
    const membershipSnap = await (0, firestore_1.getDocs)(q);
    const groupIds = membershipSnap.docs.map((d) => d.data().groupId);
    if (!groupIds.length) {
        endPerf({ count: 0 });
        return [];
    }
    const groups = [];
    for (const gid of groupIds) {
        const g = await getGroupDoc(gid);
        if (g)
            groups.push(g);
    }
    endPerf({ count: groups.length, bytes: (0, perfLogger_1.perfBytes)(groups) });
    return groups;
}
async function joinGroupWithCode(userId, code) {
    const trimmed = code.trim();
    // Accept both raw code and code with/without "G-" prefix, case-insensitive
    const normalized = trimmed.toUpperCase().startsWith("G-")
        ? trimmed.toUpperCase()
        : `G-${trimmed.toUpperCase()}`;
    const q = (0, firestore_1.query)(groupsCol, (0, firestore_1.where)("joinCode", "==", normalized), (0, firestore_1.limit)(1));
    const snap = await (0, firestore_1.getDocs)(q);
    if (snap.empty)
        throw new Error("Invalid ID");
    const group = { id: snap.docs[0].id, ...snap.docs[0].data() };
    // Upsert membership
    const memberDoc = (0, firestore_1.doc)(membershipsCol, `${group.id}_${userId}`);
    await (0, firestore_1.setDoc)(memberDoc, {
        userId,
        groupId: group.id,
        role: "member",
        joinedAt: Date.now(),
    });
    return group;
}
async function createGroup(userId, name, color) {
    const joinCode = generateJoinCode();
    const group = {
        name,
        color,
        ownerId: userId,
        createdAt: Date.now(),
        description: "",
        allowMemberCasualRuns: true,
        allowMemberOfficialRuns: false,
    };
    const created = await (0, firestore_1.addDoc)(groupsCol, { ...group, joinCode });
    const groupId = created.id;
    // Owner membership
    const memberDoc = (0, firestore_1.doc)(membershipsCol, `${groupId}_${userId}`);
    await (0, firestore_1.setDoc)(memberDoc, {
        userId,
        groupId,
        role: "owner",
        joinedAt: Date.now(),
    });
    return { id: groupId, ...group, joinCode };
}
async function countAllGroups() {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "countAllGroups",
    });
    const snap = await (0, firestore_1.getDocs)(groupsCol);
    endPerf({ count: snap.size });
    return snap.size;
}
async function listAllGroups() {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "listAllGroups",
    });
    const snap = await (0, firestore_1.getDocs)(groupsCol);
    const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    endPerf({ count: groups.length, bytes: (0, perfLogger_1.perfBytes)(groups) });
    return groups;
}
async function listGroupRuns(groupId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "listGroupRuns",
        meta: { groupId },
    });
    const q = (0, firestore_1.query)(runsCol, (0, firestore_1.where)("groupId", "==", groupId));
    const snap = await (0, firestore_1.getDocs)(q);
    const runs = snap.docs.map((d) => normalizeRunDoc(d.data(), d.id));
    endPerf({ count: runs.length, bytes: (0, perfLogger_1.perfBytes)(runs) });
    return runs;
}
async function getGroupStats(groupId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "getGroupStats",
        meta: { groupId },
    });
    const runs = await listGroupRuns(groupId);
    const official = runs.filter((r) => r.groupRunType === 'official');
    const totalDistanceKm = official.reduce((s, r) => s + (r.distance || 0) / 1000, 0);
    const areaEndPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "computeCurrentAreasFromRuns",
        meta: { groupId, runs: official.length },
    });
    const areaMap = (0, currentAreas_1.computeCurrentAreasFromRuns)(official, { mode: 'group', activeGroupId: groupId });
    areaEndPerf({ owners: areaMap.size });
    const totalAreaKm2 = areaMap.get(groupId) ?? 0;
    const membersSnap = await (0, firestore_1.getDocs)((0, firestore_1.query)(membershipsCol, (0, firestore_1.where)("groupId", "==", groupId)));
    endPerf({
        runs: official.length,
        memberCount: membersSnap.size,
        areaKm2: totalAreaKm2,
    });
    return {
        groupId,
        totalDistanceKm,
        totalAreaKm2,
        totalRuns: official.length,
        memberCount: membersSnap.size,
    };
}
async function getUserGroupStats(userId, groupId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "getUserGroupStats",
        meta: { userId, groupId },
    });
    const q = (0, firestore_1.query)(runsCol, (0, firestore_1.where)("groupId", "==", groupId), (0, firestore_1.where)("userId", "==", userId));
    const snap = await (0, firestore_1.getDocs)(q);
    const runs = snap.docs.map((d) => normalizeRunDoc(d.data(), d.id));
    const official = runs.filter((r) => r.groupRunType === 'official');
    const distanceKm = official.reduce((s, r) => s + (r.distance || 0) / 1000, 0);
    const areaEndPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "computeCurrentAreasFromRuns",
        meta: { groupId, runs: official.length, userId },
    });
    const areaMap = (0, currentAreas_1.computeCurrentAreasFromRuns)(official, { mode: 'group', activeGroupId: groupId });
    areaEndPerf({ owners: areaMap.size });
    const areaKm2 = areaMap.get(groupId) ?? 0;
    endPerf({
        runs: official.length,
        areaKm2,
    });
    return {
        userId,
        groupId,
        distanceKm,
        areaKm2,
        runs: official.length,
    };
}
async function getGroupById(id) {
    return getGroupDoc(id);
}
async function getMembershipsForUser(userId) {
    const q = (0, firestore_1.query)(membershipsCol, (0, firestore_1.where)("userId", "==", userId));
    const snap = await (0, firestore_1.getDocs)(q);
    return snap.docs.map((d) => d.data());
}
async function leaveGroup(userId, groupId) {
    const memberDoc = (0, firestore_1.doc)(membershipsCol, `${groupId}_${userId}`);
    await (0, firestore_1.deleteDoc)(memberDoc);
}
async function sendGroupInvite(fromUserId, toUserId, groupId) {
    await (0, firestore_1.addDoc)(groupInvitesCol, {
        fromUserId,
        toUserId,
        groupId,
        createdAt: Date.now(),
        status: "pending",
    });
}
async function listGroupInvitesForUser(userId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "listGroupInvitesForUser",
        meta: { userId },
    });
    const snap = await (0, firestore_1.getDocs)((0, firestore_1.query)(groupInvitesCol, (0, firestore_1.where)("toUserId", "==", userId), (0, firestore_1.where)("status", "==", "pending")));
    const invites = [];
    for (const d of snap.docs) {
        const data = d.data();
        const group = await getGroupDoc(data.groupId);
        let fromUsername;
        let fromDisplayName;
        try {
            const userSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", data.fromUserId));
            if (userSnap.exists()) {
                const u = userSnap.data();
                fromUsername = u.username ?? u.usernameLower;
                fromDisplayName = u.displayName ?? u.username ?? u.email;
            }
        }
        catch {
            // ignore
        }
        invites.push({
            id: d.id,
            ...data,
            group,
            fromUsername,
            fromDisplayName,
        });
    }
    endPerf({ count: invites.length, bytes: (0, perfLogger_1.perfBytes)(invites) });
    return invites;
}
async function acceptGroupInvite(inviteId, userId) {
    const ref = (0, firestore_1.doc)(groupInvitesCol, inviteId);
    const snap = await (0, firestore_1.getDoc)(ref);
    if (!snap.exists())
        throw new Error("Invite not found");
    const data = snap.data();
    const groupId = data.groupId;
    const membershipRef = (0, firestore_1.doc)(membershipsCol, `${groupId}_${userId}`);
    await (0, firestore_1.setDoc)(membershipRef, { userId, groupId, role: "member", joinedAt: Date.now() }, { merge: true });
    await (0, firestore_1.deleteDoc)(ref);
}
async function declineGroupInvite(inviteId) {
    const ref = (0, firestore_1.doc)(groupInvitesCol, inviteId);
    await (0, firestore_1.deleteDoc)(ref);
}
async function getActiveGroupRun(groupId) {
    const ref = (0, firestore_1.doc)(groupActiveRunsCol, groupId);
    const snap = await (0, firestore_1.getDoc)(ref);
    if (!snap.exists())
        return null;
    const data = snap.data();
    return {
        id: snap.id,
        groupId: data.groupId,
        startedBy: data.startedBy,
        startedAt: data.startedAt,
        participants: data.participants ?? [],
        groupRunType: data.groupRunType || 'official',
    };
}
function subscribeActiveGroupRun(groupId, onChange) {
    const ref = (0, firestore_1.doc)(groupActiveRunsCol, groupId);
    return (0, firestore_1.onSnapshot)(ref, (snap) => {
        if (!snap.exists()) {
            onChange(null);
            return;
        }
        const data = snap.data();
        onChange({
            id: snap.id,
            groupId: data.groupId,
            startedBy: data.startedBy,
            startedAt: data.startedAt,
            participants: data.participants ?? [],
            groupRunType: data.groupRunType || 'official',
        });
    });
}
async function startActiveGroupRun(groupId, userId, groupRunType) {
    const existing = await getActiveGroupRun(groupId);
    if (existing) {
        throw new Error('A group run is already active for this group.');
    }
    const ref = (0, firestore_1.doc)(groupActiveRunsCol, groupId);
    const payload = {
        groupId,
        startedBy: userId,
        startedAt: Date.now(),
        participants: [userId],
        groupRunType,
    };
    await (0, firestore_1.setDoc)(ref, payload, { merge: true });
    return { id: ref.id, ...payload };
}
async function joinActiveGroupRun(groupId, userId) {
    const ref = (0, firestore_1.doc)(groupActiveRunsCol, groupId);
    const snap = await (0, firestore_1.getDoc)(ref);
    if (!snap.exists())
        return null;
    await (0, firestore_1.setDoc)(ref, {
        participants: (0, firestore_1.arrayUnion)(userId),
    }, { merge: true });
    const data = snap.data();
    const participants = Array.from(new Set([...(data.participants ?? []), userId]));
    return {
        id: ref.id,
        groupId,
        startedBy: data.startedBy,
        startedAt: data.startedAt,
        participants,
        groupRunType: data.groupRunType || 'official',
    };
}
async function endActiveGroupRun(groupId) {
    const ref = (0, firestore_1.doc)(groupActiveRunsCol, groupId);
    await (0, firestore_1.deleteDoc)(ref);
}
async function setMemberRole(groupId, userId, role) {
    const ref = (0, firestore_1.doc)(membershipsCol, `${groupId}_${userId}`);
    await (0, firestore_1.setDoc)(ref, { userId, groupId, role, joinedAt: Date.now() }, { merge: true });
}
async function removeMember(groupId, userId) {
    const ref = (0, firestore_1.doc)(membershipsCol, `${groupId}_${userId}`);
    await (0, firestore_1.deleteDoc)(ref);
}
async function deleteGroup(groupId) {
    // delete group doc, memberships, and group-scoped runs (territory)
    await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(groupsCol, groupId));
    const memSnap = await (0, firestore_1.getDocs)((0, firestore_1.query)(membershipsCol, (0, firestore_1.where)("groupId", "==", groupId)));
    await Promise.all(memSnap.docs.map((d) => (0, firestore_1.deleteDoc)(d.ref)));
    const runSnap = await (0, firestore_1.getDocs)((0, firestore_1.query)(runsCol, (0, firestore_1.where)("groupId", "==", groupId)));
    await Promise.all(runSnap.docs.map((d) => (0, firestore_1.deleteDoc)(d.ref)));
}
async function listMembersForGroup(groupId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "GroupService",
        phase: "DATA",
        label: "listMembersForGroup",
        meta: { groupId },
    });
    const q = (0, firestore_1.query)(membershipsCol, (0, firestore_1.where)("groupId", "==", groupId));
    const snap = await (0, firestore_1.getDocs)(q);
    const members = snap.docs.map((d) => d.data());
    const usersCol = (0, firestore_1.collection)(firebaseConfig_1.db, "users");
    const enriched = await Promise.all(members.map(async (m) => {
        try {
            const userSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(usersCol, m.userId));
            const userData = userSnap.exists() ? userSnap.data() : {};
            return {
                ...m,
                displayName: userData.displayName,
                username: userData.username,
                avatarUrl: userData.avatarUrl,
                territoryColor: userData.territoryColor,
                level: userData.level,
            };
        }
        catch {
            return m;
        }
    }));
    endPerf({ count: enriched.length, bytes: (0, perfLogger_1.perfBytes)(enriched) });
    return enriched;
}

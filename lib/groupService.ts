import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  arrayUnion,
  query,
  setDoc,
  deleteDoc as firestoreDeleteDoc,
  onSnapshot,
  where,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { RunDoc, RunWithId } from "./runService";
import {
  Group,
  GroupMembership,
  GroupStats,
  UserGroupStats,
} from "./groupTypes";
import { computeCurrentAreasFromRuns } from "./utils/currentAreas";
import { perfBytes, perfLog, perfStart } from "./perfLogger";

const groupsCol = collection(db, "groups");
const membershipsCol = collection(db, "groupMemberships"); // flat collection: { userId, groupId, role, joinedAt }
const runsCol = collection(db, "runs");
const groupInvitesCol = collection(db, "groupInvites");
const groupActiveRunsCol = collection(db, "groupActiveRuns");

function generateJoinCode() {
  return `G-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function parseGroupRunType(value: unknown): RunDoc['groupRunType'] {
  if (value === 'casual' || value === 'official') return value;
  return undefined;
}

function normalizeRunDoc(data: unknown, id: string): RunWithId {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const rawMode = raw.mode;
  const mode: RunDoc['mode'] =
    rawMode === 'personal' || rawMode === 'group'
      ? rawMode
      : raw.groupId
        ? 'group'
        : raw.userId
          ? 'personal'
          : undefined;
  if (__DEV__ && rawMode !== undefined && rawMode !== 'personal' && rawMode !== 'group') {
    throw new Error(`[GroupService] Invalid mode value for run ${id}: ${String(rawMode)}`);
  }
  const groupRunType =
    parseGroupRunType(raw.groupRunType) ?? (raw.groupId ? 'official' : undefined);
  const base = raw as Record<string, unknown>;
  return {
    ...(base as any),
    id,
    mode,
    scope: mode,
    groupRunType,
  };
}

async function getGroupDoc(groupId: string): Promise<Group | undefined> {
  const ref = doc(db, "groups", groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return undefined;
  return { id: snap.id, ...(snap.data() as any) } as Group;
}

export function subscribeGroupsForUser(
  userId: string,
  onChange: (groups: Group[]) => void
) {
  const q = query(membershipsCol, where("userId", "==", userId));
  return onSnapshot(q, async (snap) => {
    perfLog({
      screen: "GroupService",
      phase: "DATA",
      label: "subscribeGroupsForUser snapshot",
      durationMs: 0,
      meta: { userId, count: snap.size },
    });
    const groupIds = snap.docs.map((d) => d.data().groupId as string);
    if (!groupIds.length) {
      onChange([]);
      return;
    }
    const groups: Group[] = [];
    for (const gid of groupIds) {
      const g = await getGroupDoc(gid);
      if (g) groups.push(g);
    }
    onChange(groups);
  });
}

export async function listGroupsForUser(userId: string): Promise<Group[]> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "listGroupsForUser",
    meta: { userId },
  });
  const q = query(membershipsCol, where("userId", "==", userId));
  const membershipSnap = await getDocs(q);
  const groupIds = membershipSnap.docs.map((d) => d.data().groupId as string);
  if (!groupIds.length) {
    endPerf({ count: 0 });
    return [];
  }

  const groups: Group[] = [];
  for (const gid of groupIds) {
    const g = await getGroupDoc(gid);
    if (g) groups.push(g);
  }
  endPerf({ count: groups.length, bytes: perfBytes(groups) });
  return groups;
}

export async function joinGroupWithCode(
  userId: string,
  code: string
): Promise<Group> {
  const trimmed = code.trim();
  // Accept both raw code and code with/without "G-" prefix, case-insensitive
  const normalized = trimmed.toUpperCase().startsWith("G-")
    ? trimmed.toUpperCase()
    : `G-${trimmed.toUpperCase()}`;
  const q = query(groupsCol, where("joinCode", "==", normalized), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("Invalid ID");
  const group = { id: snap.docs[0].id, ...(snap.docs[0].data() as any) } as Group;

  // Upsert membership
  const memberDoc = doc(membershipsCol, `${group.id}_${userId}`);
  await setDoc(memberDoc, {
    userId,
    groupId: group.id,
    role: "member",
    joinedAt: Date.now(),
  } satisfies GroupMembership);

  return group;
}

export async function createGroup(
  userId: string,
  name: string,
  color: string
): Promise<Group> {
  const joinCode = generateJoinCode();
  const group: Omit<Group, "id"> = {
    name,
    color,
    ownerId: userId,
    createdAt: Date.now(),
    description: "",
    allowMemberCasualRuns: true,
    allowMemberOfficialRuns: false,
  };
  const created = await addDoc(groupsCol, { ...group, joinCode });
  const groupId = created.id;

  // Owner membership
  const memberDoc = doc(membershipsCol, `${groupId}_${userId}`);
  await setDoc(memberDoc, {
    userId,
    groupId,
    role: "owner",
    joinedAt: Date.now(),
  } satisfies GroupMembership);

  return { id: groupId, ...group, joinCode };
}

export async function countAllGroups(): Promise<number> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "countAllGroups",
  });
  const snap = await getDocs(groupsCol);
  endPerf({ count: snap.size });
  return snap.size;
}

export async function listAllGroups(): Promise<Group[]> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "listAllGroups",
  });
  const snap = await getDocs(groupsCol);
  const groups = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Group));
  endPerf({ count: groups.length, bytes: perfBytes(groups) });
  return groups;
}

export async function listGroupRuns(groupId: string): Promise<RunWithId[]> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "listGroupRuns",
    meta: { groupId },
  });
  const q = query(runsCol, where("groupId", "==", groupId));
  const snap = await getDocs(q);
  const runs = snap.docs.map((d) => normalizeRunDoc(d.data(), d.id));
  endPerf({ count: runs.length, bytes: perfBytes(runs) });
  return runs;
}

export async function getGroupStats(groupId: string): Promise<GroupStats> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "getGroupStats",
    meta: { groupId },
  });
  const runs = await listGroupRuns(groupId);
  const official = runs.filter((r: any) => (r as any).groupRunType === 'official');
  const totalDistanceKm = official.reduce((s, r) => s + (r.distance || 0) / 1000, 0);
  const areaEndPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "computeCurrentAreasFromRuns",
    meta: { groupId, runs: official.length },
  });
  const areaMap = computeCurrentAreasFromRuns(official as any[], { mode: 'group', activeGroupId: groupId });
  areaEndPerf({ owners: areaMap.size });
  const totalAreaKm2 = areaMap.get(groupId) ?? 0;
  const membersSnap = await getDocs(
    query(membershipsCol, where("groupId", "==", groupId))
  );
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

export async function getUserGroupStats(
  userId: string,
  groupId: string
): Promise<UserGroupStats> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "getUserGroupStats",
    meta: { userId, groupId },
  });
  const q = query(
    runsCol,
    where("groupId", "==", groupId),
    where("userId", "==", userId)
  );
  const snap = await getDocs(q);
  const runs = snap.docs.map((d) => normalizeRunDoc(d.data(), d.id));
  const official = runs.filter((r: any) => (r as any).groupRunType === 'official');
  const distanceKm = official.reduce((s, r) => s + (r.distance || 0) / 1000, 0);
  const areaEndPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "computeCurrentAreasFromRuns",
    meta: { groupId, runs: official.length, userId },
  });
  const areaMap = computeCurrentAreasFromRuns(official as any[], { mode: 'group', activeGroupId: groupId });
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

export async function getGroupById(id: string): Promise<Group | undefined> {
  return getGroupDoc(id);
}

export async function getMembershipsForUser(userId: string): Promise<GroupMembership[]> {
  const q = query(membershipsCol, where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as GroupMembership);
}

export async function leaveGroup(userId: string, groupId: string) {
  const memberDoc = doc(membershipsCol, `${groupId}_${userId}`);
  await deleteDoc(memberDoc);
}

export async function sendGroupInvite(fromUserId: string, toUserId: string, groupId: string) {
  await addDoc(groupInvitesCol, {
    fromUserId,
    toUserId,
    groupId,
    createdAt: Date.now(),
    status: "pending",
  });
}

export type GroupInvite = {
  id: string;
  fromUserId: string;
  toUserId: string;
  groupId: string;
  createdAt: number;
  status: "pending";
  group?: Group;
  fromUsername?: string;
  fromDisplayName?: string;
};

export async function listGroupInvitesForUser(userId: string): Promise<GroupInvite[]> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "listGroupInvitesForUser",
    meta: { userId },
  });
  const snap = await getDocs(
    query(groupInvitesCol, where("toUserId", "==", userId), where("status", "==", "pending"))
  );
  const invites: GroupInvite[] = [];
  for (const d of snap.docs) {
    const data = d.data() as any;
    const group = await getGroupDoc(data.groupId);
    let fromUsername: string | undefined;
    let fromDisplayName: string | undefined;
    try {
      const userSnap = await getDoc(doc(db, "users", data.fromUserId));
      if (userSnap.exists()) {
        const u = userSnap.data() as any;
        fromUsername = u.username ?? u.usernameLower;
        fromDisplayName = u.displayName ?? u.username ?? u.email;
      }
    } catch {
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
  endPerf({ count: invites.length, bytes: perfBytes(invites) });
  return invites;
}

export async function acceptGroupInvite(inviteId: string, userId: string) {
  const ref = doc(groupInvitesCol, inviteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Invite not found");
  const data = snap.data() as any;
  const groupId: string = data.groupId;
  const membershipRef = doc(membershipsCol, `${groupId}_${userId}`);
  await setDoc(membershipRef, { userId, groupId, role: "member", joinedAt: Date.now() }, { merge: true });
  await firestoreDeleteDoc(ref);
}

export async function declineGroupInvite(inviteId: string) {
  const ref = doc(groupInvitesCol, inviteId);
  await firestoreDeleteDoc(ref);
}

export type ActiveGroupRun = {
  id: string;
  groupId: string;
  startedBy: string;
  startedAt: number;
  participants: string[];
  groupRunType: 'casual' | 'official';
};

export async function getActiveGroupRun(groupId: string): Promise<ActiveGroupRun | null> {
  const ref = doc(groupActiveRunsCol, groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return {
    id: snap.id,
    groupId: data.groupId,
    startedBy: data.startedBy,
    startedAt: data.startedAt,
    participants: data.participants ?? [],
    groupRunType: data.groupRunType || 'official',
  };
}

export function subscribeActiveGroupRun(
  groupId: string,
  onChange: (active: ActiveGroupRun | null) => void
) {
  const ref = doc(groupActiveRunsCol, groupId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    const data = snap.data() as any;
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

export async function startActiveGroupRun(
  groupId: string,
  userId: string,
  groupRunType: 'casual' | 'official'
): Promise<ActiveGroupRun> {
  const existing = await getActiveGroupRun(groupId);
  if (existing) {
    throw new Error('A group run is already active for this group.');
  }
  const ref = doc(groupActiveRunsCol, groupId);
  const payload = {
    groupId,
    startedBy: userId,
    startedAt: Date.now(),
    participants: [userId],
    groupRunType,
  };
  await setDoc(ref, payload, { merge: true });
  return { id: ref.id, ...payload };
}

export async function joinActiveGroupRun(groupId: string, userId: string): Promise<ActiveGroupRun | null> {
  const ref = doc(groupActiveRunsCol, groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  await setDoc(
    ref,
    {
      participants: arrayUnion(userId),
    },
    { merge: true }
  );
  const data = snap.data() as any;
  const participants: string[] = Array.from(new Set([...(data.participants ?? []), userId]));
  return {
    id: ref.id,
    groupId,
    startedBy: data.startedBy,
    startedAt: data.startedAt,
    participants,
    groupRunType: data.groupRunType || 'official',
  };
}

export async function endActiveGroupRun(groupId: string) {
  const ref = doc(groupActiveRunsCol, groupId);
  await firestoreDeleteDoc(ref);
}

export async function setMemberRole(
  groupId: string,
  userId: string,
  role: GroupMembership["role"]
) {
  const ref = doc(membershipsCol, `${groupId}_${userId}`);
  await setDoc(ref, { userId, groupId, role, joinedAt: Date.now() }, { merge: true });
}

export async function removeMember(groupId: string, userId: string) {
  const ref = doc(membershipsCol, `${groupId}_${userId}`);
  await deleteDoc(ref);
}

export async function deleteGroup(groupId: string) {
  // delete group doc, memberships, and group-scoped runs (territory)
  await deleteDoc(doc(groupsCol, groupId));
  const memSnap = await getDocs(query(membershipsCol, where("groupId", "==", groupId)));
  await Promise.all(memSnap.docs.map((d) => deleteDoc(d.ref)));
  const runSnap = await getDocs(query(runsCol, where("groupId", "==", groupId)));
  await Promise.all(runSnap.docs.map((d) => deleteDoc(d.ref)));
}

export async function listMembersForGroup(groupId: string): Promise<Array<GroupMembership & { displayName?: string; username?: string; avatarUrl?: string; territoryColor?: string; level?: number }>> {
  const endPerf = perfStart({
    screen: "GroupService",
    phase: "DATA",
    label: "listMembersForGroup",
    meta: { groupId },
  });
  const q = query(membershipsCol, where("groupId", "==", groupId));
  const snap = await getDocs(q);
  const members = snap.docs.map((d) => d.data() as GroupMembership);
  const usersCol = collection(db, "users");

  const enriched = await Promise.all(
    members.map(async (m) => {
      try {
        const userSnap = await getDoc(doc(usersCol, m.userId));
        const userData = userSnap.exists() ? (userSnap.data() as any) : {};
        return {
          ...m,
          displayName: userData.displayName,
          username: userData.username,
          avatarUrl: userData.avatarUrl,
          territoryColor: userData.territoryColor,
          level: userData.level,
        };
      } catch {
        return m;
      }
    })
  );

  endPerf({ count: enriched.length, bytes: perfBytes(enriched) });
  return enriched;
}

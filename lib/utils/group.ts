import type { GroupMember } from '../groupTypes';
import { listGroupRuns, listMembersForGroup } from '../groupService';

// Sort members by contribution (groupRuns desc), then role, then name for stability.
export function sortMembersByContribution(members: GroupMember[]): GroupMember[] {
  const priority = { owner: 0, leader: 1, admin: 2, member: 3 } as const;
  return [...members].sort((a, b) => {
    const runsA = a.groupRuns ?? 0;
    const runsB = b.groupRuns ?? 0;
    if (runsA !== runsB) return runsB - runsA;
    const pa = priority[a.role] ?? 3;
    const pb = priority[b.role] ?? 3;
    if (pa !== pb) return pa - pb;
    return (a.displayName || '').localeCompare(b.displayName || '');
  });
}

export function isOwner(members: GroupMember[], userId: string | undefined) {
  return !!userId && members.some((m) => m.userId === userId && m.role === 'owner');
}

export function canManage(members: GroupMember[], userId: string | undefined) {
  return (
    !!userId &&
    members.some((m) => m.userId === userId && (m.role === 'owner' || m.role === 'leader' || m.role === 'admin'))
  );
}

// Apply a role change locally.
export function applyRoleChange(
  members: GroupMember[],
  memberId: string,
  nextRole: GroupMember['role']
): GroupMember[] {
  const updated = members.map((mem) =>
    mem.userId === memberId ? { ...mem, role: nextRole } : mem
  );
  return sortMembersByContribution(updated);
}

// Remove a member locally.
export function removeMemberLocal(members: GroupMember[], memberId: string): GroupMember[] {
  return members.filter((m) => m.userId !== memberId);
}

// Load members for a group, hydrate groupRuns count, and return sorted.
export async function loadAndRankGroupMembers(groupId: string): Promise<GroupMember[]> {
  const memberList = await listMembersForGroup(groupId);
  const groupRuns = await listGroupRuns(groupId);
  const runCounts = groupRuns.reduce<Record<string, number>>((acc, run: any) => {
    const uid = run.userId;
    if (!uid) return acc;
    acc[uid] = (acc[uid] ?? 0) + 1;
    return acc;
  }, {});
  const normalized = memberList.map((m) => ({
    ...m,
    role: m.role as GroupMember['role'],
    groupRuns: runCounts[m.userId] ?? 0,
    username: (m as any).username,
  }));
  return sortMembersByContribution(normalized);
}

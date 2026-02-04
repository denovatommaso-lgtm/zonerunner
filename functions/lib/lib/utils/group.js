"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sortMembersByContribution = sortMembersByContribution;
exports.isOwner = isOwner;
exports.canManage = canManage;
exports.applyRoleChange = applyRoleChange;
exports.removeMemberLocal = removeMemberLocal;
exports.loadAndRankGroupMembers = loadAndRankGroupMembers;
const groupService_1 = require("../groupService");
// Sort members by contribution (groupRuns desc), then role, then name for stability.
function sortMembersByContribution(members) {
    const priority = { owner: 0, leader: 1, admin: 2, member: 3 };
    return [...members].sort((a, b) => {
        const runsA = a.groupRuns ?? 0;
        const runsB = b.groupRuns ?? 0;
        if (runsA !== runsB)
            return runsB - runsA;
        const pa = priority[a.role] ?? 3;
        const pb = priority[b.role] ?? 3;
        if (pa !== pb)
            return pa - pb;
        return (a.displayName || '').localeCompare(b.displayName || '');
    });
}
function isOwner(members, userId) {
    return !!userId && members.some((m) => m.userId === userId && m.role === 'owner');
}
function canManage(members, userId) {
    return (!!userId &&
        members.some((m) => m.userId === userId && (m.role === 'owner' || m.role === 'leader' || m.role === 'admin')));
}
// Apply a role change locally.
function applyRoleChange(members, memberId, nextRole) {
    const updated = members.map((mem) => mem.userId === memberId ? { ...mem, role: nextRole } : mem);
    return sortMembersByContribution(updated);
}
// Remove a member locally.
function removeMemberLocal(members, memberId) {
    return members.filter((m) => m.userId !== memberId);
}
// Load members for a group, hydrate groupRuns count, and return sorted.
async function loadAndRankGroupMembers(groupId) {
    const memberList = await (0, groupService_1.listMembersForGroup)(groupId);
    const groupRuns = await (0, groupService_1.listGroupRuns)(groupId);
    const runCounts = groupRuns.reduce((acc, run) => {
        const uid = run.userId;
        if (!uid)
            return acc;
        acc[uid] = (acc[uid] ?? 0) + 1;
        return acc;
    }, {});
    const normalized = memberList.map((m) => ({
        ...m,
        role: m.role,
        groupRuns: runCounts[m.userId] ?? 0,
        username: m.username,
    }));
    return sortMembersByContribution(normalized);
}

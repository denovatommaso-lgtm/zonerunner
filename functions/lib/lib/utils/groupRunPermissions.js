"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canStartGroupRun = canStartGroupRun;
exports.isRunAffectingGroupTerritory = isRunAffectingGroupTerritory;
exports.isRunCountingForGroupLeaderboard = isRunCountingForGroupLeaderboard;
function canStartGroupRun(role, runType, group) {
    const allowCasual = group?.allowMemberCasualRuns !== false;
    const allowOfficial = group?.allowMemberOfficialRuns === true;
    if (runType === 'official') {
        return role === 'owner' || role === 'leader' || role === 'admin';
    }
    // casual
    if (!allowCasual)
        return role === 'owner' || role === 'leader' || role === 'admin';
    return Boolean(role);
}
function isRunAffectingGroupTerritory(run) {
    const isGroup = run.scope === 'group' || run.mode === 'group' || !!run.groupId;
    return isGroup && run.groupRunType === 'official';
}
function isRunCountingForGroupLeaderboard(run) {
    return isRunAffectingGroupTerritory(run);
}

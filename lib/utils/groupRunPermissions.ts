import type { Group } from '../groupTypes';

export type GroupRunType = 'casual' | 'official';
export type GroupMemberRole = 'owner' | 'leader' | 'admin' | 'member';

export function canStartGroupRun(
  role: GroupMemberRole | undefined,
  runType: GroupRunType,
  group?: Pick<Group, 'allowMemberCasualRuns' | 'allowMemberOfficialRuns'>
): boolean {
  const allowCasual = group?.allowMemberCasualRuns !== false;
  const allowOfficial = group?.allowMemberOfficialRuns === true;

  if (runType === 'official') {
    return role === 'owner' || role === 'leader' || role === 'admin';
  }

  // casual
  if (!allowCasual) return role === 'owner' || role === 'leader' || role === 'admin';
  return Boolean(role);
}

export function isRunAffectingGroupTerritory(run: { scope?: string; mode?: string; groupRunType?: string }) {
  const isGroup = run.scope === 'group' || run.mode === 'group' || !!(run as any).groupId;
  return isGroup && run.groupRunType === 'official';
}

export function isRunCountingForGroupLeaderboard(run: { scope?: string; mode?: string; groupRunType?: string }) {
  return isRunAffectingGroupTerritory(run);
}

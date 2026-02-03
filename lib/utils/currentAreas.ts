import { rebuildTerritoriesFromRuns, territoryAreaKm2 } from '../territoryEngine';

type RunLike = {
  id?: string | number;
  userId?: string;
  groupId?: string;
  route?: Array<{ latitude: number; longitude: number }>;
  mode?: 'personal' | 'group';
  groupRunType?: 'official' | 'casual';
  startedAt?: string;
  createdAt?: number;
};

export function computeCurrentAreasFromRuns(
  runs: RunLike[],
  opts: { mode: 'personal' | 'group'; activeGroupId?: string | null }
): Map<string, number> {
  const territoryRuns: Array<{ userId: string; route: any; startedAt?: string; createdAt?: number }> = [];
  const seen = new Set<string>();

  const filtered =
    opts.mode === 'group'
      ? runs.filter(
          (r) =>
            !!(r as any).groupId &&
            ((r as any).groupRunType ?? (r as any).mode) === 'official' &&
            (!opts.activeGroupId || (r as any).groupId === opts.activeGroupId)
        )
      : runs.filter((r) => !!r.userId && !(r as any).groupId && (r as any).mode !== 'group');

  for (const run of filtered) {
    const id = (run.id ?? '').toString();
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);

    const ownerId = opts.mode === 'group' ? (run as any).groupId : run.userId;
    if (!ownerId) continue;
    if (!Array.isArray(run.route) || run.route.length < 3) continue;

    territoryRuns.push({
      userId: ownerId,
      route: run.route as any,
      startedAt: run.startedAt,
      createdAt: run.createdAt,
    });
  }

  const territories = rebuildTerritoriesFromRuns(territoryRuns as any);
  const areaByOwner = new Map<string, number>();
  territories.forEach((terr, ownerId) => {
    areaByOwner.set(ownerId, territoryAreaKm2(terr));
  });
  return areaByOwner;
}

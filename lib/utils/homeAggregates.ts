import type { Group } from '../groupTypes';

type LeaderboardEntry = {
  id: string;
  name: string;
  initials: string;
  color: string;
  isYou?: boolean;
  areaKm2: number;
  distanceKm: number;
};

type RunLike = {
  id?: string | number;
  userId?: string;
  areaKm2?: number;
  distance?: number;
  elapsedSeconds?: number;
  createdAt?: number;
  startedAt?: string;
};

type StatsInput = {
  totalRuns: number;
  totalDistanceMeters: number;
  totalTimeSeconds: number;
  totalAreaKm2: number;
  lastRun: (RunLike & { distance: number; elapsedSeconds: number; startedAt: string }) | null;
};

export function buildLeaderboardEntries(
  runs: RunLike[],
  {
    mode,
    activeGroupId,
    groups,
    userId,
    areaByOwner,
  }: {
    mode: 'personal' | 'group';
    activeGroupId?: string | null;
    groups: Group[];
    userId?: string;
    areaByOwner?: Map<string, number>;
  }
): LeaderboardEntry[] {
  const aggregates = new Map<string, { areaKm2: number; distanceKm: number }>();

  const filtered =
    mode === 'group'
      ? runs.filter((r: any) => (r as any).groupRunType === 'official')
      : runs;

  filtered.forEach((run: any) => {
    const uid = mode === 'group' ? (run as any).groupId || 'unknown' : run.userId || 'unknown';
    const agg = aggregates.get(uid) ?? { areaKm2: 0, distanceKm: 0 };
    agg.distanceKm += (run.distance ?? 0) / 1000;
    aggregates.set(uid, agg);
  });

  return Array.from(aggregates.entries()).map(([uid, agg]) => {
    const name = `User ${uid.slice(0, 6)}`;
    const initials = (name[0] || 'U').toUpperCase();
    const color =
      mode === 'group' && activeGroupId
        ? groups.find((g) => g.id === activeGroupId)?.color ?? '#38bdf8'
        : '#38bdf8';
    return {
      id: uid,
      name,
      initials,
      color,
      isYou: uid === userId,
      areaKm2: areaByOwner?.get(uid) ?? agg.areaKm2,
      distanceKm: agg.distanceKm,
    };
  });
}

export function buildHomeStats(
  mode: 'personal' | 'group',
  runs: RunLike[],
  groupStats: { runs: number; distanceKm: number; areaKm2: number },
  opts?: { currentAreaKm2?: number; groupAreaKm2?: number }
): StatsInput {
  const normalizeRun = (r: RunLike | undefined | null) => {
    if (!r) return null;
    const startedAt =
      r.startedAt ||
      (r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString());
    return {
      ...r,
      distance: r.distance ?? 0,
      elapsedSeconds: r.elapsedSeconds ?? 0,
      startedAt,
    };
  };

  if (mode === 'group') {
    const lastRunRaw = runs.length
      ? [...runs].sort(
          (a, b) =>
            (b.createdAt ?? new Date(b.startedAt || '').getTime()) -
            (a.createdAt ?? new Date(a.startedAt || '').getTime())
        )[0]
      : null;
    const lastRun = normalizeRun(lastRunRaw);
    return {
      totalRuns: groupStats.runs,
      totalDistanceMeters: groupStats.distanceKm * 1000,
      totalTimeSeconds: runs.reduce((s, r: any) => s + (r.elapsedSeconds ?? 0), 0),
      totalAreaKm2: opts?.groupAreaKm2 ?? groupStats.areaKm2,
      lastRun,
    };
  }

  const totalRuns = runs.length;
  const totalDistanceMeters = runs.reduce((sum, r: any) => sum + (r.distance ?? 0), 0);
  const totalTimeSeconds = runs.reduce((sum, r: any) => sum + (r.elapsedSeconds ?? 0), 0);
  const personalAreaRuns = runs.filter(
    (r: any) => (r as any).mode !== 'group' && !(r as any).groupId
  );
  const totalAreaKm2 = opts?.currentAreaKm2 ?? 0;

  const lastRun = normalizeRun(
    runs.length
      ? [...runs].sort(
          (a, b) =>
            (b.createdAt ?? new Date(b.startedAt || '').getTime()) -
            (a.createdAt ?? new Date(a.startedAt || '').getTime())
        )[0]
      : null
  );

  return {
    totalRuns,
    totalDistanceMeters,
    totalTimeSeconds,
    totalAreaKm2,
    lastRun,
  };
}

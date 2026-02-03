import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchRunsForContext } from './runContext';
import { loadUserProfile } from './authService';
import { MonthlyChallengesService } from './monthlyChallengesService';
import { monthlyRankingConfig } from './monthlyChallengesConfig';
import { logFailure, logStart, logSuccess } from './bootstrapLogger';
import { monthKeyFromEpochMsLocal, type RankingScope } from './monthlyChallenges';
import { compareRankEntries, type RankEntry } from './rankingSort';
import { normalizeCountryInput, normalizeStateInput } from './rankingLocationData';

const LAST_SUCCESS_KEY_PREFIX = 'ranking:lastSuccessAtMs:';
const SNAPSHOT_KEY_PREFIX = 'ranking:snapshot';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableTxnError(err: unknown): boolean {
  const code = (err as any)?.code as string | undefined;
  return (
    code === 'failed-precondition' ||
    code === 'aborted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    code === 'internal' ||
    code === 'unknown'
  );
}

function devLog(event: string, data: Record<string, unknown>) {
  if (!__DEV__) return;
  try {
    console.log(`[RankingTracker] ${event} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[RankingTracker] ${event}`, data);
  }
}

function monthBoundsMs(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).getTime();
  return { start, end };
}

function runTimestampMs(run: any): number {
  const createdAt = Number(run?.createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;
  const startedAt = Date.parse(run?.startedAt ?? '');
  return Number.isFinite(startedAt) ? startedAt : 0;
}

function snapshotKey(userId: string, monthKey: string, scope: RankingScope) {
  return `${SNAPSHOT_KEY_PREFIX}:${userId}:${monthKey}:${scope}`;
}

function normalizeState(value?: string) {
  return (value ?? '').trim().toUpperCase();
}

function normalizeCountry(value?: string) {
  return (value ?? '').trim().toUpperCase();
}

function rankForUser(
  entries: Array<{ id: string; distanceKm: number }>,
  latestTsByUser: Record<string, number>,
  userId: string
): number | null {
  const sorted = entries
    .map<RankEntry>((entry) => ({
      userId: entry.id,
      distanceMeters: (entry.distanceKm ?? 0) * 1000,
      lastActivityAtMs: Number.isFinite(latestTsByUser[entry.id])
        ? latestTsByUser[entry.id]
        : Number.MAX_SAFE_INTEGER,
    }))
    .sort(compareRankEntries);
  const idx = sorted.findIndex((e) => e.userId === userId);
  return idx >= 0 ? idx + 1 : null;
}

const inFlightByUser = new Map<string, Promise<void>>();
const lastAttemptAtByUser = new Map<string, number>();
const hydratedUsers = new Map<string, string>();

async function hydrateCachedSnapshots(userId: string, monthKey: string) {
  const lastHydrated = hydratedUsers.get(userId);
  if (lastHydrated === monthKey) return;
  hydratedUsers.set(userId, monthKey);
  const scopes: RankingScope[] = ['state', 'country', 'world'];
  const keys = scopes.map((scope) => snapshotKey(userId, monthKey, scope));
  const entries = await AsyncStorage.multiGet(keys);
  for (let i = 0; i < entries.length; i += 1) {
    const [key, raw] = entries[i] ?? [];
    if (!key || !raw) continue;
    try {
      const parsed = JSON.parse(raw) as { rank?: number; atMs?: number; scope?: RankingScope };
      if (!parsed || typeof parsed.rank !== 'number' || typeof parsed.atMs !== 'number') continue;
      const scope = parsed.scope ?? scopes[i];
      await MonthlyChallengesService.ingestRankingSnapshot({
        userId,
        at: parsed.atMs,
        rank: parsed.rank,
        scope,
      });
    } catch {
      // ignore corrupted snapshot cache
    }
  }
}

function getRankForScope(params: {
  scope: RankingScope;
  userId: string;
  profileState?: string;
  profileCountry?: string;
  entries: Array<{ id: string; distanceKm: number }>;
  latestTsByUser: Record<string, number>;
  locationByUser: Record<string, { stateCode?: string; countryCode?: string }>;
}): number | null {
  const { scope, userId, entries, latestTsByUser, locationByUser } = params;
  if (scope === 'world') {
    return rankForUser(entries, latestTsByUser, userId);
  }
  if (scope === 'state') {
    const userState = normalizeState(params.profileState);
    if (!userState) {
      if (__DEV__) {
        console.warn('[RankingTracker] missing stateCode; set Rankings Location in Settings', {
          userId,
        });
      }
      return null;
    }
    const filtered = entries.filter(
      (e) => normalizeState(locationByUser[e.id]?.stateCode) === userState
    );
    if (__DEV__ && filtered.length === 0) {
      const sample = Object.values(locationByUser)
        .slice(0, 5)
        .map((loc) => loc.stateCode || '');
      console.warn('[RankingTracker] state filter empty', {
        userId,
        userState,
        sampleStates: sample,
      });
    }
    return rankForUser(filtered, latestTsByUser, userId);
  }
  const userCountry = normalizeCountry(params.profileCountry);
  if (!userCountry) {
    if (__DEV__) {
      console.warn('[RankingTracker] missing countryCode; set Rankings Location in Settings', {
        userId,
      });
    }
    return null;
  }
  const filtered = entries.filter(
    (e) => normalizeCountry(locationByUser[e.id]?.countryCode) === userCountry
  );
  if (__DEV__ && filtered.length === 0) {
    const sample = Object.values(locationByUser)
      .slice(0, 5)
      .map((loc) => loc.countryCode || '');
    console.warn('[RankingTracker] country filter empty', {
      userId,
      userCountry,
      sampleCountries: sample,
    });
  }
  return rankForUser(filtered, latestTsByUser, userId);
}

/**
 * Record the user's state/country/world positions for the monthly Ranking challenge.
 *
 * Source-of-truth: distance leaderboard positions computed from monthly runs.
 *
 * This is best-effort and non-blocking; failures must never impact run saving or navigation.
 */
export async function checkAndRecordMainRanking(params: {
  userId: string;
  reason: 'app_launch' | 'app_resume' | 'after_run_save' | 'interval' | 'rank_location_updated';
  force?: boolean;
}) {
  const { userId, reason, force } = params;
  if (!userId) return;

  const existing = inFlightByUser.get(userId);
  if (existing) return existing;

  const run = (async () => {
    const tag = `RankingTracker.checkAndRecordMainRanking:${userId}:${reason}`;
    logStart(tag, { userId, reason });
    const now = Date.now();
    try {
      const mk = monthKeyFromEpochMsLocal(now);
      await hydrateCachedSnapshots(userId, mk);

      const memLast = lastAttemptAtByUser.get(userId) ?? 0;
      const storageKey = `${LAST_SUCCESS_KEY_PREFIX}${userId}`;
      const storedLastSuccess = Number(await AsyncStorage.getItem(storageKey)) || 0;
      const last = Math.max(memLast, storedLastSuccess);
      const minInterval = monthlyRankingConfig.minCheckIntervalMs;
      if (!force && last && now - last < minInterval) {
        return;
      }
      lastAttemptAtByUser.set(userId, now);

      const runs = await fetchRunsForContext({ global: true });
      const { start, end } = monthBoundsMs(new Date(now));
      const monthRuns = runs.filter((r: any) => {
        const ts = runTimestampMs(r);
        return ts >= start && ts < end;
      });
      const aggregates = new Map<string, { distanceKm: number }>();
      const latestLocationByUser: Record<string, { stateCode?: string; countryCode?: string }> = {};
      const latestTsByUser: Record<string, number> = {};

      monthRuns.forEach((run: any) => {
        const uid = run.userId || 'unknown';
        const agg = aggregates.get(uid) ?? { distanceKm: 0 };
        agg.distanceKm += (run.distance ?? 0) / 1000;
        aggregates.set(uid, agg);

        const fallbackCountry = normalizeCountryInput(
          (run.countryName ?? run.country ?? run.nation ?? '') as string
        );
        const rawCountry = (run.countryCode ?? '').toString().trim();
        const countryCode = normalizeCountry(rawCountry || fallbackCountry || '');
        const rawState = (run.stateCode ?? '').toString().trim();
        const fallbackState = normalizeStateInput(
          countryCode,
          (run.stateName ?? run.state ?? run.region ?? run.subregion ?? '') as string
        );
        const stateCode = normalizeState(rawState || fallbackState || '');
        if (!stateCode && !countryCode) return;

        const ts = run.createdAt ?? Date.parse(run.startedAt ?? '') ?? 0;
        const prevTs = latestTsByUser[uid] ?? -1;
        if (ts >= prevTs) {
          latestTsByUser[uid] = ts;
          latestLocationByUser[uid] = {
            stateCode,
            countryCode,
          };
        }
      });

      const entries = Array.from(aggregates.entries()).map(([id, agg]) => ({
        id,
        distanceKm: agg.distanceKm ?? 0,
      }));

      const profile = await loadUserProfile(userId).catch(() => null);
      const profileState = (profile as any)?.stateCode ?? '';
      const profileCountry = (profile as any)?.countryCode ?? '';

      // Retry around the service in case of contention on the monthlyChallenges doc.
      const maxRetries = 3;
      const scopes: RankingScope[] = ['state', 'country', 'world'];
      for (const scope of scopes) {
        const rank = getRankForScope({
          scope,
          userId,
          profileState,
          profileCountry,
          entries,
          latestTsByUser,
          locationByUser: latestLocationByUser,
        });
        if (!rank) continue;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const status = await MonthlyChallengesService.ingestRankingSnapshot({
              userId,
              at: now,
              rank,
              scope,
            });
            if (status === 'skipped_invalid_rank') {
              devLog('skipped_invalid_rank', { userId, reason, rank, scope });
              logSuccess(tag, { skipped: 'invalid_rank', rank, scope, runsCount: monthRuns.length });
              break;
            }
            await AsyncStorage.setItem(
              snapshotKey(userId, mk, scope),
              JSON.stringify({ rank, atMs: now, scope })
            );
            break;
          } catch (e) {
            if (attempt < maxRetries && isRetryableTxnError(e)) {
              const backoff = 150 * Math.pow(2, attempt) + Math.floor(Math.random() * 80);
              await sleep(backoff);
              continue;
            }
            throw e;
          }
        }
      }

      await AsyncStorage.setItem(storageKey, String(now));
      devLog('recorded', { userId, reason });
      logSuccess(tag, { runsCount: monthRuns.length });
    } catch (e) {
      devLog('failed', { userId, reason, error: (e as any)?.message ?? String(e) });
      logFailure(tag, e, { userId, reason });
    }
  })();

  inFlightByUser.set(userId, run);
  try {
    await run;
  } finally {
    inFlightByUser.delete(userId);
  }
}

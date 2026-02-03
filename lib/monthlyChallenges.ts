import type { RunDoc } from './runService';
import { computeFastestSegmentSeconds, type TimedGeoCoord } from './geo/pace';
import {
  monthlyChallenges,
  monthlyChallengeSettings,
  monthlyPaceConfig,
  monthlyRunQualification,
  monthlyTimeWindows,
  monthlyTerritoryRewardConfig,
  monthlyXpConfig,
  type MonthlyChallengeDefinition,
  type MonthlyChallengeId,
  type MonthlyChallengeUnit,
  type Star,
} from './monthlyChallengesConfig';

export type MonthKey = string; // e.g. "2025-12" or "YEAR-2025"
type Cadence = 'monthly' | 'yearly';

function bucketKeyForChallenge(challengeId: MonthlyChallengeId, d: Date): MonthKey {
  // Countries/states are yearly; everything else monthly.
  const cadence: Cadence = challengeId === 'countries' || challengeId === 'states' ? 'yearly' : 'monthly';
  if (cadence === 'yearly') {
    return `YEAR-${d.getFullYear()}` as MonthKey;
  }
  return monthKeyFromLocalDate(d);
}

export type MonthlyChallengeProgress = {
  stage: number;
  progressValue: number;
  starsEarned: number; // 0..3
  milestonesGranted: string[];
  meta?: Record<string, unknown>;
};

export type MonthlyChallengeMonthState = {
  monthKey: string;
  challenges: Partial<Record<MonthlyChallengeId, MonthlyChallengeProgress>>;
  appliedRunIds: string[];
  appliedEventIds: string[];
};

export type MonthlyChallengesState = {
  version: number;
  updatedAt: number;
  lastMonthKey: string;
  stageUnlocked: Partial<Record<MonthlyChallengeId, number>>;
  months: Record<string, MonthlyChallengeMonthState>;
  totalChallengeXp: number;
  totalTerritoryReward: number;
};

export type MonthlyChallengeView = {
  id: MonthlyChallengeId;
  title: string; // "Distance II"
  baseLabel: string;
  description: string;
  unit: MonthlyChallengeUnit;
  stage: number;
  stageMax: number;
  progressValue: number;
  starsEarned: number;
  starThresholds: { one: number; two: number; three: number };
  nextStarTarget?: number;
  earnedXpThisStage: number;
  stageTotalXp: number;
  nextMilestoneXp?: number;
  meta?: Record<string, unknown>;
};

export function monthKeyFromEpochMsLocal(ts: number): string {
  return monthKeyFromLocalDate(new Date(ts));
}

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

export function monthKeyFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthStartEpochMsLocal(monthKey: string): number {
  const m = String(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!m) return Date.now();
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  return new Date(year, Math.max(0, month - 1), 1, 0, 0, 0, 0).getTime();
}

function prevMonthKey(monthKey: string): string | null {
  const m = String(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  let year = Number(m[1]);
  let month = Number(m[2]); // 1-12
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  month -= 1;
  if (month <= 0) {
    month = 12;
    year -= 1;
  }
  if (year <= 0) return null;
  return `${year}-${pad2(month)}`;
}

function dayKeyFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function romanNumeral(n: number): string {
  const map: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let x = Math.max(0, Math.floor(n));
  let out = '';
  for (const [val, sym] of map) {
    while (x >= val) {
      out += sym;
      x -= val;
    }
  }
  return out || 'I';
}

function roundByUnit(unit: MonthlyChallengeUnit, value: number): number {
  const v = Math.max(0, value);
  if (unit === 'km') return Math.max(1, Math.round(v));
  if (unit === 'sec') return Math.max(300, Math.round(v / 300) * 300); // nearest 5 minutes
  if (unit === 'paceSec') return Math.max(5, Math.round(v / 5) * 5); // nearest 5 seconds
  return v;
}

function normalizeTimedRoute(run: RunDoc): TimedGeoCoord[] {
  const pts = Array.isArray(run.route) ? run.route : [];
  const valid = pts
    .filter((p) => Number.isFinite((p as any)?.latitude) && Number.isFinite((p as any)?.longitude))
    .map((p) => ({
      latitude: Number((p as any).latitude),
      longitude: Number((p as any).longitude),
      ts:
        typeof (p as any).ts === 'number'
          ? (p as any).ts
          : typeof (p as any).timestamp === 'number'
            ? (p as any).timestamp
            : undefined,
    }));
  if (!valid.length) return [];

  // Ensure strictly increasing timestamps; if missing/non-monotonic, synthesize from run duration.
  const hasMonotonic =
    valid.every((p) => typeof p.ts === 'number') &&
    valid.every((p, i) => (i === 0 ? true : (p.ts as number) > (valid[i - 1].ts as number)));
  if (hasMonotonic) return valid as TimedGeoCoord[];

  const startMs = (() => {
    const parsed = Date.parse(run.startedAt ?? '');
    return Number.isFinite(parsed) ? parsed : Date.now();
  })();
  const durationMs = Math.max(1000, Math.round((run.elapsedSeconds ?? 0) * 1000));
  const n = valid.length;
  return valid.map((p, i) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    ts: startMs + Math.floor((durationMs * i) / Math.max(1, n - 1)),
  })) as TimedGeoCoord[];
}

function isQualifyingRunForCountChallenges(run: RunDoc): boolean {
  const distOk = (run.distance ?? 0) >= monthlyRunQualification.minDistanceMeters;
  const timeOk = (run.elapsedSeconds ?? 0) >= monthlyRunQualification.minMovingSeconds;
  const qualifyMode = monthlyRunQualification.qualifyMode as 'and' | 'or';
  return qualifyMode === 'and' ? distOk && timeOk : distOk || timeOk;
}

function minuteOfDayLocal(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function isWithinWindow(minuteOfDay: number, window: { startMinuteInclusive: number; endMinuteExclusive: number }) {
  const m = ((minuteOfDay % (24 * 60)) + (24 * 60)) % (24 * 60);
  const start = ((window.startMinuteInclusive % (24 * 60)) + (24 * 60)) % (24 * 60);
  const end = ((window.endMinuteExclusive % (24 * 60)) + (24 * 60)) % (24 * 60);
  if (start < end) return m >= start && m < end;
  // crosses midnight (e.g. 23:00 -> 03:00)
  return m >= start || m < end;
}

export function computeStarThresholds(
  unit: MonthlyChallengeUnit,
  target3Star: number
): { one: number; two: number; three: number } {
  if (unit === 'paceSec') {
    // Pace-specific thresholds: lower is better.
    // 3★: <= target
    // 2★: <= target + 10%
    // 1★: <= target + 20%
    // Round to nearest 5 seconds.
    const round5s = (s: number) => Math.max(5, Math.round(s / 5) * 5);
    const three = round5s(target3Star);
    const two = round5s(three * 1.1);
    const one = round5s(three * 1.2);
    return { one, two, three };
  }

  const three = roundByUnit(unit, target3Star);
  // Use exact thirds (not 0.33/0.66 approximations) so 200km -> 67/133/200.
  const one = roundByUnit(unit, three / 3);
  const two = roundByUnit(unit, (three * 2) / 3);
  const safeOne = Math.min(one, three);
  const safeTwo = Math.min(Math.max(two, safeOne), three);
  return { one: safeOne, two: safeTwo, three };
}

export function starsForProgress(progressValue: number, thresholds: { one: number; two: number; three: number }): number {
  const v = Math.max(0, progressValue);
  // For paceSec, lower is better and "progressValue" is best 1km time in seconds.
  // We use 0 as "no qualifying segment yet".
  if (thresholds.one >= thresholds.two && thresholds.two >= thresholds.three) {
    if (v <= 0) return 0;
    if (v <= thresholds.three) return 3;
    if (v <= thresholds.two) return 2;
    if (v <= thresholds.one) return 1;
    return 0;
  }

  if (v >= thresholds.three) return 3;
  if (v >= thresholds.two) return 2;
  if (v >= thresholds.one) return 1;
  return 0;
}

export function milestoneId(params: {
  monthKey: string;
  challengeId: MonthlyChallengeId;
  stage: number;
  star: Star;
}) {
  return `${params.monthKey}:${params.challengeId}:stage${params.stage}:star${params.star}`;
}

function roundToNearest2(x: number): number {
  // Round to an even number so XP values end with 0,2,4,6,8.
  return Math.max(0, Math.round(x / 2) * 2);
}

function stageMilestoneXp(challengeId: MonthlyChallengeId, stage: number): { 1: number; 2: number; 3: number } {
  const total = stageTotalXp(challengeId, stage);
  if (total <= 0) return { 1: 0, 2: 0, 3: 0 };

  // Allocate XP so that:
  // - values are even (end in 0,2,4,6,8)
  // - sum equals the stage total
  // - 3★ is never less than 1★/2★ (avoid confusing UX)
  // - Prefer strictly increasing (1★ < 2★ < 3★) when possible

  const raw1 = total * (monthlyXpConfig.starSplit[1] ?? 0);
  const raw2 = total * (monthlyXpConfig.starSplit[2] ?? 0);

  let x1 = roundToNearest2(raw1);
  let x2 = roundToNearest2(raw2);
  // Keep within total.
  if (x1 + x2 > total) {
    // Reduce x2 then x1 in even steps until it fits.
    while (x1 + x2 > total && x2 >= 2) x2 -= 2;
    while (x1 + x2 > total && x1 >= 2) x1 -= 2;
  }
  let x3 = total - x1 - x2;

  // Ensure non-negative / even.
  if (x3 < 0) x3 = 0;
  x3 -= x3 % 2;

  // If rounding caused leftover, distribute it to higher stars.
  let remainder = total - (x1 + x2 + x3);
  remainder -= remainder % 2;
  while (remainder >= 2) {
    x3 += 2;
    remainder -= 2;
  }

  // Enforce: 3★ >= 2★ and 3★ >= 1★ by shifting XP upward in 2pt steps.
  while (x3 < x2 && x2 >= 2) {
    x2 -= 2;
    x3 += 2;
  }
  while (x3 < x1 && x1 >= 2) {
    x1 -= 2;
    x3 += 2;
  }

  // Keep ordering 1★ <= 2★ <= 3★.
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (x3 < x2) [x2, x3] = [x3, x2];
  if (x2 < x1) [x1, x2] = [x2, x1];

  // If rounding makes the grants equal (common when totals are divisible cleanly),
  // nudge so milestones feel progressively more rewarding.
  // Example: total 60 -> 18/20/22 instead of 20/20/20.
  if (total >= 6) {
    if (x2 === x1 && x1 >= 2) {
      x1 -= 2;
      x2 += 2;
    }
    if (x3 === x2 && x1 >= 2) {
      x1 -= 2;
      x3 += 2;
    } else if (x3 === x2 && x2 >= 2) {
      x2 -= 2;
      x3 += 2;
    }
    // Re-normalize ordering after nudges.
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (x3 < x2) [x2, x3] = [x3, x2];
    if (x2 < x1) [x1, x2] = [x2, x1];
  }

  return { 1: x1, 2: x2, 3: x3 };
}

export function xpForMilestone(challengeId: MonthlyChallengeId, stage: number, star: Star): number {
  const split = stageMilestoneXp(challengeId, stage);
  return split[star] ?? 0;
}

export function stageTotalXp(challengeId: MonthlyChallengeId, stage: number): number {
  const stageArr = monthlyXpConfig.stageTotalXpByChallenge[challengeId] || [];
  const raw = Math.max(0, stageArr[stage] ?? 0);
  // Keep totals even so per-star XP can be even too.
  return raw - (raw % 2);
}

export function territoryRewardForMilestone(challengeId: MonthlyChallengeId, stage: number, star: Star): number {
  const base = monthlyTerritoryRewardConfig.baseRewardByChallenge[challengeId] ?? 0;
  const stageMult = monthlyTerritoryRewardConfig.stageMultiplier[stage] ?? 1;
  return Math.max(0, Math.round(base * stageMult * star));
}

export function getChallengeDefinition(id: MonthlyChallengeId): MonthlyChallengeDefinition {
  const found = monthlyChallenges.find((c) => c.id === id);
  if (!found) {
    // Should never happen; fallback to distance so UI doesn't crash.
    return monthlyChallenges[0];
  }
  return found;
}

export function thresholdsForStage(def: MonthlyChallengeDefinition, stage: number) {
  const override = def.stageStarThresholds?.[stage - 1];
  if (override) return override;
  const target3 =
    def.stageTargets3Star[stage - 1] ??
    def.stageTargets3Star[def.stageTargets3Star.length - 1] ??
    1;
  return computeStarThresholds(def.unit, target3);
}

export function initMonthlyChallengesState(now = new Date()): MonthlyChallengesState {
  const mk = monthKeyFromLocalDate(now);
  return {
    version: monthlyChallengeSettings.version,
    updatedAt: Date.now(),
    lastMonthKey: mk,
    stageUnlocked: {},
    months: {},
    totalChallengeXp: 0,
    totalTerritoryReward: 0,
  };
}

export function migrateMonthlyChallengesState(state: MonthlyChallengesState): MonthlyChallengesState {
  if ((state.version ?? 0) === monthlyChallengeSettings.version) return state;

  // Map legacy ids -> new ids.
  const mapId = (id: string): MonthlyChallengeId | null => {
    if (id === 'distance') return 'distance';
    if (id === 'timeOnFeet') return 'time';
    if (id === 'time') return 'time';
    if (id === 'pace') return 'pace';
    if (id === 'friends') return 'friends';
    if (id === 'ranking') return 'ranking';
    if (id === 'consistency') return 'consistency';
    if (id === 'longest') return 'longest';
    if (id === 'earlyBird') return 'earlyBird';
    if (id === 'nightOwl') return 'nightOwl';
    return null;
  };

  const stageUnlocked: MonthlyChallengesState['stageUnlocked'] = {};
  for (const [k, v] of Object.entries(state.stageUnlocked ?? {})) {
    const mapped = mapId(k);
    if (!mapped) continue;
    stageUnlocked[mapped] = v;
  }

  const months: MonthlyChallengesState['months'] = {};
  for (const [mk, month] of Object.entries(state.months ?? {})) {
    const nextChallenges: MonthlyChallengeMonthState['challenges'] = {};
    for (const [cid, prog] of Object.entries(month.challenges ?? {})) {
      const mapped = mapId(cid);
      if (!mapped) continue;
      // The Ranking challenge was redesigned (v6). Legacy progress isn't compatible, so reset it.
      if (mapped === 'ranking') continue;
      const p = prog as any;
      const rawMilestones = (p.milestonesGranted ?? []) as string[];
      const milestonesGranted = rawMilestones.map((m) => m.replace(':timeOnFeet:', ':time:'));
      nextChallenges[mapped] = {
        stage: p.stage ?? 1,
        progressValue: p.progressValue ?? 0,
        starsEarned: p.starsEarned ?? 0,
        milestonesGranted,
        meta: (p.meta ?? undefined) as any,
      };
    }
    months[mk] = {
      monthKey: month.monthKey ?? mk,
      challenges: nextChallenges,
      appliedRunIds: (month.appliedRunIds ?? []) as any,
      appliedEventIds: ((month as any).appliedEventIds ?? []) as any,
    };
  }

  // Recompute totals from milestone IDs under the new config.
  let xp = 0;
  let territory = 0;
  for (const [mk, month] of Object.entries(months)) {
    for (const [challengeId, prog] of Object.entries(month.challenges ?? {})) {
      const mapped = mapId(challengeId);
      if (!mapped) continue;
      for (const mid of (prog as any).milestonesGranted ?? []) {
        if (typeof mid !== 'string') continue;
        if (!mid.startsWith(`${mk}:`)) continue;
        const stageMatch = mid.match(/:stage(\d+):star([123])$/);
        if (!stageMatch) continue;
        const stage = Number(stageMatch[1]);
        const star = Number(stageMatch[2]) as Star;
        xp += xpForMilestone(mapped, stage, star);
        territory += territoryRewardForMilestone(mapped, stage, star);
      }
    }
  }

  // Do not regress totals during migration; keep prior totals if they were higher.
  const prevXp = state.totalChallengeXp ?? 0;
  const prevTerritory = state.totalTerritoryReward ?? 0;
  xp = Math.max(xp, prevXp);
  territory = Math.max(territory, prevTerritory);

  return {
    ...state,
    version: monthlyChallengeSettings.version,
    stageUnlocked,
    months,
    totalChallengeXp: xp,
    totalTerritoryReward: territory,
    updatedAt: Date.now(),
  };
}

export function ensureMonthBucket(
  state: MonthlyChallengesState,
  monthKey: string
): MonthlyChallengesState {
  const migrated = migrateMonthlyChallengesState(state);
  const next: MonthlyChallengesState = {
    ...migrated,
    months: { ...migrated.months },
  };
  if (!next.months[monthKey]) {
    next.months[monthKey] = {
      monthKey,
      challenges: {},
      appliedRunIds: [],
      appliedEventIds: [],
    };
  }
  return next;
}

export function pruneHistory(state: MonthlyChallengesState): MonthlyChallengesState {
  const keys = Object.keys(state.months).sort(); // YYYY-MM sorts lexicographically
  const max = monthlyChallengeSettings.maxHistoryMonths;
  if (keys.length <= max) return state;
  const toDrop = keys.slice(0, Math.max(0, keys.length - max));
  const months = { ...state.months };
  toDrop.forEach((k) => delete months[k]);
  return { ...state, months };
}

export function ensureMonthRollover(state: MonthlyChallengesState, now = new Date()): MonthlyChallengesState {
  state = migrateMonthlyChallengesState(state);
  const mk = monthKeyFromLocalDate(now);
  if (state.lastMonthKey === mk) return state;

  let next: MonthlyChallengesState = {
    ...state,
    lastMonthKey: mk,
    updatedAt: Date.now(),
  };

  // Optionally reset unlocked stage (default: keep).
  if (monthlyChallengeSettings.resetUnlockedStageOnMonthReset) {
    next = { ...next, stageUnlocked: {} };
  }

  // Ensure the new month exists so UI can show empty progress immediately.
  next = ensureMonthBucket(next, mk);
  next = pruneHistory(next);
  return next;
}

function contributionForChallenge(ch: MonthlyChallengeId, run: RunDoc): number {
  if (ch === 'distance') return (run.distance ?? 0) / 1000;
  if (ch === 'time') return run.elapsedSeconds ?? 0;
  // Pace is not accumulated; handled separately.
  if (ch === 'pace') return 0;
  // Friends is event-based, not run-based.
  if (ch === 'friends') return 0;
  // Ranking is snapshot-based, not run-based.
  if (ch === 'ranking') return 0;
  // Consistency is unique-day based; handled in applyRunToMonthlyChallenges.
  if (ch === 'consistency') return 0;
  // Countries/states are unique-region based; handled in applyRunToMonthlyChallenges.
  if (ch === 'countries' || ch === 'states') return 0;
  // Longest run is best-of-month based; handled in applyRunToMonthlyChallenges.
  if (ch === 'longest') return 0;
  if (ch === 'earlyBird') {
    if (!isQualifyingRunForCountChallenges(run)) return 0;
    const d = new Date(run.startedAt);
    const m = minuteOfDayLocal(d);
    return isWithinWindow(m, monthlyTimeWindows.earlyBird) ? 1 : 0;
  }
  if (ch === 'nightOwl') {
    if (!isQualifyingRunForCountChallenges(run)) return 0;
    const d = new Date(run.startedAt);
    const m = minuteOfDayLocal(d);
    return isWithinWindow(m, monthlyTimeWindows.nightOwl) ? 1 : 0;
  }
  return 0;
}

export function applyRunToMonthlyChallenges(params: {
  state: MonthlyChallengesState;
  userId: string;
  runId: string;
  run: RunDoc;
}): { nextState: MonthlyChallengesState; awardedMilestones: string[] } {
  const { state, runId, run } = params;
  if (!run?.startedAt) {
    if (__DEV__) console.log('[MonthlyChallenges] ingest skipped missing startedAt', runId);
    return { nextState: state, awardedMilestones: [] };
  }

  const runDate = new Date(run.startedAt);
  const mk = bucketKeyForChallenge('distance', runDate); // default monthly bucket
  // Allow per-challenge bucket overrides (e.g., yearly for countries/states) further below.
  let workingState = ensureMonthBucket(state, mk);
  workingState = ensureMonthRollover(workingState, new Date());

  let next = workingState;

  const month = next.months[mk];
  if (month.appliedRunIds.includes(runId)) {
    // Already applied. However, for pace we may need to backfill if we previously failed to compute a segment.
    const paceDef = monthlyChallenges.find((c) => c.id === 'pace');
    const paceExisting = month.challenges?.pace;
    const paceStageUnlocked = next.stageUnlocked.pace ?? 1;
    const paceStage = paceExisting?.stage ?? paceStageUnlocked;
    const paceStageMax = paceDef ? paceDef.maxStage : 0;
    const paceThresholds = paceDef ? thresholdsForStage(paceDef, paceStage) : null;
    const pacePrevProgress = paceExisting?.progressValue ?? 0;
    const pacePrevStars =
      paceThresholds && paceExisting ? paceExisting.starsEarned ?? starsForProgress(pacePrevProgress, paceThresholds) : 0;

    if (paceDef && paceThresholds && (pacePrevProgress ?? 0) <= 0) {
      const awarded: string[] = [];
      let xpDelta = 0;
      let territoryDelta = 0;

      const timedRoute = normalizeTimedRoute(run);
      let best = computeFastestSegmentSeconds(timedRoute, {
        segmentMeters: monthlyPaceConfig.segmentMeters,
        minRunDistanceMeters: monthlyPaceConfig.minRunDistanceMeters,
        allowScalePolylineToRunDistance: monthlyPaceConfig.allowScalePolylineToRunDistance,
        runDistanceMeters: run.distance ?? 0,
      });
      if (
        !best &&
        typeof run.distance === 'number' &&
        run.distance >= monthlyPaceConfig.segmentMeters &&
        typeof run.elapsedSeconds === 'number' &&
        run.elapsedSeconds > 0
      ) {
        const avgSecPerMeter = run.elapsedSeconds / Math.max(1, run.distance);
        best = Math.max(1, Math.round(avgSecPerMeter * monthlyPaceConfig.segmentMeters));
      }

      if (best) {
        const existingMilestones = new Set(paceExisting?.milestonesGranted ?? []);
        let stageCursor = paceStage;
        let unlockedStage = paceStageUnlocked;
        let workingBest = best;
        let workingPrevStars = pacePrevStars;
        let workingThresholds = paceThresholds;

        while (paceDef && stageCursor <= paceStageMax) {
          const stars = starsForProgress(workingBest, workingThresholds);
          for (const star of [1, 2, 3] as Star[]) {
            if (stars >= star && workingPrevStars < star) {
              const mid = milestoneId({ monthKey: mk, challengeId: paceDef.id, stage: stageCursor, star });
              if (!existingMilestones.has(mid)) {
                existingMilestones.add(mid);
                awarded.push(mid);
                xpDelta += xpForMilestone(paceDef.id, stageCursor, star);
                territoryDelta += territoryRewardForMilestone(paceDef.id, stageCursor, star);
              }
            }
          }

          if (stars >= 3 && stageCursor < paceStageMax) {
            unlockedStage = Math.max(unlockedStage, stageCursor + 1);
            stageCursor += 1;
            workingPrevStars = 0;
            workingThresholds = thresholdsForStage(paceDef, stageCursor);
            continue;
          }
          break;
        }

        next.stageUnlocked = { ...next.stageUnlocked, pace: unlockedStage };
        next.months[mk] = {
          ...month,
          challenges: {
            ...month.challenges,
            pace: {
              stage: stageCursor,
              progressValue: workingBest,
              starsEarned: starsForProgress(workingBest, thresholdsForStage(paceDef, stageCursor)),
              milestonesGranted: Array.from(existingMilestones),
            },
          },
        };
        next.totalChallengeXp = (next.totalChallengeXp ?? 0) + xpDelta;
        next.totalTerritoryReward = (next.totalTerritoryReward ?? 0) + territoryDelta;
        next.updatedAt = Date.now();
      }

      return { nextState: pruneHistory(next), awardedMilestones: awarded };
    }

    return { nextState: next, awardedMilestones: [] };
  }

  const updatedMonth: MonthlyChallengeMonthState = {
    ...month,
    appliedRunIds: [runId, ...month.appliedRunIds].slice(0, 500),
    appliedEventIds: [...month.appliedEventIds],
    challenges: { ...month.challenges },
  };

  const awarded: string[] = [];
  let xpDelta = 0;
  let territoryDelta = 0;

  for (const def of monthlyChallenges) {
    const unlocked = next.stageUnlocked[def.id] ?? 1;
    const existing = updatedMonth.challenges[def.id];
    const stage = existing?.stage ?? unlocked;
    const stageMax = def.maxStage ?? def.stageTargets3Star.length;
    const safeStage = Math.min(Math.max(1, stage), stageMax);
    const thresholds = thresholdsForStage(def, safeStage);

    const prevProgress = existing?.progressValue ?? 0;
    const prevStars = existing?.starsEarned ?? starsForProgress(prevProgress, thresholds);
    const milestonesGranted = new Set(existing?.milestonesGranted ?? []);

    if (def.id === 'consistency') {
      // Count unique calendar days (local time) in the month with at least one qualifying run.
      // Uses an idempotent per-day event id, stored in month.appliedEventIds.
      const dayKey = dayKeyFromLocalDate(runDate);
      const eventId = `consistency:${dayKey}`;

      if (!isQualifyingRunForCountChallenges(run) || updatedMonth.appliedEventIds.includes(eventId)) {
        updatedMonth.challenges[def.id] = {
          stage: safeStage,
          progressValue: prevProgress,
          starsEarned: prevStars,
          milestonesGranted: Array.from(milestonesGranted),
        };
        continue;
      }

      updatedMonth.appliedEventIds = [eventId, ...updatedMonth.appliedEventIds].slice(0, 500);
      const nextProgress = prevProgress + 1;
      const nextStars = starsForProgress(nextProgress, thresholds);

      for (const star of [1, 2, 3] as Star[]) {
        if (nextStars >= star && prevStars < star) {
          const mid = milestoneId({ monthKey: mk, challengeId: def.id, stage: safeStage, star });
          if (!milestonesGranted.has(mid)) {
            milestonesGranted.add(mid);
            awarded.push(mid);
            xpDelta += xpForMilestone(def.id, safeStage, star);
            territoryDelta += territoryRewardForMilestone(def.id, safeStage, star);
          }
        }
      }

      const canAdvance = nextStars >= 3 && safeStage < stageMax;
      if (canAdvance) {
        const newlyUnlocked = Math.max(unlocked, safeStage + 1);
        next.stageUnlocked = { ...next.stageUnlocked, [def.id]: newlyUnlocked };
        if (!monthlyChallengeSettings.carryOverToNextStage) {
          updatedMonth.challenges[def.id] = {
            stage: newlyUnlocked,
            progressValue: 0,
            starsEarned: 0,
            milestonesGranted: [],
          };
          continue;
        }
      }

      updatedMonth.challenges[def.id] = {
        stage: safeStage,
        progressValue: nextProgress,
        starsEarned: nextStars,
        milestonesGranted: Array.from(milestonesGranted),
      };
      continue;
    }

    if (def.id === 'countries' || def.id === 'states') {
      const codeRaw =
        def.id === 'countries'
          ? (run.countryCode ?? '').trim()
          : (run.stateCode ?? run.stateName ?? '').trim();
      if (!codeRaw) {
        updatedMonth.challenges[def.id] = {
          stage: safeStage,
          progressValue: prevProgress,
          starsEarned: prevStars,
          milestonesGranted: Array.from(milestonesGranted),
        };
        continue;
      }
      const code = codeRaw.toUpperCase();
      const eventId = `${def.id}:${code}`;

      if (updatedMonth.appliedEventIds.includes(eventId)) {
        updatedMonth.challenges[def.id] = {
          stage: safeStage,
          progressValue: prevProgress,
          starsEarned: prevStars,
          milestonesGranted: Array.from(milestonesGranted),
        };
        continue;
      }

      updatedMonth.appliedEventIds = [eventId, ...updatedMonth.appliedEventIds].slice(0, 500);
      const nextProgress = prevProgress + 1;
      const nextStars = starsForProgress(nextProgress, thresholds);

      for (const star of [1, 2, 3] as Star[]) {
        if (nextStars >= star && prevStars < star) {
          const mid = milestoneId({ monthKey: mk, challengeId: def.id, stage: safeStage, star });
          if (!milestonesGranted.has(mid)) {
            milestonesGranted.add(mid);
            awarded.push(mid);
            xpDelta += xpForMilestone(def.id, safeStage, star);
            territoryDelta += territoryRewardForMilestone(def.id, safeStage, star);
          }
        }
      }

      const canAdvance = nextStars >= 3 && safeStage < stageMax;
      if (canAdvance) {
        const newlyUnlocked = Math.max(unlocked, safeStage + 1);
        next.stageUnlocked = { ...next.stageUnlocked, [def.id]: newlyUnlocked };
        if (!monthlyChallengeSettings.carryOverToNextStage) {
          updatedMonth.challenges[def.id] = {
            stage: newlyUnlocked,
            progressValue: 0,
            starsEarned: 0,
            milestonesGranted: [],
          };
          continue;
        }
      }

      updatedMonth.challenges[def.id] = {
        stage: safeStage,
        progressValue: nextProgress,
        starsEarned: nextStars,
        milestonesGranted: Array.from(milestonesGranted),
      };
      continue;
    }

    if (def.id === 'longest') {
      const runKm = Math.max(0, (run.distance ?? 0) / 1000);
      const nextProgress = Math.max(prevProgress, runKm);
      const nextStars = starsForProgress(nextProgress, thresholds);

      for (const star of [1, 2, 3] as Star[]) {
        if (nextStars >= star && prevStars < star) {
          const mid = milestoneId({ monthKey: mk, challengeId: def.id, stage: safeStage, star });
          if (!milestonesGranted.has(mid)) {
            milestonesGranted.add(mid);
            awarded.push(mid);
            xpDelta += xpForMilestone(def.id, safeStage, star);
            territoryDelta += territoryRewardForMilestone(def.id, safeStage, star);
          }
        }
      }

      const canAdvance = nextStars >= 3 && safeStage < stageMax;
      if (canAdvance) {
        const newlyUnlocked = Math.max(unlocked, safeStage + 1);
        next.stageUnlocked = { ...next.stageUnlocked, [def.id]: newlyUnlocked };
        if (!monthlyChallengeSettings.carryOverToNextStage) {
          updatedMonth.challenges[def.id] = {
            stage: newlyUnlocked,
            progressValue: 0,
            starsEarned: 0,
            milestonesGranted: [],
          };
          continue;
        }
      }

      updatedMonth.challenges[def.id] = {
        stage: safeStage,
        progressValue: nextProgress,
        starsEarned: nextStars,
        milestonesGranted: Array.from(milestonesGranted),
      };
      continue;
    }

    if (def.id === 'pace') {
      const timedRoute = normalizeTimedRoute(run);
      let best = computeFastestSegmentSeconds(timedRoute, {
        segmentMeters: monthlyPaceConfig.segmentMeters,
        minRunDistanceMeters: monthlyPaceConfig.minRunDistanceMeters,
        allowScalePolylineToRunDistance: monthlyPaceConfig.allowScalePolylineToRunDistance,
        runDistanceMeters: run.distance ?? 0,
      });

      // Fallback: if we couldn't compute a segment but the run qualifies by distance,
      // approximate with average pace so the user still sees a best pace value.
      if (
        (!best || best === Infinity) &&
        typeof run.distance === 'number' &&
        run.distance >= monthlyPaceConfig.segmentMeters &&
        typeof run.elapsedSeconds === 'number' &&
        run.elapsedSeconds > 0
      ) {
        const avgSecPerMeter = run.elapsedSeconds / Math.max(1, run.distance);
        best = Math.max(1, Math.round(avgSecPerMeter * monthlyPaceConfig.segmentMeters));
      }

      const prevBest = prevProgress > 0 ? prevProgress : 0;
      const nextBest = best ? (prevBest > 0 ? Math.min(prevBest, best) : best) : prevBest;

      // Allow a single stellar run to progress through multiple stages.
      let stageCursor = safeStage;
      let unlockedStage = unlocked;
      let workingBest = nextBest;
      let workingPrevStars = prevStars;
      let workingThresholds = thresholdsForStage(def, stageCursor);

      while (stageCursor <= stageMax) {
        const stars = starsForProgress(workingBest, workingThresholds);
        for (const star of [1, 2, 3] as Star[]) {
          if (stars >= star && workingPrevStars < star) {
            const mid = milestoneId({ monthKey: mk, challengeId: def.id, stage: stageCursor, star });
            if (!milestonesGranted.has(mid)) {
              milestonesGranted.add(mid);
              awarded.push(mid);
              xpDelta += xpForMilestone(def.id, stageCursor, star);
              territoryDelta += territoryRewardForMilestone(def.id, stageCursor, star);
            }
          }
        }

        if (stars >= 3 && stageCursor < stageMax) {
          unlockedStage = Math.max(unlockedStage, stageCursor + 1);
          stageCursor += 1;
          workingPrevStars = 0;
          workingThresholds = thresholdsForStage(def, stageCursor);
          continue;
        }
        break;
      }

      next.stageUnlocked = { ...next.stageUnlocked, [def.id]: unlockedStage };
      updatedMonth.challenges[def.id] = {
        stage: stageCursor,
        progressValue: workingBest,
        starsEarned: starsForProgress(workingBest, thresholdsForStage(def, stageCursor)),
        milestonesGranted: Array.from(milestonesGranted),
      };
      continue;
    }

    const inc = contributionForChallenge(def.id, run);
    if (inc <= 0) {
      // Ensure stage is reflected even if no progress this run, so UI label is correct.
      updatedMonth.challenges[def.id] = {
        stage: safeStage,
        progressValue: prevProgress,
        starsEarned: prevStars,
        milestonesGranted: Array.from(milestonesGranted),
      };
      continue;
    }

    const nextProgress = prevProgress + inc;
    let nextStars = starsForProgress(nextProgress, thresholds);

    for (const star of [1, 2, 3] as Star[]) {
      if (nextStars >= star && prevStars < star) {
        const mid = milestoneId({ monthKey: mk, challengeId: def.id, stage: safeStage, star });
        if (!milestonesGranted.has(mid)) {
          milestonesGranted.add(mid);
          awarded.push(mid);
          xpDelta += xpForMilestone(def.id, safeStage, star);
          territoryDelta += territoryRewardForMilestone(def.id, safeStage, star);
        }
      }
    }

    // If completed 3★ and there is a next stage, unlock it and reset month progress for the new stage.
    const canAdvance = nextStars >= 3 && safeStage < stageMax;
    if (canAdvance) {
      const newlyUnlocked = Math.max(unlocked, safeStage + 1);
      next.stageUnlocked = { ...next.stageUnlocked, [def.id]: newlyUnlocked };
      if (!monthlyChallengeSettings.carryOverToNextStage) {
        updatedMonth.challenges[def.id] = {
          stage: newlyUnlocked,
          progressValue: 0,
          starsEarned: 0,
          milestonesGranted: [],
        };
        continue;
      }
    }

    updatedMonth.challenges[def.id] = {
      stage: safeStage,
      progressValue: nextProgress,
      starsEarned: nextStars,
      milestonesGranted: Array.from(milestonesGranted),
    };
  }

  next = {
    ...next,
    months: { ...next.months, [mk]: updatedMonth },
    totalChallengeXp: (next.totalChallengeXp ?? 0) + xpDelta,
    totalTerritoryReward: (next.totalTerritoryReward ?? 0) + territoryDelta,
    updatedAt: Date.now(),
  };

  next = pruneHistory(next);
  return { nextState: next, awardedMilestones: awarded };
}

export function applyMonthlyEventIncrement(params: {
  state: MonthlyChallengesState;
  monthKey: string;
  challengeId: MonthlyChallengeId;
  eventId: string;
  amount: number;
}): { nextState: MonthlyChallengesState; awardedMilestones: string[] } {
  const { state, monthKey, challengeId, eventId, amount } = params;
  if (amount <= 0) return { nextState: state, awardedMilestones: [] };

  let next = ensureMonthBucket(state, monthKey);
  next = ensureMonthRollover(next, new Date());

  const month = next.months[monthKey];
  if (month.appliedEventIds.includes(eventId)) {
    return { nextState: next, awardedMilestones: [] };
  }

  const def = getChallengeDefinition(challengeId);
  const unlocked = next.stageUnlocked[challengeId] ?? 1;
  const existing = month.challenges[challengeId];
  const stageMax = def.maxStage ?? def.stageTargets3Star.length;
  const stage = existing?.stage ?? unlocked;
  const safeStage = Math.min(Math.max(1, stage), stageMax);
  const thresholds = thresholdsForStage(def, safeStage);

  const prevProgress = existing?.progressValue ?? 0;
  const prevStars = existing?.starsEarned ?? starsForProgress(prevProgress, thresholds);
  const milestonesGranted = new Set(existing?.milestonesGranted ?? []);

  const nextProgress = prevProgress + amount;
  const nextStars = starsForProgress(nextProgress, thresholds);

  const awarded: string[] = [];
  let xpDelta = 0;
  let territoryDelta = 0;

  for (const star of [1, 2, 3] as Star[]) {
    if (nextStars >= star && prevStars < star) {
      const mid = milestoneId({ monthKey, challengeId, stage: safeStage, star });
      if (!milestonesGranted.has(mid)) {
        milestonesGranted.add(mid);
        awarded.push(mid);
        xpDelta += xpForMilestone(challengeId, safeStage, star);
        territoryDelta += territoryRewardForMilestone(challengeId, safeStage, star);
      }
    }
  }

  const updatedMonth: MonthlyChallengeMonthState = {
    ...month,
    appliedEventIds: [eventId, ...month.appliedEventIds].slice(0, 500),
    challenges: {
      ...month.challenges,
      [challengeId]: {
        stage: safeStage,
        progressValue: nextProgress,
        starsEarned: nextStars,
        milestonesGranted: Array.from(milestonesGranted),
      },
    },
  };

  // Advance stage on 3★
  const canAdvance = nextStars >= 3 && safeStage < stageMax;
  if (canAdvance) {
    const newlyUnlocked = Math.max(unlocked, safeStage + 1);
    next.stageUnlocked = { ...next.stageUnlocked, [challengeId]: newlyUnlocked };
    if (!monthlyChallengeSettings.carryOverToNextStage) {
      updatedMonth.challenges[challengeId] = {
        stage: newlyUnlocked,
        progressValue: 0,
        starsEarned: 0,
        milestonesGranted: [],
      };
    }
  }

  next = {
    ...next,
    months: { ...next.months, [monthKey]: updatedMonth },
    totalChallengeXp: (next.totalChallengeXp ?? 0) + xpDelta,
    totalTerritoryReward: (next.totalTerritoryReward ?? 0) + territoryDelta,
    updatedAt: Date.now(),
  };
  next = pruneHistory(next);
  return { nextState: next, awardedMilestones: awarded };
}

export type RankingScope = 'state' | 'country' | 'world';

export type RankingStars = {
  top25: boolean;
  top10: boolean;
  top3: boolean;
};

type RankingScopeMeta = {
  bestRank?: number;
  lastKnownRank?: number;
  lastRankCheckedAtMs?: number;
  stars?: RankingStars;
};

type RankingMeta = {
  scopes?: Partial<Record<RankingScope, RankingScopeMeta>>;
};

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

export function evaluateRankingStars(params: {
  scope: RankingScope;
  position: number | null;
}): RankingStars {
  const pos = typeof params.position === 'number' ? Math.floor(params.position) : NaN;
  if (!Number.isFinite(pos) || pos <= 0) {
    return { top25: false, top10: false, top3: false };
  }
  return {
    top25: pos <= 25,
    top10: pos <= 10,
    top3: pos <= 3,
  };
}

export function applyRankingSnapshotToMonthlyChallenges(params: {
  state: MonthlyChallengesState;
  atMs: number;
  rank: number;
  scope: RankingScope;
}): { nextState: MonthlyChallengesState; awardedMilestones: string[] } {
  const { state, atMs } = params;
  const rank = Number.isFinite(params.rank) ? Math.floor(params.rank) : NaN;
  if (!Number.isFinite(rank) || rank <= 0) {
    return { nextState: state, awardedMilestones: [] };
  }
  const mk = monthKeyFromEpochMsLocal(atMs);
  let next = ensureMonthBucket(state, mk);
  next = ensureMonthRollover(next, new Date());

  const month = next.months[mk];
  const def = getChallengeDefinition('ranking');
  const existing = month.challenges.ranking;
  const unlocked = next.stageUnlocked['ranking'] ?? 1;
  const stageMax = def.maxStage ?? def.stageTargets3Star.length;
  const currentStage = Math.min(Math.max(1, existing?.stage ?? unlocked), stageMax);
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const scopeStage: Record<RankingScope, number> = { state: 1, country: 2, world: 3 };
  const stage = scopeStage[params.scope];

  if (stage > unlocked) {
    if (isDev) {
      throw new Error(`[RankingChallenge] scope=${params.scope} stage=${stage} not unlocked (unlocked=${unlocked})`);
    }
    return { nextState: next, awardedMilestones: [] };
  }

  const milestonesGranted = new Set(existing?.milestonesGranted ?? []);
  const meta: RankingMeta = stripUndefined({ ...(existing?.meta as RankingMeta | undefined) } as any);
  const scopes = { ...(meta.scopes ?? {}) };
  const prevScopeMeta = scopes[params.scope] ?? {};
  const lastChecked = typeof prevScopeMeta.lastRankCheckedAtMs === 'number' ? prevScopeMeta.lastRankCheckedAtMs : 0;
  if (lastChecked && atMs <= lastChecked) {
    return { nextState: next, awardedMilestones: [] };
  }

  const evaluated = evaluateRankingStars({ scope: params.scope, position: rank });
  const prevStars: RankingStars = prevScopeMeta.stars ?? { top25: false, top10: false, top3: false };
  const nextStars: RankingStars = {
    top25: prevStars.top25 || evaluated.top25,
    top10: prevStars.top10 || evaluated.top10,
    top3: prevStars.top3 || evaluated.top3,
  };
  if (isDev && params.scope === 'world' && rank === 1) {
    if (!(nextStars.top25 && nextStars.top10 && nextStars.top3)) {
      console.error('[RankingChallengeInvariant] world rank=1 but stars not fully set', {
        scope: params.scope,
        rank,
        prevStars,
        evaluated,
        nextStars,
      });
      throw new Error('RankingChallenge invariant failed for world rank=1');
    }
  }
  const bestRank =
    typeof prevScopeMeta.bestRank === 'number' && prevScopeMeta.bestRank > 0
      ? Math.min(prevScopeMeta.bestRank, rank)
      : rank;

  const prevStarCount = prevStars.top3 ? 3 : prevStars.top10 ? 2 : prevStars.top25 ? 1 : 0;
  const nextStarCount = nextStars.top3 ? 3 : nextStars.top10 ? 2 : nextStars.top25 ? 1 : 0;

  if (isDev) {
    if (existing?.stage && existing.stage < currentStage) {
      throw new Error(`[RankingChallenge] stage regressed: ${existing.stage} -> ${currentStage}`);
    }
    if (nextStarCount < prevStarCount) {
      throw new Error(`[RankingChallenge] stars regressed for scope=${params.scope}`);
    }
    if (stage > unlocked && nextStarCount > 0) {
      throw new Error(`[RankingChallenge] stars recorded for locked stage=${stage}`);
    }
  }

  const awarded: string[] = [];
  let xpDelta = 0;
  let territoryDelta = 0;

  ([
    [1, prevStars.top25, nextStars.top25],
    [2, prevStars.top10, nextStars.top10],
    [3, prevStars.top3, nextStars.top3],
  ] as Array<[Star, boolean, boolean]>).forEach(([star, prev, nextStar]) => {
    if (nextStar && !prev) {
      const mid = milestoneId({ monthKey: mk, challengeId: 'ranking', stage, star });
      if (!milestonesGranted.has(mid)) {
        milestonesGranted.add(mid);
        awarded.push(mid);
        xpDelta += xpForMilestone('ranking', stage, star);
        territoryDelta += territoryRewardForMilestone('ranking', stage, star);
      }
    }
  });

  scopes[params.scope] = stripUndefined({
    bestRank,
    lastKnownRank: rank,
    lastRankCheckedAtMs: atMs,
    stars: nextStars,
  } as any);

  const updatedMonth: MonthlyChallengeMonthState = {
    ...month,
    challenges: {
      ...month.challenges,
      ranking: {
        stage: currentStage,
        progressValue: stage === currentStage ? bestRank : existing?.progressValue ?? 0,
        starsEarned: stage === currentStage ? nextStarCount : existing?.starsEarned ?? 0,
        milestonesGranted: Array.from(milestonesGranted),
        meta: stripUndefined({ ...meta, scopes } as any),
      },
    },
  };

  let nextStageValue = currentStage;
  if (stage === currentStage && nextStarCount >= 3 && currentStage < stageMax) {
    const newlyUnlocked = Math.max(unlocked, currentStage + 1);
    next.stageUnlocked = { ...next.stageUnlocked, ranking: newlyUnlocked };
    nextStageValue = newlyUnlocked;
    updatedMonth.challenges.ranking = {
      stage: newlyUnlocked,
      progressValue: 0,
      starsEarned: 0,
      milestonesGranted: Array.from(milestonesGranted),
      meta: stripUndefined({ ...meta, scopes } as any),
    };
  }

  if (isDev) {
    const prevStage = existing?.stage ?? currentStage;
    if (nextStageValue < prevStage) {
      throw new Error(`[RankingChallenge] stage regressed: ${prevStage} -> ${nextStageValue}`);
    }
    if (stage > nextStageValue && nextStarCount > 0) {
      throw new Error(`[RankingChallenge] stars recorded for inactive stage=${stage}`);
    }
  }

  next = {
    ...next,
    months: { ...next.months, [mk]: updatedMonth },
    totalChallengeXp: (next.totalChallengeXp ?? 0) + xpDelta,
    totalTerritoryReward: (next.totalTerritoryReward ?? 0) + territoryDelta,
    updatedAt: Date.now(),
  };
  next = pruneHistory(next);
  return { nextState: next, awardedMilestones: awarded };
}

function starsFromMilestones(params: {
  milestonesGranted?: string[];
  challengeId: MonthlyChallengeId;
  stage: number;
}): number {
  const { milestonesGranted, challengeId, stage } = params;
  if (!milestonesGranted?.length) return 0;
  const re = new RegExp(`:${challengeId}:stage${stage}:star(\\d+)`);
  let maxStar = 0;
  for (const mid of milestonesGranted) {
    if (typeof mid !== 'string') continue;
    const match = mid.match(re);
    if (!match) continue;
    const star = Number(match[1]);
    if (Number.isFinite(star)) {
      maxStar = Math.max(maxStar, star);
    }
  }
  return Math.min(3, maxStar);
}

export function buildMonthlyChallengeViews(state: MonthlyChallengesState, now = new Date()): MonthlyChallengeView[] {
  const mk = monthKeyFromLocalDate(now);
  const month = state.months[mk] ?? { monthKey: mk, challenges: {}, appliedRunIds: [], appliedEventIds: [] };
  return monthlyChallenges.map((def) => {
    const unlocked = state.stageUnlocked[def.id] ?? 1;
    const ch = month.challenges[def.id];
    const stage = Math.max(unlocked, ch?.stage ?? 0);
    const safeStage = Math.min(Math.max(1, stage), def.maxStage);
    const thresholds = thresholdsForStage(def, safeStage);
    const progressValueRaw = ch?.progressValue ?? 0;
    const baseMeta = (ch?.meta ?? undefined) as Record<string, unknown> | undefined;
    let progressValue = progressValueRaw;
    let starsEarned = ch?.starsEarned ?? starsForProgress(progressValue, thresholds);
    if (def.id === 'ranking') {
      const m = (baseMeta ?? {}) as any as RankingMeta;
      const scope: RankingScope = safeStage === 1 ? 'state' : safeStage === 2 ? 'country' : 'world';
      const scopeMeta = m.scopes?.[scope];
      const scopeStars = scopeMeta?.stars;
      const hasScopeStars = !!scopeStars;
      const starCount = scopeStars?.top3 ? 3 : scopeStars?.top10 ? 2 : scopeStars?.top25 ? 1 : 0;
      const bestRank = scopeMeta?.bestRank ?? 0;
      progressValue = bestRank > 0 ? bestRank : progressValueRaw;
      starsEarned = hasScopeStars ? starCount : starsEarned;
    }

    let nextStarTarget: number | undefined;
    if (starsEarned < 1) nextStarTarget = thresholds.one;
    else if (starsEarned < 2) nextStarTarget = thresholds.two;
    else if (starsEarned < 3) nextStarTarget = thresholds.three;

    const earnedXpThisStage =
      (starsEarned >= 1 ? xpForMilestone(def.id, safeStage, 1) : 0) +
      (starsEarned >= 2 ? xpForMilestone(def.id, safeStage, 2) : 0) +
      (starsEarned >= 3 ? xpForMilestone(def.id, safeStage, 3) : 0);
    const totalXp = stageTotalXp(def.id, safeStage);
    const nextMilestoneXp =
      starsEarned < 3
        ? xpForMilestone(def.id, safeStage, ((starsEarned + 1) as Star))
        : undefined;

    let meta = baseMeta;
    if (def.id === 'ranking') {
      meta = {
        scopes: (baseMeta as any)?.scopes ?? {},
      };
    }

    return {
      id: def.id,
      baseLabel: def.baseLabel,
      title: `${def.baseLabel} ${romanNumeral(safeStage)}`,
      description: def.description,
      unit: def.unit,
      stage: safeStage,
      stageMax: def.maxStage,
      progressValue,
      starsEarned,
      starThresholds: thresholds,
      nextStarTarget,
      earnedXpThisStage,
      stageTotalXp: totalXp,
      nextMilestoneXp,
      meta,
    };
  });
}

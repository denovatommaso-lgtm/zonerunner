import type { RunDoc } from './runService';
import {
  monthlyChallengeSettings,
  monthlyTerritoryRewardConfig,
  monthlyXpConfig,
  yearlyChallengeDefinitions,
  type MonthlyChallengeDefinition,
  type MonthlyChallengeId,
  type Star,
} from './monthlyChallengesConfig';
import {
  milestoneId,
  romanNumeral,
  starsForProgress,
  thresholdsForStage,
  xpForMilestone,
  territoryRewardForMilestone,
} from './monthlyChallenges';

export type YearKey = `YEAR-${number}`;

export type YearlyChallengeProgress = {
  stage: number;
  progressValue: number;
  starsEarned: number;
  milestonesGranted: string[];
};

export type YearlyChallengeMonthState = {
  yearKey: YearKey;
  challenges: Partial<Record<MonthlyChallengeId, YearlyChallengeProgress>>;
  appliedRunIds: string[];
  appliedEventIds: string[];
};

export type YearlyChallengesState = {
  version: number;
  updatedAt: number;
  lastYearKey: YearKey;
  stageUnlocked: Partial<Record<MonthlyChallengeId, number>>;
  years: Record<YearKey, YearlyChallengeMonthState>;
  totalChallengeXp: number;
  totalTerritoryReward: number;
};

function yearKeyFromDate(d: Date): YearKey {
  return `YEAR-${d.getFullYear()}`;
}

export function initYearlyChallengesState(now = new Date()): YearlyChallengesState {
  const yk = yearKeyFromDate(now);
  return {
    version: monthlyChallengeSettings.version,
    updatedAt: Date.now(),
    lastYearKey: yk,
    stageUnlocked: {},
    years: {},
    totalChallengeXp: 0,
    totalTerritoryReward: 0,
  };
}

function ensureYearBucket(state: YearlyChallengesState, yk: YearKey): YearlyChallengesState {
  const next: YearlyChallengesState = { ...state, years: { ...state.years } };
  if (!next.years[yk]) {
    next.years[yk] = {
      yearKey: yk,
      challenges: {},
      appliedRunIds: [],
      appliedEventIds: [],
    };
  }
  return next;
}

export function ensureYearRollover(state: YearlyChallengesState, now = new Date()): YearlyChallengesState {
  const yk = yearKeyFromDate(now);
  if (state.lastYearKey === yk) return state;
  let next: YearlyChallengesState = {
    ...state,
    lastYearKey: yk,
    updatedAt: Date.now(),
  };
  if (monthlyChallengeSettings.resetUnlockedStageOnMonthReset) {
    next = { ...next, stageUnlocked: {} };
  }
  next = ensureYearBucket(next, yk);
  return next;
}

function yearlyDefs(): MonthlyChallengeDefinition[] {
  return yearlyChallengeDefinitions;
}

export function applyRunToYearlyChallenges(params: {
  state: YearlyChallengesState;
  runId: string;
  run: RunDoc;
}): { nextState: YearlyChallengesState; awardedMilestones: string[] } {
  const { state, runId, run } = params;
  const runDateRaw = new Date(run.startedAt);
  const runDate = Number.isFinite(runDateRaw.getTime()) ? runDateRaw : new Date();
  const yk = yearKeyFromDate(runDate);

  let next = ensureYearRollover(state, new Date());
  next = ensureYearBucket(next, yk);

  const year = next.years[yk];
  if (year.appliedRunIds.includes(runId)) return { nextState: next, awardedMilestones: [] };

  const updatedYear: YearlyChallengeMonthState = {
    ...year,
    appliedRunIds: [runId, ...year.appliedRunIds].slice(0, 500),
    appliedEventIds: [...year.appliedEventIds],
    challenges: { ...year.challenges },
  };

  const awarded: string[] = [];
  let xpDelta = 0;
  let territoryDelta = 0;

  for (const def of yearlyDefs()) {
    const unlocked = next.stageUnlocked[def.id] ?? 1;
    const existing = updatedYear.challenges[def.id];
    const stage = existing?.stage ?? unlocked;
    const stageMax = def.maxStage ?? def.stageTargets3Star.length;
    const safeStage = Math.min(Math.max(1, stage), stageMax);
    const thresholds = thresholdsForStage(def, safeStage);

    const prevProgress = existing?.progressValue ?? 0;
    const prevStars = existing?.starsEarned ?? starsForProgress(prevProgress, thresholds);
    const milestonesGranted = new Set(existing?.milestonesGranted ?? []);

    const codeRaw =
      def.id === 'countries'
        ? (run.countryCode ?? '').trim()
        : (run.stateCode ?? run.stateName ?? '').trim();
    if (!codeRaw) {
      if (__DEV__) {
        console.log('[YearlyChallenges] missing region info for run', runId, def.id);
      }
      // If we lack region info, keep existing progress and continue.
      updatedYear.challenges[def.id] = {
        stage: safeStage,
        progressValue: prevProgress,
        starsEarned: prevStars,
        milestonesGranted: Array.from(milestonesGranted),
      };
      continue;
    }
    const code = codeRaw.toUpperCase();
    const eventId = `${def.id}:${code}`;
    if (updatedYear.appliedEventIds.includes(eventId)) {
      updatedYear.challenges[def.id] = {
        stage: safeStage,
        progressValue: prevProgress,
        starsEarned: prevStars,
        milestonesGranted: Array.from(milestonesGranted),
      };
      continue;
    }

    updatedYear.appliedEventIds = [eventId, ...updatedYear.appliedEventIds].slice(0, 500);
    const nextProgress = prevProgress + 1;
    const nextStars = starsForProgress(nextProgress, thresholds);

    for (const star of [1, 2, 3] as Star[]) {
      if (nextStars >= star && prevStars < star) {
        const mid = milestoneId({ monthKey: yk, challengeId: def.id, stage: safeStage, star });
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
        updatedYear.challenges[def.id] = {
          stage: newlyUnlocked,
          progressValue: 0,
          starsEarned: 0,
          milestonesGranted: [],
        };
        continue;
      }
    }

    updatedYear.challenges[def.id] = {
      stage: safeStage,
      progressValue: nextProgress,
      starsEarned: nextStars,
      milestonesGranted: Array.from(milestonesGranted),
    };
  }

  next = {
    ...next,
    years: { ...next.years, [yk]: updatedYear },
    totalChallengeXp: (next.totalChallengeXp ?? 0) + xpDelta,
    totalTerritoryReward: (next.totalTerritoryReward ?? 0) + territoryDelta,
    updatedAt: Date.now(),
  };
  return { nextState: next, awardedMilestones: awarded };
}

export type YearlyChallengeView = {
  id: MonthlyChallengeId;
  baseLabel: string;
  title: string;
  description: string;
  unit: string;
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

export function buildYearlyChallengeViews(state: YearlyChallengesState, now = new Date()): YearlyChallengeView[] {
  const yk = yearKeyFromDate(now);
  const year = state.years[yk] ?? { yearKey: yk, challenges: {}, appliedRunIds: [], appliedEventIds: [] };
  return yearlyDefs().map((def) => {
    const unlocked = state.stageUnlocked[def.id] ?? 1;
    const ch = year.challenges[def.id];
    const stage = Math.max(unlocked, ch?.stage ?? 0);
    const safeStage = Math.min(Math.max(1, stage), def.maxStage);
    const thresholds = thresholdsForStage(def, safeStage);
    const progressValue = ch?.progressValue ?? 0;
    const computedStars = starsForProgress(progressValue, thresholds);
    const starsEarned = Math.max(ch?.starsEarned ?? 0, computedStars);

    let nextStarTarget: number | undefined;
    if (starsEarned < 1) nextStarTarget = thresholds.one;
    else if (starsEarned < 2) nextStarTarget = thresholds.two;
    else if (starsEarned < 3) nextStarTarget = thresholds.three;

    const earnedXpThisStage =
      (starsEarned >= 1 ? xpForMilestone(def.id, safeStage, 1) : 0) +
      (starsEarned >= 2 ? xpForMilestone(def.id, safeStage, 2) : 0) +
      (starsEarned >= 3 ? xpForMilestone(def.id, safeStage, 3) : 0);
    const totalXp = monthlyXpConfig.stageTotalXpByChallenge[def.id]?.[safeStage] ?? 0;
    const nextMilestoneXp =
      starsEarned < 3 ? xpForMilestone(def.id, safeStage, ((starsEarned + 1) as Star)) : undefined;

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
      meta: {},
    };
  });
}

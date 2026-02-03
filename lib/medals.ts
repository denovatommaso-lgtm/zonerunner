import { monthlyChallenges, type MonthlyChallengeDefinition } from './monthlyChallengesConfig';
import { yearlyChallengeDefinitions } from './monthlyChallengesConfig';
import { romanNumeral } from './monthlyChallenges';
import type { MonthlyChallengesState } from './monthlyChallenges';
import type { YearlyChallengesState } from './yearlyChallenges';

export type MedalTier = 'bronze' | 'silver' | 'gold';
export type MedalSource = 'monthly' | 'yearly';
export type MedalTierCounts = { bronze: number; silver: number; gold: number };

export type Medal = {
  id: string; // medal:{source}:{challengeId}:{stage}
  label: string;
  tier: MedalTier;
  source: MedalSource;
  image?: string; // optional artwork URI
};

const allDefs: Record<MedalSource, MonthlyChallengeDefinition[]> = {
  monthly: monthlyChallenges,
  yearly: yearlyChallengeDefinitions,
};

// Base placeholders (guaranteed to exist).
const tierFallbackImages: Record<MedalTier, any> = {
  bronze: require('../assets/medals/bronze.png'),
  silver: require('../assets/medals/silver.png'),
  gold: require('../assets/medals/gold.png'),
};
const legacyFallback = require('../assets/medals/pace_rank3_gold.png');

// Artwork per medal (mapped to the final PNG names). These files exist as placeholders and can be
// swapped for the production art without changing code.
const medalImages: Record<string, any> = {
  // Monthly challenges
  [medalId('monthly', 'distance', 1)]: require('../assets/medals/distance_rank1_bronze.png'),
  [medalId('monthly', 'distance', 2)]: require('../assets/medals/distance_rank2_silver.png'),
  [medalId('monthly', 'distance', 3)]: require('../assets/medals/distance_rank3_gold.png'),

  [medalId('monthly', 'time', 1)]: require('../assets/medals/time_rank1_bronze.png'),
  [medalId('monthly', 'time', 2)]: require('../assets/medals/time_rank2_silver.png'),
  [medalId('monthly', 'time', 3)]: require('../assets/medals/time_rank3_gold.png'),

  [medalId('monthly', 'pace', 1)]: require('../assets/medals/pace_rank1_bronze.png'),
  [medalId('monthly', 'pace', 2)]: require('../assets/medals/pace_rank2_silver.png'),
  [medalId('monthly', 'pace', 3)]: require('../assets/medals/pace_rank3_gold.png'),

  [medalId('monthly', 'friends', 1)]: require('../assets/medals/friends_rank1_bronze.png'),
  [medalId('monthly', 'friends', 2)]: require('../assets/medals/friends_rank2_silver.png'),
  [medalId('monthly', 'friends', 3)]: require('../assets/medals/friends_rank3_gold.png'),

  [medalId('monthly', 'ranking', 1)]: require('../assets/medals/ranking_rank1_bronze.png'),
  [medalId('monthly', 'ranking', 2)]: require('../assets/medals/ranking_rank2_silver.png'),
  [medalId('monthly', 'ranking', 3)]: require('../assets/medals/ranking_rank3_gold.png'),

  [medalId('monthly', 'consistency', 1)]: require('../assets/medals/consistency_rank1_bronze.png'),
  [medalId('monthly', 'consistency', 2)]: require('../assets/medals/consistency_rank2_silver.png'),
  [medalId('monthly', 'consistency', 3)]: require('../assets/medals/consistency_rank3_gold.png'),

  [medalId('monthly', 'longest', 1)]: require('../assets/medals/longest_rank1_bronze.png'),
  [medalId('monthly', 'longest', 2)]: require('../assets/medals/longest_rank2_silver.png'),
  [medalId('monthly', 'longest', 3)]: require('../assets/medals/longest_rank3_gold.png'),

  [medalId('monthly', 'earlyBird', 1)]: require('../assets/medals/earlyBird_rank1_bronze.png'),
  [medalId('monthly', 'earlyBird', 2)]: require('../assets/medals/earlyBird_rank2_silver.png'),
  [medalId('monthly', 'earlyBird', 3)]: require('../assets/medals/earlyBird_rank3_gold.png'),

  [medalId('monthly', 'nightOwl', 1)]: require('../assets/medals/nightOwl_rank1_bronze.png'),
  [medalId('monthly', 'nightOwl', 2)]: require('../assets/medals/nightOwl_rank2_silver.png'),
  [medalId('monthly', 'nightOwl', 3)]: require('../assets/medals/nightOwl_rank3_gold.png'),

  // Yearly challenges
  [medalId('yearly', 'countries', 1)]: require('../assets/medals/countries_rank1_bronze.png'),
  [medalId('yearly', 'countries', 2)]: require('../assets/medals/countries_rank2_silver.png'),
  [medalId('yearly', 'countries', 3)]: require('../assets/medals/countries_rank3_gold.png'),

  [medalId('yearly', 'states', 1)]: require('../assets/medals/states_rank1_bronze.png'),
  [medalId('yearly', 'states', 2)]: require('../assets/medals/states_rank2_silver.png'),
  [medalId('yearly', 'states', 3)]: require('../assets/medals/states_rank3_gold.png'),
};

export function medalId(source: MedalSource, challengeId: string, stage: number) {
  return `medal:${source}:${challengeId}:${stage}`;
}

export function medalFromId(id: string): Medal | null {
  const parts = id.split(':');
  if (parts.length !== 4 || parts[0] !== 'medal') return null;
  const [, sourceRaw, challengeId, stageRaw] = parts;
  if (sourceRaw !== 'monthly' && sourceRaw !== 'yearly') return null;
  const source = sourceRaw as MedalSource;
  const defs = allDefs[source];
  const def = defs.find((d) => d.id === challengeId);
  const stage = Number(stageRaw);
  if (!def || !Number.isFinite(stage) || stage < 1) return null;
  const tier: MedalTier = stage >= 3 ? 'gold' : stage === 2 ? 'silver' : 'bronze';
  return {
    id,
    label: `${def.baseLabel} ${romanNumeral(stage)}`,
    tier,
    source,
    image: medalImages[id] ?? tierFallbackImages[tier] ?? legacyFallback,
  };
}

export function medalsFromChallenges(
  views: Array<{ id: string; baseLabel?: string; stage: number; starsEarned: number }>,
  source: MedalSource
): Medal[] {
  return views
    .filter((v) => v.starsEarned >= 3)
    .map((v) => medalId(source, v.id, v.stage))
    .map(medalFromId)
    .filter(Boolean) as Medal[];
}

function completedStages(stage: number, starsEarned: number, maxStage: number): number {
  const safeStage = Math.min(Math.max(1, stage), maxStage);
  const baseCompleted = Math.max(0, safeStage - 1);
  const hasClearedCurrent = starsEarned >= 3 ? 1 : 0;
  return Math.min(maxStage, baseCompleted + hasClearedCurrent);
}

function tierFromStage(stage: number): MedalTier {
  return stage >= 3 ? 'gold' : stage === 2 ? 'silver' : 'bronze';
}

function completedFromProgress(
  def: MonthlyChallengeDefinition,
  prog: { stage?: number; starsEarned?: number; milestonesGranted?: string[] }
): number {
  const maxStage = def.maxStage ?? def.stageTargets3Star.length;
  const stage = prog.stage ?? 1;
  const starsEarned = prog.starsEarned ?? 0;
  const milestoneStages =
    prog.milestonesGranted
      ?.map((mid) => {
        if (typeof mid !== 'string') return 0;
        if (!mid.includes(`:${def.id}:stage`)) return 0;
        const m = mid.match(/:stage(\d+):star3$/);
        return m ? Number(m[1]) : 0;
      })
      .filter((s) => Number.isFinite(s) && s > 0) ?? [];
  const viaMilestones = milestoneStages.length ? Math.max(...milestoneStages) : 0;
  // A medal is granted only when a stage reaches 3 stars (current or via milestones).
  const completedByStars = starsEarned >= 3 ? Math.min(stage, maxStage) : Math.max(0, stage - 1);
  return Math.max(Math.min(maxStage, completedByStars), Math.min(maxStage, viaMilestones));
}

function rankingCompletedFromMeta(meta: any): number {
  const scopes = meta?.scopes;
  const stateTop3 = scopes?.state?.stars?.top3;
  const countryTop3 = scopes?.country?.stars?.top3;
  const worldTop3 = scopes?.world?.stars?.top3;
  return Math.max(stateTop3 ? 1 : 0, countryTop3 ? 2 : 0, worldTop3 ? 3 : 0);
}

export function medalsFromMonthlyHistory(state: MonthlyChallengesState): Medal[] {
  const awarded = new Set<string>();
  const counted = new Set<string>();
  for (const month of Object.values(state.months ?? {})) {
    for (const [challengeId, prog] of Object.entries(month.challenges ?? {})) {
      const def = monthlyChallenges.find((d) => d.id === challengeId);
      if (!def) continue;
      let completed = completedFromProgress(def, prog);
      if (challengeId === 'ranking') {
        completed = Math.max(completed, rankingCompletedFromMeta((prog as any)?.meta));
      }
      const unlocked = state.stageUnlocked?.[def.id] ?? 0;
      const total = completed > 0 ? completed : unlocked;
      for (let s = 1; s <= total; s += 1) {
        awarded.add(medalId('monthly', def.id, s));
      }
      counted.add(def.id);
    }
  }
  // If we have unlocked stages without recorded months, still show those medals.
  for (const [challengeId, stage] of Object.entries(state.stageUnlocked ?? {})) {
    if (counted.has(challengeId)) continue;
    const def = monthlyChallenges.find((d) => d.id === challengeId);
    if (!def) continue;
    const capped = Math.max(0, Math.min(stage, def.maxStage ?? def.stageTargets3Star.length));
    for (let s = 1; s <= capped; s += 1) {
      awarded.add(medalId('monthly', def.id, s));
    }
  }
  return Array.from(awarded)
    .map(medalFromId)
    .filter(Boolean) as Medal[];
}

export function medalsFromYearlyHistory(state: YearlyChallengesState): Medal[] {
  const awarded = new Set<string>();
  const counted = new Set<string>();
  for (const year of Object.values(state.years ?? {})) {
    for (const [challengeId, prog] of Object.entries(year.challenges ?? {})) {
      const def = yearlyChallengeDefinitions.find((d) => d.id === challengeId);
      if (!def) continue;
      const completed = completedFromProgress(def, prog);
      const unlocked = state.stageUnlocked?.[def.id] ?? 0;
      const total = completed > 0 ? completed : unlocked;
      for (let s = 1; s <= total; s += 1) {
        awarded.add(medalId('yearly', def.id, s));
      }
      counted.add(def.id);
    }
  }
  for (const [challengeId, stage] of Object.entries((state as any).stageUnlocked ?? {})) {
    if (counted.has(challengeId)) continue;
    const def = yearlyChallengeDefinitions.find((d) => d.id === challengeId);
    if (!def) continue;
    const stageValue = typeof stage === 'number' ? stage : Number(stage) || 0;
    const capped = Math.max(0, Math.min(stageValue, def.maxStage ?? def.stageTargets3Star.length));
    for (let s = 1; s <= capped; s += 1) {
      awarded.add(medalId('yearly', def.id, s));
    }
  }
  return Array.from(awarded)
    .map(medalFromId)
    .filter(Boolean) as Medal[];
}

function incrementTier(counts: MedalTierCounts, tier: MedalTier, inc = 1) {
  counts[tier] = (counts[tier] ?? 0) + inc;
}

function ensureCounts(map: Record<string, MedalTierCounts>, challengeId: string) {
  if (!map[challengeId]) {
    map[challengeId] = { bronze: 0, silver: 0, gold: 0 };
  }
  return map[challengeId];
}

export function medalTierCountsFromHistory(
  monthlyState: MonthlyChallengesState,
  yearlyState: YearlyChallengesState
): Record<string, MedalTierCounts> {
  const counts: Record<string, MedalTierCounts> = {};
  const countedChallenges = new Set<string>();

  for (const month of Object.values(monthlyState.months ?? {})) {
    for (const [challengeId, prog] of Object.entries(month.challenges ?? {})) {
      const def = monthlyChallenges.find((d) => d.id === challengeId);
      if (!def) continue;
      let completed = completedFromProgress(def, prog);
      if (challengeId === 'ranking') {
        completed = Math.max(completed, rankingCompletedFromMeta((prog as any)?.meta));
      }
      const unlocked = monthlyState.stageUnlocked?.[def.id] ?? 0;
      const total = completed > 0 ? completed : unlocked;
      for (let s = 1; s <= total; s += 1) {
        const tier = tierFromStage(s);
        incrementTier(ensureCounts(counts, challengeId), tier);
      }
      countedChallenges.add(challengeId);
    }
  }

  for (const year of Object.values(yearlyState.years ?? {})) {
    for (const [challengeId, prog] of Object.entries(year.challenges ?? {})) {
      const def = yearlyChallengeDefinitions.find((d) => d.id === challengeId);
      if (!def) continue;
      const completed = completedFromProgress(def, prog);
      const unlocked = yearlyState.stageUnlocked?.[def.id] ?? 0;
      const total = completed > 0 ? completed : unlocked;
      for (let s = 1; s <= total; s += 1) {
        const tier = tierFromStage(s);
        incrementTier(ensureCounts(counts, challengeId), tier);
      }
      countedChallenges.add(challengeId);
    }
  }

  // Fallback: if we have an unlocked stage but no recorded completions, treat it as a single earned set.
  for (const [challengeId, stage] of Object.entries(monthlyState.stageUnlocked ?? {})) {
    if (countedChallenges.has(challengeId)) continue;
    const stageValue = typeof stage === 'number' ? stage : Number(stage) || 0;
    const capped = Math.max(0, Math.min(stageValue, 3));
    for (let s = 1; s <= capped; s += 1) {
      incrementTier(ensureCounts(counts, challengeId), tierFromStage(s));
    }
  }
  for (const [challengeId, stage] of Object.entries((yearlyState as any).stageUnlocked ?? {})) {
    if (countedChallenges.has(challengeId)) continue;
    const stageValue = typeof stage === 'number' ? stage : Number(stage) || 0;
    const capped = Math.max(0, Math.min(stageValue, 3));
    for (let s = 1; s <= capped; s += 1) {
      incrementTier(ensureCounts(counts, challengeId), tierFromStage(s));
    }
  }

  return counts;
}

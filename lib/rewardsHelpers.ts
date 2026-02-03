import { rewardDefinitions, type RewardCategory, type RewardTier } from './rewardsConfig';
import { getRequiredLevel } from './rewards/rewardSchedule';

export function getUnlockLevel(category: RewardCategory, tier: RewardTier): number {
  return getRequiredLevel(
    category === 'levelBorderStyle' ? 'borderStyle' : 'tier',
    tier
  );
}

export function getHighestUnlockedTier(level: number, category: RewardCategory): RewardTier {
  const defs = rewardDefinitions.filter((d) => d.category === category);
  const unlocked = defs.filter((d) => level >= getUnlockLevel(category, d.tier)).sort((a, b) => getUnlockLevel(category, a.tier) - getUnlockLevel(category, b.tier));
  return unlocked.length ? unlocked[unlocked.length - 1].tier : 'default';
}

export function isTierUnlocked(level: number, tier: RewardTier, category: RewardCategory) {
  return level >= getUnlockLevel(category, tier);
}

export function getEffectiveTier(params: {
  level: number;
  mode: 'auto' | 'manual';
  selectedTier?: RewardTier | null;
  category: RewardCategory;
}) {
  const { level, mode, selectedTier, category } = params;
  if (mode === 'manual' && selectedTier && isTierUnlocked(level, selectedTier, category)) {
    return selectedTier;
  }
  return getHighestUnlockedTier(level, category);
}

export function getNextUnlock(level: number, category: RewardCategory) {
  const defs = rewardDefinitions.filter((d) => d.category === category);
  const next = defs
    .map((d) => ({ tier: d.tier, unlockLevel: getUnlockLevel(category, d.tier) }))
    .filter((t) => t.unlockLevel > level)
    .sort((a, b) => a.unlockLevel - b.unlockLevel)[0];
  return next ?? null;
}

export const rewardsByCategory = rewardDefinitions.reduce<Record<string, typeof rewardDefinitions>>((acc, r) => {
  acc[r.category] = acc[r.category] ? [...acc[r.category], r] : [r];
  return acc;
}, {});

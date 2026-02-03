import { RewardTier } from './rewardsConfig';
import { getEffectiveTier } from './rewardsHelpers';
import type { UserProfile } from './authService';

export function resolveLevelBorderTier(level: number, profile?: UserProfile | null): RewardTier {
  const mode = profile?.levelBorderMode ?? 'auto';
  const selected = (profile?.selectedLevelBorderTier as RewardTier | undefined) ?? 'default';
  return getEffectiveTier({
    level,
    mode,
    selectedTier: selected,
    category: 'levelBorder',
  });
}

export function resolveLevelBorderStyleTier(level: number, profile?: UserProfile | null): RewardTier {
  const mode = (profile as any)?.levelBorderStyleMode ?? profile?.levelBorderMode ?? 'auto';
  const selected =
    ((profile as any)?.selectedLevelBorderStyleTier as RewardTier | undefined) ??
    (profile?.selectedLevelBorderTier as RewardTier | undefined) ??
    'default';
  return getEffectiveTier({
    level,
    mode,
    selectedTier: selected,
    category: 'levelBorderStyle',
  });
}

export function resolveTerritoryNameTier(level: number, profile?: UserProfile | null): RewardTier {
  const mode = profile?.territoryNameStyleMode ?? 'auto';
  const selected = (profile?.selectedTerritoryNameStyleTier as RewardTier | undefined) ?? 'default';
  return getEffectiveTier({
    level,
    mode,
    selectedTier: selected,
    category: 'territoryNameStyle',
  });
}

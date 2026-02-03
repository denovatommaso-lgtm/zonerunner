// Centralized rewards definitions and unlock thresholds.
export type RewardTier = 'default' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'animated';
export type RewardCategory = 'territoryNameStyle' | 'levelBorder' | 'levelBorderStyle';

export const tierUnlockLevels: Record<RewardTier, number> = {
  default: 0,
  bronze: 5,
  silver: 10,
  gold: 15,
  platinum: 25,
  animated: 50,
};

export type RewardDefinition = {
  id: `${RewardCategory}:${RewardTier}`;
  category: RewardCategory;
  tier: RewardTier;
  unlockLevel: number;
  displayName: string;
  shortDescription: string;
};

const territoryNameStyleDefinitions: RewardDefinition[] = ([
  ['default', 'Default name style'],
  ['bronze', 'Bronze glow'],
  ['silver', 'Silver glow'],
  ['gold', 'Gold glow'],
  ['platinum', 'Platinum glow'],
  ['animated', 'Animated shimmer'],
] as const).map(([tier, desc]) => ({
  id: `territoryNameStyle:${tier}` as const,
  category: 'territoryNameStyle' as const,
  tier: tier as RewardTier,
  unlockLevel: tierUnlockLevels[tier as RewardTier],
  displayName: tier.charAt(0).toUpperCase() + tier.slice(1),
  shortDescription: desc,
}));

const levelBorderDefinitions: RewardDefinition[] = ([
  ['default', 'Default border'],
  ['bronze', 'Bronze edge'],
  ['silver', 'Silver edge'],
  ['gold', 'Gold edge'],
  ['platinum', 'Platinum edge'],
  ['animated', 'Animated edge'],
] as const).map(([tier, desc]) => ({
  id: `levelBorder:${tier}` as const,
  category: 'levelBorder' as const,
  tier: tier as RewardTier,
  unlockLevel: tierUnlockLevels[tier as RewardTier],
  displayName: tier.charAt(0).toUpperCase() + tier.slice(1),
  shortDescription: desc,
}));

const levelBorderStyleDefinitions: RewardDefinition[] = [
  { id: 'levelBorderStyle:default', category: 'levelBorderStyle', tier: 'default', unlockLevel: 0, displayName: 'Solid', shortDescription: 'Solid' },
  { id: 'levelBorderStyle:bronze', category: 'levelBorderStyle', tier: 'bronze', unlockLevel: 1, displayName: 'Dashed', shortDescription: 'Dashed' },
  { id: 'levelBorderStyle:silver', category: 'levelBorderStyle', tier: 'silver', unlockLevel: 6, displayName: 'Dotted', shortDescription: 'Dotted' },
  { id: 'levelBorderStyle:gold', category: 'levelBorderStyle', tier: 'gold', unlockLevel: 11, displayName: 'Zigzag', shortDescription: 'Zigzag' },
  { id: 'levelBorderStyle:platinum', category: 'levelBorderStyle', tier: 'platinum', unlockLevel: 16, displayName: 'Pulsing', shortDescription: 'Pulsing' },
  { id: 'levelBorderStyle:animated', category: 'levelBorderStyle', tier: 'animated', unlockLevel: 49, displayName: 'Animated', shortDescription: 'Animated' },
];

export const rewardDefinitions: RewardDefinition[] = [
  ...territoryNameStyleDefinitions,
  ...levelBorderDefinitions,
  ...levelBorderStyleDefinitions,
];

export const rewardDefinitionsById = new Map(rewardDefinitions.map((d) => [d.id, d]));

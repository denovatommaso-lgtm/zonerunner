export type FriendEntry = {
  id: string;
  otherUserId: string;
  otherUsername?: string;
  displayName?: string;
  createdAt?: number;
  territoryColor?: string;
  areaKm2?: number;
  distanceKm?: number;
  avatarUrl?: string;
  bannerUrl?: string;
  isFriend?: boolean;
  selectedMedals?: string[];
  levelBorderTier?: import('../lib/rewardsConfig').RewardTier;
  levelBorderStyleTier?: import('../lib/rewardsConfig').RewardTier;
};

export type FriendDoc = FriendEntry & {
  createdAt: number;
};

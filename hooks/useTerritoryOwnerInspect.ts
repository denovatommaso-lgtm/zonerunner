import { useCallback, useMemo, useState } from 'react';
import { loadUserProfile } from '../lib/authService';
import { territoryAreaKm2, type TerritoryFeature } from '../lib/territoryEngine';
import { resolveLevelBorderStyleTier, resolveLevelBorderTier } from '../lib/rewardSelectors';
import type { FriendEntry } from '../types/friends';

export type TerritoryOwnerType = 'user' | 'group';

export type TerritoryOwnerSelection = {
  ownerId: string;
  ownerType: TerritoryOwnerType;
  territoryId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  areaKm2?: number;
  rank?: number;
  color?: string;
  level?: number;
  levelBorderTier?: import('../lib/rewardsConfig').RewardTier;
  levelBorderStyleTier?: import('../lib/rewardsConfig').RewardTier;
};

export type TerritoryOwnerRunSummary = {
  id: string;
  distance: number;
  startedAt: string;
  createdAt?: number;
  userId?: string;
};

type Params = {
  territories: Map<string, TerritoryFeature | null>;
  territoryColor: string;
  userColors: Record<string, string>;
  mode: 'personal' | 'group' | 'community';
  groupInfoById: Map<string, { name: string; color?: string }>;
  userProfileCache: Map<
    string,
    {
      displayName?: string;
      username?: string;
      avatarUrl?: string;
      territoryColor?: string;
      levelBorderMode?: 'auto' | 'manual';
      selectedLevelBorderTier?: string;
      levelBorderStyleMode?: 'auto' | 'manual';
      selectedLevelBorderStyleTier?: string;
    }
  >;
  pastRuns: TerritoryOwnerRunSummary[];
  ownerLevels?: Map<string, number>;
};

export function useTerritoryOwnerInspect({
  territories,
  territoryColor,
  userColors,
  mode,
  groupInfoById,
  userProfileCache,
  pastRuns,
  ownerLevels,
}: Params) {
  const [selectedOwner, setSelectedOwner] = useState<TerritoryOwnerSelection | null>(null);
  const [profileModalFriend, setProfileModalFriend] = useState<FriendEntry | null>(null);
  const [profileModalRuns, setProfileModalRuns] = useState<
    { id: string | number; distance: number; startedAt: string }[]
  >([]);

  const ownerAreas = useMemo(() => {
    const rows = Array.from(territories.entries())
      .map(([id, terr]) => ({ id, area: territoryAreaKm2(terr ?? null) }))
      .filter((x) => x.area > 0)
      .sort((a, b) => b.area - a.area);
    return rows;
  }, [territories]);

  const openOwnerSheet = useCallback(
    async (params: { ownerId: string; ownerType?: TerritoryOwnerType; territoryId: string }) => {
      const inferredType: TerritoryOwnerType = params.ownerType ?? (mode === 'group' ? 'group' : 'user');
      const ownerId = params.ownerId;

      if (!ownerId) {
        setSelectedOwner({
          ownerId: 'unknown',
          ownerType: inferredType,
          territoryId: params.territoryId,
          displayName: 'Unclaimed',
        });
        return;
      }

      const areaKm2 = territoryAreaKm2(territories.get(ownerId) ?? null);
      const rankIndex = ownerAreas.findIndex((x) => x.id === ownerId);
      const rank = rankIndex >= 0 ? rankIndex + 1 : undefined;

      if (inferredType === 'group') {
        const group = groupInfoById.get(ownerId);
        setSelectedOwner({
          ownerId,
          ownerType: inferredType,
          territoryId: params.territoryId,
          displayName: group?.name ?? 'Group',
          areaKm2,
          rank,
          color: userColors[ownerId] ?? territoryColor,
          level: ownerLevels?.get(ownerId) ?? 1,
        });
        return;
      }

      const cached = userProfileCache.get(ownerId);
      let displayName = cached?.displayName ?? 'Runner';
      let username = cached?.username;
      let avatarUrl = cached?.avatarUrl;
      let level = ownerLevels?.get(ownerId) ?? 1;

      // If we don't have an avatar cached yet, try to fetch the profile to populate it.
      if (!cached || !avatarUrl || level <= 1) {
        try {
          const profile = await loadUserProfile(ownerId);
          if (profile) {
            userProfileCache.set(ownerId, {
              displayName: profile.displayName,
              username: profile.username,
              avatarUrl: profile.avatarUrl,
              territoryColor: profile.territoryColor,
              levelBorderMode: profile.levelBorderMode,
              selectedLevelBorderTier: profile.selectedLevelBorderTier,
              levelBorderStyleMode: profile.levelBorderStyleMode,
              selectedLevelBorderStyleTier: profile.selectedLevelBorderStyleTier,
            });
          displayName = profile.displayName ?? displayName;
          username = profile.username;
          avatarUrl = profile.avatarUrl;
          level = (profile as any)?.level ?? ownerLevels?.get(ownerId) ?? level;
          const levelBorderTier = resolveLevelBorderTier(level ?? 1, profile as any);
          const levelBorderStyleTier = resolveLevelBorderStyleTier(level ?? 1, profile as any);
          setSelectedOwner({
            ownerId,
            ownerType: inferredType,
            territoryId: params.territoryId,
            displayName,
            username,
            avatarUrl,
            areaKm2,
            rank,
            color: userColors[ownerId] ?? territoryColor,
            level: level ?? 1,
            levelBorderTier,
            levelBorderStyleTier,
          });
          return;
        }
      } catch {
        // ignore
      }
      }

      const levelBorderTier = resolveLevelBorderTier(level ?? 1, cached as any);
      const levelBorderStyleTier = resolveLevelBorderStyleTier(level ?? 1, cached as any);

      setSelectedOwner({
        ownerId,
        ownerType: inferredType,
        territoryId: params.territoryId,
        displayName,
        username,
        avatarUrl,
        areaKm2,
        rank,
        color: userColors[ownerId] ?? territoryColor,
        level,
        levelBorderTier,
        levelBorderStyleTier,
      });
    },
    [groupInfoById, mode, ownerAreas, territories, territoryColor, userColors, userProfileCache]
  );

  const closeOwnerSheet = useCallback(() => setSelectedOwner(null), []);

  const openSelectedOwnerProfile = useCallback(() => {
    if (!selectedOwner || selectedOwner.ownerType !== 'user') return;
    const ownerId = selectedOwner.ownerId;

    const friend: FriendEntry = {
      id: `owner:${ownerId}`,
      otherUserId: ownerId,
      otherUsername: selectedOwner.username,
      displayName: selectedOwner.displayName,
      avatarUrl: selectedOwner.avatarUrl,
      territoryColor: selectedOwner.color,
      areaKm2: selectedOwner.areaKm2 ?? 0,
    };

    const recent = pastRuns
      .filter((r) => (r.userId ?? '') === ownerId)
      .sort((a, b) => (b.createdAt ?? Date.parse(b.startedAt)) - (a.createdAt ?? Date.parse(a.startedAt)))
      .slice(0, 3)
      .map((r) => ({ id: r.id, distance: r.distance, startedAt: r.startedAt }));

    setProfileModalFriend(friend);
    setProfileModalRuns(recent);
  }, [pastRuns, selectedOwner]);

  const closeProfileModal = useCallback(() => setProfileModalFriend(null), []);

  return {
    selectedOwner,
    openOwnerSheet,
    closeOwnerSheet,
    openSelectedOwnerProfile,
    profileModalFriend,
    profileModalRuns,
    closeProfileModal,
  };
}

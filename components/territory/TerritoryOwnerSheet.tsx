import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { StyledAvatar } from '../common/StyledAvatar';
import { resolveLevelBorderStyleTier, resolveLevelBorderTier } from '../../lib/rewardSelectors';

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
  levelBorderTier?: import('../../lib/rewardsConfig').RewardTier;
  levelBorderStyleTier?: import('../../lib/rewardsConfig').RewardTier;
};

type Props = {
  selectedOwner: TerritoryOwnerSelection | null;
  onClose: () => void;
  onViewProfile: () => void;
  onViewGroupLeaderboard: () => void;
};

export default function TerritoryOwnerSheet({
  selectedOwner,
  onClose,
  onViewProfile,
  onViewGroupLeaderboard,
}: Props) {
  const visible = !!selectedOwner;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Owned by</Text>
          <View style={styles.row}>
            <StyledAvatar
              uri={selectedOwner?.avatarUrl}
              name={selectedOwner?.displayName ?? 'Runner'}
              size={64}
              tier={
                selectedOwner?.levelBorderTier ??
                resolveLevelBorderTier(selectedOwner?.level ?? 1, selectedOwner as any)
              }
              styleTier={
                selectedOwner?.levelBorderStyleTier ??
                resolveLevelBorderStyleTier(selectedOwner?.level ?? 1, selectedOwner as any)
              }
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{selectedOwner?.displayName ?? 'Runner'}</Text>
              {selectedOwner?.ownerType === 'user' && selectedOwner?.username ? (
                <Text style={styles.username}>@{selectedOwner.username}</Text>
              ) : selectedOwner?.ownerType === 'group' ? (
                <Text style={styles.username}>Group</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>Area captured</Text>
              <Text style={styles.metaValue}>
                {(selectedOwner?.areaKm2 ?? 0).toFixed(2)} km²
              </Text>
            </View>
            {typeof selectedOwner?.rank === 'number' ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaLabel}>Rank</Text>
                <Text style={styles.metaValue}>#{selectedOwner.rank}</Text>
              </View>
            ) : null}
          </View>

          {selectedOwner?.displayName === 'Unclaimed' ? (
            <Text style={styles.unclaimed}>Unclaimed</Text>
          ) : selectedOwner?.ownerType === 'user' ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && { opacity: 0.85 },
              ]}
              onPress={onViewProfile}
            >
              <Text style={styles.primaryButtonText}>View Profile</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.altButton,
                pressed && { opacity: 0.85 },
              ]}
              onPress={onViewGroupLeaderboard}
            >
              <Text style={styles.altButtonText}>View Group Leaderboard</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: {
    backgroundColor: '#0b1120',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#111827',
    padding: 14,
    gap: 10,
  },
  title: {
    color: '#e5e7eb',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: '#e5e7eb',
    fontWeight: '900',
    fontSize: 18,
  },
  name: {
    color: 'white',
    fontWeight: '900',
    fontSize: 16,
  },
  username: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaPill: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  metaLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
  },
  metaValue: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 3,
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#020617',
    fontWeight: '900',
    fontSize: 14,
  },
  altButton: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  altButtonText: {
    color: '#e5e7eb',
    fontWeight: '900',
    fontSize: 14,
  },
  unclaimed: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
  },
});

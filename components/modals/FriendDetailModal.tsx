import React from 'react';
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { formatDistance, formatDate } from '../../lib/utils/format';
import { FriendEntry } from '../../types/friends';
import { MedalSlots } from '../profile/MedalPicker';
import { StyledAvatar } from '../common/StyledAvatar';
import { medalFromId } from '../../lib/medals';

type FriendRun = {
  id: string | number;
  distance: number;
  startedAt: string;
};

type Props = {
  visible: boolean;
  friend: FriendEntry | null;
  runs: FriendRun[];
  removing?: boolean;
  isFriend?: boolean;
  showActions?: boolean;
  onClose: () => void;
  onOpenRunDetail: (id: string) => void;
  onRemoveFriend?: () => void;
  onAddFriend?: () => void;
};

// Reusable friend detail modal with recent runs list.
export default function FriendDetailModal({
  visible,
  friend,
  runs,
  removing,
  isFriend = true,
  showActions = true,
  onClose,
  onOpenRunDetail,
  onRemoveFriend,
  onAddFriend,
}: Props) {
  if (!visible || !friend) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.headerRow}>
            <StyledAvatar
              name={friend.displayName ?? 'Friend'}
              uri={friend.avatarUrl ?? undefined}
              size={70}
              tier={friend.levelBorderTier as any}
              styleTier={friend.levelBorderStyleTier as any}
            />
          </View>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { textAlign: 'center', flex: 1 }]}>
              {friend.displayName ?? 'Friend'}
            </Text>
          </View>
          <View
            style={[
              styles.colorUnderline,
              { backgroundColor: friend.territoryColor ?? '#1e90ff' },
            ]}
          />

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Area captured</Text>
              <Text style={styles.statValue}>
                {(friend.areaKm2 ?? 0).toFixed(2)} km²
              </Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Total distance</Text>
              <Text style={styles.statValue}>
                {(friend.distanceKm ?? 0).toFixed(2)} km
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 8, alignItems: 'center' }}>
            <Text style={[styles.runsTitle, { textAlign: 'center' }]}>Medals</Text>
            <MedalSlots
              selected={(friend.selectedMedals ?? [])
                .map((id) => medalFromId(id))
                .filter(Boolean) as any}
            />
          </View>

          {runs.length > 0 && (
            <View style={styles.runsSection}>
              <Text style={styles.runsTitle}>Recent runs</Text>
              {runs.map((run) => (
                <TouchableOpacity
                  key={run.id}
                  style={styles.runRow}
                  onPress={() => {
                    onClose();
                    onOpenRunDetail(run.id.toString());
                  }}
                >
                  <View
                    style={[
                      styles.runBadge,
                      { backgroundColor: friend.territoryColor ?? '#38bdf8' },
                    ]}
                  />
                  <View style={styles.runTextBlock}>
                    <Text style={styles.runDistance}>{formatDistance(run.distance)}</Text>
                    <Text style={styles.runDate}>{formatDate(run.startedAt)}</Text>
                  </View>
                  <Text style={styles.runChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {showActions ? (
            isFriend ? (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={onRemoveFriend}
                disabled={removing}
              >
                <Text style={styles.removeText}>
                  {removing ? 'Removing…' : 'Remove friend'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.addButton}
                onPress={onAddFriend}
                disabled={removing}
              >
                <Text style={styles.addText}>
                  {removing ? 'Sending…' : 'Add friend'}
                </Text>
              </TouchableOpacity>
            )
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#0b1120',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#111827',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    width: '100%',
  },
  colorUnderline: {
    width: '50%',
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 14,
    gap: 10,
  },
  statBlock: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
    alignItems: 'center',
  },
  statLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
  },
  medalsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  medalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
  },
  medalIcon: {
    fontSize: 14,
    fontWeight: '900',
  },
  medalLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  medalSubtext: {
    fontSize: 11,
    color: '#9ca3af',
  },
  runsSection: {
    marginTop: 16,
    width: '100%',
  },
  runsTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#111827',
  },
  runBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
    marginRight: 10,
  },
  runTextBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  runDistance: {
    color: '#f8fafc',
    fontSize: 16.5,
    fontWeight: '700',
  },
  runDate: {
    color: '#9ca3af',
    fontSize: 13,
    marginLeft: 'auto',
  },
  runChevron: {
    color: '#6b7280',
    fontSize: 20,
  },
  removeButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  removeText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 13,
  },
  addButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  addText: {
    color: '#22c55e',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 6,
  },
});

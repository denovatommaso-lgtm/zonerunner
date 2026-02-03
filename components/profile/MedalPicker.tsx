import React, { useCallback } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Medal } from '../../lib/medals';

type MedalPickerProps = {
  selected: string[];
  medals: Medal[];
  onToggle: (id: string) => void;
  badgeCounts?: Record<string, { bronze: number; silver: number; gold: number }>;
};

const tierColor = (tier: Medal['tier']) =>
  tier === 'gold' ? '#fbbf24' : tier === 'silver' ? '#e2e8f0' : '#f59e0b';

function challengeIdFromMedalId(id: string) {
  const parts = id.split(':');
  return parts.length === 4 ? parts[2] : null;
}

export function MedalPicker({ selected, medals, onToggle, badgeCounts }: MedalPickerProps) {
  const renderItem = useCallback(
    ({ item, index }: { item: Medal; index: number }) => {
      const color = tierColor(item.tier);
      const isSelected = selected.includes(item.id);
      const marginRight = index % 3 === 2 ? 0 : 8;
      const challengeId = challengeIdFromMedalId(item.id);
      const tierCounts = (challengeId && badgeCounts?.[challengeId]) || null;
      const badgeValue =
        tierCounts && typeof tierCounts[item.tier] === 'number'
          ? tierCounts[item.tier]
          : null;
      return (
        <TouchableOpacity
          style={[styles.medalCard, { marginRight }]}
          onPress={() => onToggle(item.id)}
          activeOpacity={0.85}
        >
          <View style={styles.medalCardBody}>
            {item.image ? (
              <Image
                source={item.image as any}
                style={[styles.medalArt, isSelected && styles.medalArtSelected]}
                resizeMode="contain"
              />
            ) : (
              <Text style={[styles.medalIcon, { color }]}>{isSelected ? '★' : '☆'}</Text>
            )}
            {badgeValue != null ? (
              <View style={[styles.badge, badgeValue === 0 && styles.badgeMuted]}>
                <Text style={styles.badgeText}>{badgeValue}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.medalCardLabel} numberOfLines={1}>
            {item.label}
          </Text>
        </TouchableOpacity>
      );
    },
    [onToggle, selected, badgeCounts]
  );

  return (
    <FlatList
      data={medals}
      keyExtractor={(m) => m.id}
      numColumns={3}
      style={styles.list}
      columnWrapperStyle={styles.medalRow}
      contentContainerStyle={styles.modalContent}
      renderItem={renderItem}
      extraData={selected}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={<Text style={styles.sectionHint}>Earn 3★ on challenges to unlock medals.</Text>}
    />
  );
}

type MedalSlotsProps = {
  selected: Array<Medal | null>;
  onPress?: () => void;
  onRemove?: (id: string) => void;
  variant?: 'default' | 'plain';
};

export function MedalSlots({ selected, onPress, onRemove, variant = 'default' }: MedalSlotsProps) {
  const slots = [0, 1, 2].map((i) => selected[i]);
  const Wrapper = onPress ? TouchableOpacity : View;
  const slotStyle = variant === 'plain' ? styles.medalSlotPlain : styles.medalSlot;
  const emptyStyle = variant === 'plain' ? styles.medalSlotEmptyPlain : styles.medalSlotEmpty;
  return (
    <Wrapper onPress={onPress} activeOpacity={onPress ? 0.85 : 1}>
      <View style={styles.selectedMedalsRow}>
        {slots.map((medal, idx) => {
          if (!medal) {
            return (
              <View key={idx} style={emptyStyle}>
                <Text style={styles.medalSlotPlus}>+</Text>
              </View>
            );
          }
          const color = tierColor(medal.tier);
          const Tile = onRemove ? TouchableOpacity : View;
          return (
            <Tile
              key={medal.id}
              style={[slotStyle, styles.medalSlotFilled]}
              activeOpacity={onRemove ? 0.85 : 1}
              onPress={onRemove ? () => onRemove(medal.id) : undefined}
            >
              {medal.image ? (
                <Image
                  source={medal.image as any}
                  style={[styles.medalSlotImage, styles.medalSlotImageFilled]}
                  resizeMode="cover"
                />
              ) : (
                <Text style={[styles.medalIcon, { color }]}>{medal.tier === 'gold' ? '★' : '☆'}</Text>
              )}
            </Tile>
          );
        })}
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  modalContent: {
    paddingBottom: 20,
    gap: 10,
    paddingTop: 8,
  },
  medalRow: {
    flex: 1,
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  medalCard: {
    width: '31%',
    minWidth: '31%',
    paddingVertical: 6,
    gap: 6,
    alignItems: 'center',
  },
  medalCardBody: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  medalCardLabel: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    color: '#e5e7eb',
  },
  medalArt: {
    width: 96,
    height: 96,
  },
  medalArtSelected: {
    transform: [{ scale: 1.03 }],
  },
  medalIcon: {
    fontSize: 22,
    fontWeight: '900',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 12,
  },
  badgeMuted: {
    opacity: 0.35,
  },
  sectionHint: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  selectedMedalsRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 6,
    marginBottom: 16,
    justifyContent: 'center',
  },
  medalSlot: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalSlotPlain: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalSlotFilled: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  medalSlotEmpty: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalSlotEmptyPlain: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalSlotImage: {
    width: '100%',
    height: '100%',
    borderRadius: 55,
  },
  medalSlotImageFilled: {
    transform: [{ scale: 1.18 }],
    borderRadius: 55,
  },
  medalSlotPlus: {
    color: '#6b7280',
    fontSize: 28,
    fontWeight: '800',
  },
});

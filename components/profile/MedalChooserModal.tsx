import React from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '../common/BackButton';
import { SaveButton } from '../common/SaveButton';
import { MedalPicker, MedalSlots } from './MedalPicker';
import type { Medal } from '../../lib/medals';

function challengeIdFromMedalId(id: string) {
  const parts = id.split(':');
  return parts.length === 4 ? parts[2] : null;
}

const tierRank: Record<Medal['tier'], number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
};

type Props = {
  visible: boolean;
  tempMedals: string[];
  tempMedalObjects: Array<Medal | null>;
  unlockedMedals: Medal[];
  ownedCounts?: Record<string, { bronze: number; silver: number; gold: number }>;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
};

export function MedalChooserModal({
  visible,
  tempMedals,
  tempMedalObjects,
  unlockedMedals,
  ownedCounts,
  onClose,
  onSave,
  saving,
  canSave,
  onToggle,
  onRemove,
}: Props) {
  const insets = useSafeAreaInsets();
  const badgeCounts = React.useMemo(() => {
    if (ownedCounts) return ownedCounts;
    const counts: Record<string, { bronze: number; silver: number; gold: number }> = {};
    for (const m of unlockedMedals) {
      const cid = challengeIdFromMedalId(m.id);
      if (!cid) continue;
      if (!counts[cid]) counts[cid] = { bronze: 0, silver: 0, gold: 0 };
      counts[cid][m.tier] = (counts[cid][m.tier] ?? 0) + 1;
    }
    return counts;
  }, [ownedCounts, unlockedMedals]);

  const sortedMedals = React.useMemo(() => {
    return [...unlockedMedals].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'monthly' ? -1 : 1;
      const ca = challengeIdFromMedalId(a.id) ?? '';
      const cb = challengeIdFromMedalId(b.id) ?? '';
      if (ca !== cb) return ca.localeCompare(cb);
      return tierRank[a.tier] - tierRank[b.tier];
    });
  }, [unlockedMedals]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={['bottom']}
        style={{
          flex: 1,
          backgroundColor: '#020617',
        }}
      >
        <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 6) }]}>
          <BackButton onPress={onClose} />
          <View style={styles.modalTitleWrap}>
            <Text style={styles.modalTitle}>Choose medals</Text>
          </View>
          <SaveButton onPress={onSave} disabled={!canSave || saving} label={saving ? 'Saving…' : 'Save'} />
        </View>
        <View style={{ marginTop: 6, marginBottom: 10 }}>
          <MedalSlots selected={tempMedalObjects} onRemove={onRemove} />
        </View>
        <View style={styles.divider} />
        <View style={{ flex: 1 }}>
          <MedalPicker selected={tempMedals} medals={sortedMedals} onToggle={onToggle} badgeCounts={badgeCounts} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = {
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  modalTitleWrap: { flex: 1, alignItems: 'center' as const },
  modalTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '800' as const },
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginHorizontal: 16,
    marginBottom: 12,
  },
};

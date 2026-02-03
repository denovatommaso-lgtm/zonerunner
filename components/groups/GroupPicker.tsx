import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import Ionicons from '@/components/common/Ionicons';
import { Group } from '../../lib/groupTypes';

type Props = {
  groups: Group[];
  activeGroupId?: string;
  onSelect: (group: Group) => void;
  onCreate: () => void;
  onJoin: () => void;
};

// Displays the user's groups or an empty state with create/join actions.
export default function GroupPicker({ groups, activeGroupId, onSelect, onCreate, onJoin }: Props) {
  const [actionModalVisible, setActionModalVisible] = useState(false);

  if (!groups.length) {
    return (
      <View style={styles.groupEmptyCard}>
        <Text style={styles.groupEmptyTitle}>No groups yet</Text>
        <Text style={styles.groupEmptyText}>
          Join a group with a code or create one to start competing.
        </Text>
        <View style={styles.groupEmptyButtons}>
          <TouchableOpacity
            style={[styles.secondaryButton, styles.secondaryButtonHalf]}
            onPress={onCreate}
          >
            <Text style={styles.secondaryButtonText}>Create group</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, styles.secondaryButtonHalf]}
            onPress={onJoin}
          >
            <Text style={styles.secondaryButtonText}>Join with code</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.groupContainer}>
      <View style={styles.groupHeaderRow}>
        <Text style={styles.groupTitle}>Groups</Text>
        <TouchableOpacity
          style={styles.groupAddButton}
          onPress={() => {
            setActionModalVisible(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={22} color="#e5e7eb" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.groupList} nestedScrollEnabled>
        {groups.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[
              styles.groupChip,
              activeGroupId === g.id && {
                borderColor: g.color,
              },
            ]}
            onPress={() => onSelect(g)}
          >
            <View style={[styles.groupDot, { backgroundColor: g.color || '#22c55e' }]} />
            <Text style={styles.groupChipText}>{g.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Modal
        transparent
        visible={actionModalVisible}
        animationType="fade"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setActionModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Groups</Text>
                <Text style={styles.modalSubtitle}>Choose an action</Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: '#22c55e' }]}
                    onPress={() => {
                      setActionModalVisible(false);
                      onCreate();
                    }}
                  >
                    <Text style={[styles.modalButtonText, { color: '#020617' }]}>Create group</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#111827' }]}
                    onPress={() => {
                      setActionModalVisible(false);
                      onJoin();
                    }}
                  >
                    <Text style={[styles.modalButtonText, { color: '#e5e7eb' }]}>Join with code</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  groupContainer: {
    marginTop: 4,
    marginBottom: 12,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  groupTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 8,
  },
  groupAddButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  groupList: {
    maxHeight: 180,
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0b1120',
    gap: 10,
  },
  groupChipText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
  },
  groupDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9ca3af44',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  modalTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  modalActions: {
    gap: 10,
    marginTop: 4,
  },
  modalButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffff22',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalButtonText: {
    fontWeight: '800',
    fontSize: 15,
  },
  groupEmptyCard: {
    backgroundColor: '#0b1120',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#111827',
    marginBottom: 12,
  },
  groupEmptyTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 6,
  },
  groupEmptyText: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 12,
  },
  groupEmptyButtons: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1e90ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  secondaryButtonHalf: {
    minWidth: '48%',
    maxWidth: '100%',
  },
  secondaryButtonText: {
    color: '#e5e7eb',
    fontWeight: '600',
    fontSize: 14,
  },
});

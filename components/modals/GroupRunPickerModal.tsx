import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type GroupLite = {
  id: string;
  name: string;
  color?: string;
};

type Props = {
  visible: boolean;
  groups: GroupLite[];
  onSelect: (groupId: string) => void;
  onClose: () => void;
  title?: string;
};

/**
 * Shared group picker for starting a run. Matches the look used on the Territory Map screen.
 */
export function GroupRunPickerModal({
  visible,
  groups,
  onSelect,
  onClose,
  title = 'Choose a group',
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={styles.title}>{title}</Text>
          {groups.map((g) => (
            <Pressable
              key={g.id}
              style={({ pressed }) => [
                styles.row,
                { borderColor: g.color || '#1f2937' },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => onSelect(g.id)}
            >
              <View style={[styles.dot, { backgroundColor: g.color || '#22c55e' }]} />
              <Text style={styles.rowText}>{g.name}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '92%',
    maxWidth: 420,
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
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
    marginBottom: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  rowText: {
    flex: 1,
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  chevron: {
    color: '#9ca3af',
    fontSize: 18,
    fontWeight: '800',
  },
  close: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
  },
  closeText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default GroupRunPickerModal;

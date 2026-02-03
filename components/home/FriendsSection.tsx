import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { FriendEntry } from '../../types/friends';

type Props = {
  title?: string;
  friends: FriendEntry[];
  showAddFriend: boolean;
  friendUsername: string;
  onChangeFriendUsername: (text: string) => void;
  onAddFriendPress: () => void;
  onSubmitFriend: () => void;
  onCancelAddFriend: () => void;
  onFriendPress: (friend: FriendEntry) => void;
  loading?: boolean;
  accentColor?: string;
};

export function FriendsSection({
  title = 'Friends',
  friends,
  showAddFriend,
  friendUsername,
  onChangeFriendUsername,
  onAddFriendPress,
  onSubmitFriend,
  onCancelAddFriend,
  onFriendPress,
  loading = false,
  accentColor = '#38bdf8',
}: Props) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={onAddFriendPress}>
          <Text style={styles.addText}>+ Add friend</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={styles.muted}>Loading friends…</Text>
      ) : friends.length === 0 ? (
        <Text style={styles.muted}>No friends yet.</Text>
      ) : (
        <View style={styles.list}>
          {friends.map((friend) => (
            <TouchableOpacity
              key={friend.id || friend.otherUserId}
              style={styles.item}
              onPress={() => onFriendPress(friend)}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    borderColor: friend.territoryColor ?? accentColor,
                    backgroundColor: friend.territoryColor ?? '#1f2937',
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{friend.displayName ?? 'Friend'}</Text>
                <Text style={styles.meta}>@{friend.otherUsername ?? 'unknown'}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showAddFriend && (
        <Modal
          visible={showAddFriend}
          transparent
          animationType="fade"
          onRequestClose={onCancelAddFriend}
        >
          <TouchableWithoutFeedback onPress={onCancelAddFriend}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Add a friend</Text>
                  <Text style={styles.modalSubtitle}>
                    Send a friend request by username.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="@username"
                    placeholderTextColor="#6b7280"
                    value={friendUsername}
                    onChangeText={onChangeFriendUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={accentColor}
                    autoFocus
                  />
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.actionButtonSolid]}
                      onPress={onSubmitFriend}
                    >
                      <Text style={[styles.actionButtonText, { color: '#020617' }]}>Send</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
  },
  addText: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 13,
  },
  muted: {
    color: '#9ca3af',
    fontSize: 13,
  },
  list: {
    gap: 8,
    marginTop: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#0b1120',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
  },
  name: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  meta: {
    color: '#9ca3af',
    fontSize: 12,
  },
  chevron: {
    color: '#6b7280',
    fontSize: 18,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 14,
    color: 'white',
    fontSize: 16,
    minHeight: 48,
  },
  sendButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#22c55e',
  },
  sendText: {
    color: '#020617',
    fontWeight: '800',
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  cancelText: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 16,
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
    maxWidth: 380,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9ca3af44',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    gap: 12,
  },
  modalTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 10,
    paddingBottom: 24,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSolid: {
    backgroundColor: '#22c55e',
  },
  actionButtonText: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 15,
  },
});

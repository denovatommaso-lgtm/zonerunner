import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@/components/common/Ionicons';

import FriendDetailModal from './FriendDetailModal';
import type { GroupMember } from '../../lib/groupTypes';
import type { FriendEntry } from '../../types/friends';
import { GroupInviteModal } from './GroupInviteModal';

type FriendRun = {
  id: string;
  distance: number;
  startedAt: string;
};

type Props = {
  visible: boolean;
  insetsTop: number;
  insetsBottom: number;
  myUserId?: string;
  group: {
    id: string;
    name: string;
    color: string;
    joinCode?: string;
    members: GroupMember[];
  } | null;
  isOwner: boolean;
  canManageMembers: boolean;
  onClose: () => void;
  onDeleteGroup: () => Promise<void>;
  onLeaveGroup: () => void;
  selectedFriend: FriendEntry | null;
  friendRuns: FriendRun[];
  onCloseFriend: () => void;
  onOpenRunDetail: (id: string) => void;
  onRemoveFriend: () => void;
  removingFriend: boolean;
  onSelectMemberAction: (member: GroupMember | null) => void;
  memberAction: GroupMember | null;
  friends: FriendEntry[];
  onAddFriend?: () => void;
  onMakeAdminToggle: (memberId: string, nextRole: 'admin' | 'member') => Promise<void>;
  onOpenFriendProfile: (friend: FriendEntry) => Promise<void>;
  onSendFriendRequest: (targetUserId: string) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onInvite: (username: string) => Promise<void>;
};

// This modal renders the full group detail view and friend overlay,
// with callbacks passed in from the parent screen.
export default function GroupDetailModal({
  visible,
  insetsTop,
  insetsBottom,
  group,
  isOwner,
  canManageMembers,
  myUserId,
  onClose,
  onDeleteGroup,
  onLeaveGroup,
  selectedFriend,
  friendRuns,
  onCloseFriend,
  onOpenRunDetail,
  onRemoveFriend,
  removingFriend,
  onSelectMemberAction,
  memberAction,
  friends,
  onAddFriend,
  onMakeAdminToggle,
  onOpenFriendProfile,
  onSendFriendRequest,
  onRemoveMember,
  onInvite,
}: Props) {
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [headerKey, setHeaderKey] = useState(0);
  const insets = useSafeAreaInsets();
  const groupId = group?.id;

  // Pad enough so the header clears the status bar, but keep it compact.
  const padTop = Math.max((insetsTop || insets.top || 0) + 6, 16);
  const padBottom = Math.max((insetsBottom || insets.bottom || 0) + 8, 14);

  useEffect(() => {
    if (visible) {
      setHeaderKey((k) => k + 1);
    }
  }, [visible, groupId]);

  if (!group) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView
        key={`gd-${group.id}-${headerKey}`}
        edges={['top', 'bottom']}
        style={{
          flex: 1,
          backgroundColor: '#020617',
          paddingTop: padTop,
          paddingBottom: padBottom,
          paddingHorizontal: 16,
        }}
      >
        <ScrollView
          key={group.id || 'group-detail'}
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 4,
            paddingBottom: 16,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.groupDetailHeader} key={`hdr-${group.id}-${headerKey}`}>
            <TouchableOpacity style={styles.groupBackButton} onPress={onClose}>
              <Text style={styles.groupBackText}>Back</Text>
            </TouchableOpacity>
            <View style={styles.groupHeaderCenter}>
              <Text style={styles.groupDetailTitle}>{group.name}</Text>
              {group.joinCode ? (
                <View style={styles.groupIdInline}>
                  <Text style={styles.groupIdInlineLabel}>ID</Text>
                  <Text style={styles.groupIdInlineValue}>
                    {group.joinCode.replace(/^G-/, '')}
                  </Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.groupInviteButton}
              onPress={() => setInviteOpen(true)}
            >
              <Text style={styles.groupInviteText}>Invite</Text>
            </TouchableOpacity>
          </View>
          <View
            style={[
              styles.groupDetailUnderline,
              { backgroundColor: group.color },
            ]}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.groupDetailSubtitle}>Team roster</Text>
            <Text style={styles.groupDetailSubtitle}>
              Members: {group.members.length}
            </Text>
          </View>
          <View style={styles.groupMemberList}>
            {group.members.map((m) => (
              <TouchableOpacity
                key={m.userId}
                style={[
                  styles.groupMemberRow,
                  m.userId === myUserId ? styles.groupMemberRowSelf : null,
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  if (m.role === 'owner' || m.role === 'leader') return;
                  onSelectMemberAction(m);
                }}
              >
                <View style={styles.groupMemberTextBlock}>
                  <View style={styles.groupMemberNameRow}>
                    <Text style={styles.groupMemberName}>
                      {m.displayName || m.userId}
                    </Text>
                    {m.role === 'owner' ? (
                      <Ionicons name="star" size={14} color="#facc15" />
                    ) : null}
                  </View>
                  <Text style={[styles.groupMemberRole, { fontSize: 11 }]}>
                    {m.role === 'owner'
                      ? 'Owner'
                      : m.role === 'leader'
                      ? 'Leader'
                      : m.role === 'admin'
                      ? 'Admin'
                      : 'Member'}
                  </Text>
                </View>
                <Text style={styles.groupMemberMetric}>
                  {(m.areaKm2 ?? 0).toFixed(2)} km²
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {isOwner ? (
            <TouchableOpacity
              style={[styles.leaveGroupButton, { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)' }]}
              onPress={() => {
                Alert.alert(
                  'Delete group',
                  'This will remove the group for everyone. Are you sure?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: onDeleteGroup,
                    },
                  ]
                );
              }}
            >
              <Text style={styles.leaveGroupText}>Delete group</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.leaveGroupButton}
              onPress={onLeaveGroup}
            >
              <Text style={styles.leaveGroupText}>Leave group</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <FriendDetailModal
          visible={!!selectedFriend}
          friend={selectedFriend}
          runs={friendRuns}
          removing={removingFriend}
          isFriend={!!selectedFriend?.isFriend}
          onClose={onCloseFriend}
          onOpenRunDetail={onOpenRunDetail}
          onRemoveFriend={onRemoveFriend}
          onAddFriend={onAddFriend}
        />

        <GroupInviteModal
          visible={inviteOpen}
          onClose={() => {
            setInviteOpen(false);
          }}
          onSend={async (username) => {
            const trimmed = username.trim().toLowerCase();
            if (!trimmed) return;
            try {
              await onInvite(trimmed);
              setInviteOpen(false);
              Alert.alert('Invite sent', `Invited @${trimmed} to this group.`);
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not send invite.');
            }
          }}
        />

        {memberAction && group && (
          <Pressable
            style={styles.memberActionOverlay}
            onPress={() => onSelectMemberAction(null)}
          >
            <Pressable style={styles.memberActionCard}>
              <Text style={styles.memberActionTitle}>
                {memberAction.displayName || 'Member'}
              </Text>
              {canManageMembers && memberAction.role !== 'owner' && (
                <TouchableOpacity
                  style={styles.memberActionButton}
                  onPress={async () => {
                    const nextRole = memberAction.role === 'admin' ? 'member' : 'admin';
                    await onMakeAdminToggle(memberAction.userId, nextRole as any);
                  }}
                >
                  <Text style={styles.memberActionButtonText}>
                    {memberAction.role === 'admin' ? 'Return to member' : 'Make admin'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.memberActionButton}
                onPress={async () => {
                  const existing = friends.find((f) => f.otherUserId === memberAction.userId);
                  if (existing) {
                    await onOpenFriendProfile(existing);
                  } else {
                    const fallback = {
                      id: memberAction.userId,
                      otherUserId: memberAction.userId,
                      displayName: memberAction.displayName,
                      territoryColor: group.color,
                      otherUsername: (memberAction as any).username,
                      isFriend: false,
                    };
                    await onOpenFriendProfile(fallback);
                  }
                }}
              >
                <Text style={styles.memberActionButtonText}>View profile</Text>
              </TouchableOpacity>
              {canManageMembers && memberAction.role !== 'owner' && (
                <TouchableOpacity
                  style={[styles.memberActionButton, { backgroundColor: '#2f1111', borderColor: '#ef4444' }]}
                  onPress={async () => {
                    await onRemoveMember(memberAction.userId);
                  }}
                >
                  <Text style={[styles.memberActionButtonText, { color: '#ef4444' }]}>
                    Remove from group
                  </Text>
                </TouchableOpacity>
              )}
            </Pressable>
          </Pressable>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  groupDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  groupHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  groupBackButton: {
    position: 'absolute',
    left: 0,
    top: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
  },
  groupBackText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 13,
  },
  groupInviteButton: {
    position: 'absolute',
    right: 0,
    top: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
    backgroundColor: '#0f172a',
  },
  groupInviteText: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 14,
  },
  groupDetailTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  groupDetailUnderline: {
    height: 4,
    borderRadius: 2,
    marginBottom: 18,
    width: '60%',
    alignSelf: 'center' as const,
  },
  groupDetailSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  groupMemberList: {
    gap: 10,
    marginBottom: 18,
  },
  memberActionOverlay: {
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
  memberActionCard: {
    width: '90%',
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
    gap: 10,
  },
  memberActionTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 4,
    textAlign: 'center',
  },
  memberActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff22',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  memberActionButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  groupMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
  },
  groupMemberRowSelf: {
    borderColor: '#ffffff',
    borderWidth: 1.5,
  },
  groupMemberMetric: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 'auto',
  },
  groupMemberTextBlock: {
    flex: 1,
  },
  groupMemberName: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '800',
  },
  groupMemberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupMemberRole: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  groupIdInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  groupIdInlineLabel: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  groupIdInlineValue: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  leaveGroupButton: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.4,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  leaveGroupText: {
    color: '#ef4444',
    fontWeight: '800',
    fontSize: 15,
  },
});

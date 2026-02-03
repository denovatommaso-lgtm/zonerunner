import React from 'react';
import { Alert, Modal, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import GroupDetailModal from '../modals/GroupDetailModal';
import GroupManageModal from '../modals/GroupManageModal';
import { GroupRunPickerModal } from '../modals/GroupRunPickerModal';
import type { UseModalReturn } from '../../hooks/useModal';
import type { GroupMember, GroupRole } from '../../lib/groupTypes';
import { canStartGroupRun } from '../../lib/utils/groupRunPermissions';
import type { FriendEntry } from '../../types/friends';
import { StyledAvatar } from '../common/StyledAvatar';
import { resolveLevelBorderTier } from '../../lib/rewardSelectors';

type GroupDetailPayload = {
  id: string;
  name: string;
  color: string;
  joinCode?: string;
  members: GroupMember[];
};

export function HomeGroupModals(props: {
  insets: EdgeInsets;
  userId?: string;

  groups: {
    id: string;
    name: string;
    color: string;
    joinCode?: string;
    allowMemberCasualRuns?: boolean;
    allowMemberOfficialRuns?: boolean;
  }[];

  levelColors: string[];

  // Create group
  createGroupModal: UseModalReturn;
  groupNameInput: string;
  setGroupNameInput: (v: string) => void;
  groupColor: string;
  setGroupColor: (v: string) => void;
  joiningGroup: boolean;
  onCreateGroup: () => Promise<void>;

  // Join group
  joinGroupModal: UseModalReturn;
  joinCodeInput: string;
  setJoinCodeInput: (v: string) => void;
  joinError: string | null;
  setJoinError: (v: string | null) => void;
  onJoinGroup: () => Promise<void>;

  // Group picker (run vs open detail)
  runGroupPicker: UseModalReturn<string>;
  startGroupRunIntent: boolean;
  setStartGroupRunIntent: (v: boolean) => void;
  onPickGroup: (groupId: string) => Promise<void>;
  onPickGroupForDetail: (groupId: string) => Promise<void>;
  onSwitchActiveGroup?: (groupId: string) => void;

  // Group detail
  groupDetailModal: UseModalReturn<GroupDetailPayload>;
  isOwner: boolean;
  canManageMembers: boolean;
  memberAction: GroupMember | null;
  setMemberAction: (m: GroupMember | null) => void;
  friends: FriendEntry[];
  selectedFriend: FriendEntry | null;
  friendRuns: { id: string; distance: number; startedAt: string }[];
  removingFriend: boolean;
  onCloseFriend: () => void;
  onOpenRunDetail: (id: string) => void;
  onRemoveFriend: () => void;
  onAddFriend: () => void;
  onOpenFriendProfile: (f: FriendEntry) => Promise<void>;
  onSendFriendRequest: (targetUserId: string) => Promise<void>;
  onDeleteGroup: () => Promise<void>;
  onMakeAdminToggle: (memberId: string, nextRole: GroupRole) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onInvite: (username: string) => Promise<void>;

  // Group run participants modal
  participantsModalVisible: boolean;
  setParticipantsModalVisible: (v: boolean) => void;
  pendingGroupRunAction: 'start' | 'join' | null;
  pendingRunType: 'casual' | 'official';
  participantList: { id: string; name: string; role?: string; level?: number }[];
  participantLevels?: Record<string, number>;
  onConfirmGroupRun: () => void;
  onCloseParticipants?: () => void;

  // Run type selection modal
  runTypeModalVisible: boolean;
  setRunTypeModalVisible: (v: boolean) => void;
  setPendingRunType: (t: 'casual' | 'official') => void;
  confirmRunTypeSelection: () => Promise<void>;
  groupMembers: GroupMember[];
  pendingGroupId: string | null;
}) {
  const {
    insets,
    userId,
    groups,
    levelColors,
    createGroupModal,
    groupNameInput,
    setGroupNameInput,
    groupColor,
    setGroupColor,
    joiningGroup,
    onCreateGroup,
    joinGroupModal,
    joinCodeInput,
    setJoinCodeInput,
    joinError,
    setJoinError,
    onJoinGroup,
    runGroupPicker,
    startGroupRunIntent,
    setStartGroupRunIntent,
    onPickGroup,
    onPickGroupForDetail,
    onSwitchActiveGroup,
    groupDetailModal,
    isOwner,
    canManageMembers,
    memberAction,
    setMemberAction,
    friends,
    selectedFriend,
    friendRuns,
    removingFriend,
    onCloseFriend,
    onOpenRunDetail,
    onRemoveFriend,
    onAddFriend,
    onOpenFriendProfile,
    onSendFriendRequest,
    onDeleteGroup,
    onMakeAdminToggle,
    onRemoveMember,
    onInvite,
    participantsModalVisible,
    setParticipantsModalVisible,
    pendingGroupRunAction,
    pendingRunType,
    participantList,
    participantLevels,
    onConfirmGroupRun,
    runTypeModalVisible,
    setRunTypeModalVisible,
    setPendingRunType,
    confirmRunTypeSelection,
    groupMembers,
    pendingGroupId,
    onCloseParticipants,
  } = props;

  return (
    <>
      <GroupManageModal
        visible={createGroupModal.visible}
        mode="create"
        groupName={groupNameInput}
        onGroupNameChange={setGroupNameInput}
        territoryColor={groupColor}
        onColorChange={setGroupColor}
        colorOptions={levelColors}
        onCancel={() => {
          createGroupModal.close();
        }}
        onSubmit={async () => {
          if (!userId) {
            Alert.alert('Sign in required', 'Sign in to create a group.');
            return;
          }
          await onCreateGroup();
        }}
        loading={joiningGroup}
        insets={insets}
      />

      <GroupRunPickerModal
        visible={runGroupPicker.visible}
        groups={groups}
        onSelect={async (gid) => {
          if (startGroupRunIntent) {
            runGroupPicker.close();
            setStartGroupRunIntent(false);
            await onPickGroup(gid);
            return;
          }
          const intent = runGroupPicker.data;
          if (intent === 'switch') {
            runGroupPicker.close();
            onSwitchActiveGroup?.(gid);
            return;
          }
          try {
            await onPickGroupForDetail(gid);
          } finally {
            runGroupPicker.close();
          }
        }}
        onClose={() => {
          setStartGroupRunIntent(false);
          runGroupPicker.close();
        }}
      />

      <GroupManageModal
        visible={joinGroupModal.visible}
        mode="join"
        groupName=""
        onGroupNameChange={() => {}}
        territoryColor={groupColor}
        onColorChange={() => {}}
        colorOptions={[]}
        codeValue={joinCodeInput}
        onCodeChange={(txt) => {
          setJoinCodeInput(txt);
          setJoinError(null);
        }}
        onCancel={() => {
          joinGroupModal.close();
          setJoinCodeInput('');
          setJoinError(null);
        }}
        errorMessage={joinError}
        onSubmit={async () => {
          if (!userId) {
            Alert.alert('Sign in required', 'Sign in to join a group.');
            return;
          }
          await onJoinGroup();
        }}
        loading={joiningGroup}
        insets={insets}
      />

      <GroupDetailModal
        visible={groupDetailModal.visible}
        group={groupDetailModal.data || null}
        myUserId={userId}
        isOwner={isOwner}
        canManageMembers={canManageMembers}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        onClose={groupDetailModal.close}
        onDeleteGroup={onDeleteGroup}
        onLeaveGroup={() => {
          groupDetailModal.close();
          // TODO: call leaveGroup and refresh
        }}
        selectedFriend={selectedFriend}
        friendRuns={friendRuns}
        onCloseFriend={onCloseFriend}
        onOpenRunDetail={onOpenRunDetail}
        onRemoveFriend={onRemoveFriend}
        removingFriend={removingFriend}
        onSelectMemberAction={(m) => {
          if (!m) {
            setMemberAction(null);
            return;
          }
          if (m.userId === userId) return;
          setMemberAction(m);
        }}
        memberAction={memberAction}
        friends={friends}
        onAddFriend={onAddFriend}
        onMakeAdminToggle={onMakeAdminToggle}
        onOpenFriendProfile={onOpenFriendProfile}
        onSendFriendRequest={onSendFriendRequest}
        onRemoveMember={onRemoveMember}
        onInvite={onInvite}
      />

      <Modal
        visible={participantsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setParticipantsModalVisible(false);
          onCloseParticipants?.();
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 20,
          }}
          onPress={() => {
            setParticipantsModalVisible(false);
            onCloseParticipants?.();
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: '92%',
              maxWidth: 420,
              backgroundColor: '#0b1120',
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: '#111827',
            }}
            onPress={() => {}}
          >
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
              {pendingGroupRunAction === 'join' ? 'Join group run' : 'Start group run'}
            </Text>
            <Text
              style={{
                alignSelf: 'center',
                backgroundColor: '#111827',
                color: '#e5e7eb',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                fontWeight: '800',
                marginBottom: 10,
              }}
            >
              {`Group • ${pendingRunType === 'official' ? 'Official' : 'Casual'}`}
            </Text>
            {pendingGroupRunAction === 'start' && participantList.length < 2 ? (
              <Text style={{ color: '#f97316', textAlign: 'center', marginBottom: 10, fontWeight: '800' }}>
                Need 2+ runners to start a group run
              </Text>
            ) : (
              <Text style={{ color: '#9ca3af', textAlign: 'center', marginBottom: 10, fontWeight: '700' }}>
                Participants in this group run
              </Text>
            )}
            <View style={{ marginTop: 4, width: '100%' }}>
              {participantList.length === 0 ? (
                <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 10 }}>
                  No participants yet.
                </Text>
              ) : (
                participantList.map((p) => (
                  <View
                    key={p.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderColor: '#111827',
                    }}
                  >
                    <View style={{ marginRight: 10 }}>
                      <StyledAvatar
                        uri={undefined}
                        name={p.name ?? 'Runner'}
                        size={42}
                        tier={resolveLevelBorderTier(p.level ?? participantLevels?.[p.id] ?? 1, null)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#f8fafc', fontWeight: '800' }}>
                        {p.name ?? 'Runner'}
                      </Text>
                      {p.role ? (
                        <Text style={{ color: '#9ca3af', marginTop: 2, fontWeight: '700' }}>{p.role}</Text>
                      ) : null}
                      {p.level ?? participantLevels?.[p.id] ? (
                        <Text style={{ color: '#9ca3af', marginTop: 2, fontWeight: '700' }}>
                          Level {p.level ?? participantLevels?.[p.id]}
                        </Text>
                      ) : null}
                    </View>
                    {p.id === userId ? (
                      <Text style={{ color: '#22c55e', fontWeight: '900' }}>You</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
            <TouchableOpacity
              style={{
                marginTop: 14,
                backgroundColor:
                  pendingGroupRunAction === 'start' && participantList.length < 2 ? '#111827' : '#22c55e',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                borderWidth: 1,
                borderColor:
                  pendingGroupRunAction === 'start' && participantList.length < 2 ? '#1f2937' : '#22c55e',
              }}
              onPress={() => {
                if (pendingGroupRunAction === 'start' && participantList.length < 2) {
                  Alert.alert('Need more runners', 'At least 2 participants are required to start a group run.');
                  return;
                }
                onConfirmGroupRun();
              }}
            >
              <Text style={{ color: '#020617', fontWeight: '900', fontSize: 14 }}>
                {pendingGroupRunAction === 'join' ? 'Join run now' : 'Start run now'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={runTypeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRunTypeModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 20,
          }}
          onPress={() => setRunTypeModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: '92%',
              maxWidth: 420,
              backgroundColor: '#0b1120',
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: '#111827',
            }}
            onPress={() => {}}
          >
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>
              Choose run type
            </Text>
            <Text style={{ color: '#9ca3af', textAlign: 'center', marginBottom: 10, fontWeight: '700' }}>
              Group runs can be casual or official
            </Text>
            {(['casual', 'official'] as const).map((t) => {
              const me = groupMembers.find((m) => m.userId === userId);
              const groupSettings = groups.find((g) => g.id === pendingGroupId);
              const allowed = canStartGroupRun(me?.role as any, t, groupSettings);
              const isSelected = pendingRunType === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => {
                    if (!allowed) {
                      Alert.alert('Not allowed', 'You cannot start that type of group run.');
                      return;
                    }
                    setPendingRunType(t);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: isSelected ? '#22c55e' : '#111827',
                    backgroundColor: isSelected ? 'rgba(34,197,94,0.08)' : '#0f172a',
                    borderRadius: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    marginTop: 10,
                    opacity: allowed ? 1 : 0.55,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#f8fafc', fontWeight: '900' }}>
                      {t === 'official' ? 'Official run' : 'Casual run'}
                    </Text>
                    <Text style={{ color: '#9ca3af', fontWeight: '700', marginTop: 4 }}>
                      {t === 'official'
                        ? 'Admins/leaders only; affects territory & leaderboards'
                        : 'Anyone in the group; does not affect territory'}
                    </Text>
                  </View>
                  {isSelected ? <Text style={{ color: '#22c55e', fontWeight: '900' }}>Selected</Text> : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={{
                marginTop: 18,
                backgroundColor: '#22c55e',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
              onPress={async () => {
                if (!pendingGroupId || !userId) {
                  setRunTypeModalVisible(false);
                  return;
                }
                await confirmRunTypeSelection();
              }}
            >
              <Text style={{ color: '#020617', fontWeight: '900', fontSize: 14 }}>Continue</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

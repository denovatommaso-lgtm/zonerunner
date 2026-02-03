import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useModal } from './useModal';
import {
  createGroup,
  deleteGroup,
  joinGroupWithCode,
  removeMember,
  sendGroupInvite,
  setMemberRole,
} from '../lib/groupService';
import type { GroupMember } from '../lib/groupTypes';
import { loadUserProfileByUsername } from '../lib/authService';
import {
  applyRoleChange,
  loadAndRankGroupMembers,
  removeMemberLocal,
} from '../lib/utils/group';

export function useHomeGroupManagement(params: {
  userId?: string;
  groups: Array<{ id: string; name: string; color: string; joinCode?: string }>;
  activeGroupId?: string;
  setActiveGroupId: (id: string | undefined) => void;
  refreshGroups: () => Promise<void>;
  handleGroupRunPress: (groupId?: string) => Promise<void>;
}) {
  const { userId, groups, activeGroupId, setActiveGroupId, refreshGroups, handleGroupRunPress } = params;

  const [groupNameInput, setGroupNameInput] = useState('My Group');
  const [groupColor, setGroupColor] = useState('#22c55e');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joiningGroup, setJoiningGroup] = useState(false);

  const createGroupModal = useModal();
  const joinGroupModal = useModal();
  const runGroupPicker = useModal<string>();
  const groupDetailModal = useModal<{
    id: string;
    name: string;
    color: string;
    joinCode?: string;
    members: GroupMember[];
  }>();

  const [memberAction, setMemberAction] = useState<GroupMember | null>(null);

  const paramsQuery = useLocalSearchParams<{ startGroupRun?: string; groupId?: string }>();
  const [consumedStartParam, setConsumedStartParam] = useState(false);
  const [startGroupRunIntent, setStartGroupRunIntent] = useState(false);

  const handleCreateGroup = useCallback(async () => {
    if (!userId) {
      Alert.alert('Sign in required', 'Sign in to create a group.');
      return;
    }
    setJoiningGroup(true);
    try {
      const g = await createGroup(userId, groupNameInput.trim() || 'My Group', groupColor);
      await refreshGroups();
      setActiveGroupId(g.id);
      Alert.alert('Group created', `Invite others with ID:\n${g.id}`);
      createGroupModal.close();
    } catch (e) {
      console.log('Failed to create group', e);
      Alert.alert('Error', 'Could not create group.');
    } finally {
      setJoiningGroup(false);
    }
  }, [createGroupModal, groupColor, groupNameInput, refreshGroups, setActiveGroupId, userId]);

  const handleJoinGroup = useCallback(async () => {
    if (!userId) {
      Alert.alert('Sign in required', 'Sign in to join a group.');
      return;
    }
    setJoiningGroup(true);
    try {
      const g = await joinGroupWithCode(userId, joinCodeInput.trim());
      await refreshGroups();
      setActiveGroupId(g.id);
      joinGroupModal.close();
      setJoinCodeInput('');
      setJoinError(null);
      Alert.alert('Joined', `You joined ${g.name}.`);
    } catch (e: any) {
      const msg = e?.message ?? 'Could not join group.';
      setJoinError(msg);
    } finally {
      setJoiningGroup(false);
    }
  }, [joinCodeInput, joinGroupModal, refreshGroups, setActiveGroupId, userId]);

  const handleDeleteGroup = useCallback(async () => {
    try {
      if (!groupDetailModal.data) return;
      await deleteGroup(groupDetailModal.data.id);
      groupDetailModal.close();
      await refreshGroups();
      setActiveGroupId(undefined);
      Alert.alert('Group deleted');
    } catch (e) {
      console.log('Failed to delete group', e);
      Alert.alert('Error', 'Could not delete group.');
    }
  }, [groupDetailModal, refreshGroups, setActiveGroupId]);

  const handlePickGroupForRunIntent = useCallback(
    async (gid: string) => {
      setActiveGroupId(gid);
      await handleGroupRunPress(gid);
    },
    [handleGroupRunPress, setActiveGroupId]
  );

  const handlePickGroupForDetail = useCallback(
    async (gid: string) => {
      const g = groups.find((gg) => gg.id === gid);
      const sorted = await loadAndRankGroupMembers(gid);
      groupDetailModal.open({
        id: gid,
        name: g?.name ?? 'Group',
        color: g?.color ?? '#22c55e',
        joinCode: g?.joinCode,
        members: sorted,
      });
    },
    [groupDetailModal, groups]
  );

  const handleShowGroupDetail = useCallback(
    async (gid: string) => {
      const g = groups.find((gg) => gg.id === gid);
      const sorted = await loadAndRankGroupMembers(gid);
      groupDetailModal.open({
        id: gid,
        name: g?.name ?? 'Group',
        color: g?.color ?? '#22c55e',
        joinCode: g?.joinCode,
        members: sorted,
      });
    },
    [groupDetailModal, groups]
  );

  const handleSwitchActiveGroup = useCallback(
    (gid: string) => {
      setActiveGroupId(gid);
    },
    [setActiveGroupId]
  );

  const handleMakeAdminToggle = useCallback(
    async (memberId: string, nextRole: 'owner' | 'leader' | 'admin' | 'member') => {
      try {
        if (!groupDetailModal.data) return;
        await setMemberRole(groupDetailModal.data.id, memberId, nextRole);
        groupDetailModal.setData({
          ...groupDetailModal.data,
          members: applyRoleChange(groupDetailModal.data.members, memberId, nextRole),
        });
        setMemberAction(null);
        Alert.alert('Role updated', nextRole === 'admin' ? 'Made admin.' : 'Set to member.');
      } catch (e) {
        console.log('Failed to update role', e);
        Alert.alert('Error', 'Could not update role.');
      }
    },
    [groupDetailModal]
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      try {
        if (!groupDetailModal.data) return;
        await removeMember(groupDetailModal.data.id, memberId);
        groupDetailModal.setData({
          ...groupDetailModal.data,
          members: removeMemberLocal(groupDetailModal.data.members, memberId),
        });
        setMemberAction(null);
        Alert.alert('Removed', 'Member removed.');
      } catch (e) {
        console.log('Failed to remove member', e);
        Alert.alert('Error', 'Could not remove member.');
      }
    },
    [groupDetailModal]
  );

  const handleInvite = useCallback(
    async (username: string) => {
      try {
        if (!userId) {
          throw new Error('Sign in required');
        }
        const profileDoc = await loadUserProfileByUsername(username);
        if (!profileDoc?.uid) {
          throw new Error('User not found');
        }
        if (!groupDetailModal.data?.id) {
          throw new Error('No group selected.');
        }
        await sendGroupInvite(userId, profileDoc.uid, groupDetailModal.data.id);
        Alert.alert('Invite sent', `Invited @${username} to the group.`);
      } catch (e: any) {
        Alert.alert('Error', e?.message ?? 'Could not send invite.');
      }
    },
    [groupDetailModal.data?.id, userId]
  );

  // Handle deep-link intent for starting a group run from other screens.
  useEffect(() => {
    if (consumedStartParam) return;
    if (paramsQuery.startGroupRun === '1') {
      setConsumedStartParam(true);
      if (paramsQuery.groupId) {
        setActiveGroupId(paramsQuery.groupId);
        setTimeout(() => handleGroupRunPress(paramsQuery.groupId), 150);
        return;
      }
      if (groups.length === 1) {
        setTimeout(() => handleGroupRunPress(groups[0].id), 150);
        return;
      }
      if (groups.length > 1) {
        setStartGroupRunIntent(true);
        runGroupPicker.open();
      }
    }
  }, [
    paramsQuery.startGroupRun,
    paramsQuery.groupId,
    consumedStartParam,
    groups,
    runGroupPicker,
    handleGroupRunPress,
    setActiveGroupId,
  ]);

  return {
    // modals + state
    createGroupModal,
    joinGroupModal,
    runGroupPicker,
    groupDetailModal,
    memberAction,
    setMemberAction,

    groupNameInput,
    setGroupNameInput,
    groupColor,
    setGroupColor,
    joinCodeInput,
    setJoinCodeInput,
    joinError,
    setJoinError,
    joiningGroup,

    // intent
    startGroupRunIntent,
    setStartGroupRunIntent,

    // handlers
    handleCreateGroup,
    handleJoinGroup,
    handleDeleteGroup,
    handlePickGroupForRunIntent,
    handlePickGroupForDetail,
    handleShowGroupDetail,
    handleSwitchActiveGroup,
    handleMakeAdminToggle,
    handleRemoveMember,
    handleInvite,
  };
}

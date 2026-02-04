import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  getActiveGroupRun,
  joinActiveGroupRun,
  listMembersForGroup,
  startActiveGroupRun,
  subscribeActiveGroupRun,
  type ActiveGroupRun,
} from '../lib/groupService';
import type { GroupMember } from '../lib/groupTypes';
import { canStartGroupRun } from '../lib/utils/groupRunPermissions';
import { showLocalNotification } from '../lib/notifications/service';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../lib/notifications/types';

export function useHomeGroupRuns(params: {
  mode: 'personal' | 'group';
  activeGroupId?: string;
  setActiveGroupId: (id: string) => void;
  groups: Array<{
    id: string;
    name?: string;
    joinCode?: string;
    allowMemberCasualRuns?: boolean;
    allowMemberOfficialRuns?: boolean;
  }>;
  userId?: string;
  startRun: (options: { groupRunType: 'casual' | 'official' }) => void;
  notificationPrefs?: NotificationPrefs;
}) {
  const { mode, activeGroupId, setActiveGroupId, groups, userId, startRun, notificationPrefs } = params;

  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [activeGroupRun, setActiveGroupRun] = useState<ActiveGroupRun | null>(null);
  const [participantsModalVisible, setParticipantsModalVisible] = useState(false);
  const [pendingGroupRunAction, setPendingGroupRunAction] = useState<'start' | 'join' | null>(null);
  const [participantList, setParticipantList] = useState<{ id: string; name: string; role?: string }[]>([]);
  const [participantLevels, setParticipantLevels] = useState<Record<string, number>>({});
  const [runTypeModalVisible, setRunTypeModalVisible] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [pendingRunType, setPendingRunType] = useState<'casual' | 'official'>('casual');
  const lastNotifiedRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'group') return;
    if (!activeGroupRun || !userId) return;
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(notificationPrefs ?? {}) };
    if (!prefs.localEnabled || !prefs.groupRunStarting) return;
    if (activeGroupRun.startedBy === userId) return;

    if (lastNotifiedRunIdRef.current === activeGroupRun.id) return;
    lastNotifiedRunIdRef.current = activeGroupRun.id;

    const groupName = groups.find((g) => g.id === activeGroupRun.groupId)?.name ?? 'Your group';
    showLocalNotification({
      title: 'Group run starting',
      body: `${groupName} just started a group run.`,
      tag: `group-run:${activeGroupRun.groupId}`,
      data: { groupId: activeGroupRun.groupId, runId: activeGroupRun.id },
    });
  }, [
    activeGroupRun,
    groups,
    mode,
    notificationPrefs,
    userId,
  ]);

  useEffect(() => {
    const loadMembers = async () => {
      if (mode !== 'group' || !activeGroupId) {
        setGroupMembers([]);
        return;
      }
      try {
        const mems = await listMembersForGroup(activeGroupId);
        setGroupMembers(mems);
      } catch (e) {
        console.log('Failed to load group members', e);
        setGroupMembers([]);
      }
    };
    loadMembers();
  }, [mode, activeGroupId, userId]);

  useEffect(() => {
    if (mode !== 'group' || !activeGroupId) {
      setActiveGroupRun(null);
      return;
    }
    const unsub = subscribeActiveGroupRun(activeGroupId, setActiveGroupRun);
    return () => {
      if (unsub) unsub();
    };
  }, [mode, activeGroupId]);

  useEffect(() => {
    if (!participantsModalVisible || !activeGroupRun) return;
    const mapped = (activeGroupRun.participants ?? []).map((pid) => {
      const m = groupMembers.find((gm) => gm.userId === pid);
      const name = m?.displayName || (m?.username ? `@${m.username}` : 'Runner');
      return { id: pid, name, role: m?.role };
    });
    const lvlMap: Record<string, number> = {};
    groupMembers.forEach((m) => {
      if (m.userId) {
        const lvl = (m as any)?.level ?? (m as any)?.stats?.level;
        if (typeof lvl === 'number') lvlMap[m.userId] = lvl;
      }
    });
    setParticipantList(mapped);
    setParticipantLevels(lvlMap);
  }, [participantsModalVisible, activeGroupRun, groupMembers]);

  const openParticipantsModal = useCallback(
    (action: 'start' | 'join', participantIds: string[], runType: 'casual' | 'official') => {
      const mapped = participantIds.map((pid) => {
        const m = groupMembers.find((gm) => gm.userId === pid);
        const name = m?.displayName || (m?.username ? `@${m.username}` : 'Runner');
        return { id: pid, name, role: m?.role };
      });
      setParticipantList(mapped);
      setPendingGroupRunAction(action);
      setPendingRunType(runType);
      setParticipantsModalVisible(true);
    },
    [groupMembers]
  );

  const handleConfirmGroupRun = useCallback(async () => {
    const action = pendingGroupRunAction;
    if (!pendingGroupId || !userId || !action) return;

    // Guard before closing the modal so the user sees feedback
    if (action === 'start' && groupMembers.length < 2) {
      Alert.alert('Need more runners', 'At least 2 participants are required to start a group run.');
      return;
    }

    setParticipantsModalVisible(false);
    setPendingGroupRunAction(null);

    try {
      if (action === 'start') {
        const existing = await getActiveGroupRun(pendingGroupId);
        if (existing) {
          setActiveGroupRun(existing);
        } else {
          const started = await startActiveGroupRun(pendingGroupId, userId, pendingRunType);
          setActiveGroupRun(started);
        }
        startRun({ groupRunType: pendingRunType });
        return;
      }
      if (action === 'join') {
        const joined = await joinActiveGroupRun(pendingGroupId, userId);
        if (!joined) {
          Alert.alert('Group run unavailable', 'That group run is not active right now.');
          return;
        }
        setActiveGroupRun(joined);
        startRun({ groupRunType: joined.groupRunType || pendingRunType });
        return;
      }
      Alert.alert('Group run', 'Select a group run to join or start.');
    } catch (e) {
      console.log('Failed to confirm group run', e);
      Alert.alert('Error', 'Could not start/join the group run.');
    }
  }, [pendingGroupRunAction, pendingGroupId, userId, groupMembers.length, pendingRunType, startRun]);

  const closeParticipantsModal = useCallback(() => {
    setParticipantsModalVisible(false);
    setPendingGroupRunAction(null);
  }, []);

  const confirmRunTypeSelection = useCallback(async () => {
    if (!pendingGroupId || !userId) {
      setRunTypeModalVisible(false);
      return;
    }
    const me = groupMembers.find((m) => m.userId === userId);
    const groupSettings = groups.find((g) => g.id === pendingGroupId);
    if (!canStartGroupRun(me?.role as any, pendingRunType, groupSettings)) {
      Alert.alert('Not allowed', 'You cannot start that type of group run.');
      return;
    }
    try {
      setRunTypeModalVisible(false);
      openParticipantsModal('start', groupMembers.map((m) => m.userId), pendingRunType);
    } catch (e) {
      console.log('Failed to start group run with type', e);
      Alert.alert('Error', 'Could not start group run.');
    }
  }, [pendingGroupId, userId, pendingRunType, groupMembers, groups, openParticipantsModal]);

  const handleGroupRunPress = useCallback(
    async (targetGroupId?: string) => {
      if (!userId) {
        Alert.alert('Sign in required', 'Sign in to start or join a group run.');
        return;
      }
      const gid = targetGroupId ?? activeGroupId;
      if (targetGroupId && targetGroupId !== activeGroupId) {
        setActiveGroupId(targetGroupId);
      }
      if (!gid) {
        Alert.alert('Select a group', 'Choose which group this run is for.');
        return;
      }

      let members = groupMembers;
      if (!members.length || gid !== activeGroupId) {
        try {
          members = await listMembersForGroup(gid);
          setGroupMembers(members);
        } catch (e) {
          console.log('Failed to load members for group run', e);
          Alert.alert('Error', 'Could not load members.');
          return;
        }
      }

      const me = members.find((m) => m.userId === userId);
      if (!me) {
        Alert.alert('Join group', 'Join the group before starting a run.');
        return;
      }

      try {
        const existing = await getActiveGroupRun(gid);
        if (existing) {
          const joined = await joinActiveGroupRun(gid, userId);
          const session = joined ?? existing;
          setActiveGroupRun(session);
          setPendingRunType(session.groupRunType || 'official');
          setPendingGroupId(gid);
          openParticipantsModal('join', session.participants ?? [userId], session.groupRunType || 'official');
          return;
        }

        const groupSettings = groups.find((g) => g.id === gid);
        const defaultType = canStartGroupRun(me.role as any, 'official', groupSettings) ? 'official' : 'casual';
        setPendingRunType(defaultType);
        setPendingGroupId(gid);
        setRunTypeModalVisible(true);
      } catch (e) {
        console.log('Failed to start/join group run', e);
        Alert.alert('Error', 'Could not start group run.');
      }
    },
    [activeGroupId, groupMembers, groups, openParticipantsModal, pendingRunType, setActiveGroupId, userId]
  );

  return {
    groupMembers,
    setGroupMembers,
    activeGroupRun,
    participantsModalVisible,
    setParticipantsModalVisible,
    pendingGroupRunAction,
    participantList,
    participantLevels,
    runTypeModalVisible,
    setRunTypeModalVisible,
    pendingGroupId,
    pendingRunType,
    setPendingRunType,
    confirmRunTypeSelection,
    handleGroupRunPress,
    handleConfirmGroupRun,
    closeParticipantsModal,
  };
}

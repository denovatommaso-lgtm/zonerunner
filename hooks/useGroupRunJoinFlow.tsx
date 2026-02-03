import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Text, TouchableOpacity, View, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoogleAuth } from '../lib/auth';
import { listGroupsForUser, listMembersForGroup, subscribeActiveGroupRun, startActiveGroupRun, joinActiveGroupRun, type ActiveGroupRun } from '../lib/groupService';
import { canStartGroupRun } from '../lib/utils/groupRunPermissions';
import GroupRunPickerModal from '../components/modals/GroupRunPickerModal';
import { loadUserProfile } from '../lib/authService';

type Group = { id: string; name: string; color: string; allowMemberCasualRuns?: boolean; allowMemberOfficialRuns?: boolean };

export function useGroupRunJoinFlow() {
  const { user } = useGoogleAuth();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingGroup, setPendingGroup] = useState<Group | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveGroupRun | null>(null);
  const [lobbyVisible, setLobbyVisible] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, string>>({});
  const [participantLevels, setParticipantLevels] = useState<Record<string, number>>({});
  const [needMoreVisible, setNeedMoreVisible] = useState(false);
  const activeRunUnsubRef = useRef<(() => void) | null>(null);

  const loadGroups = useCallback(async () => {
    if (!user?.uid) {
      setGroups([]);
      return;
    }
    setLoadingGroups(true);
    try {
      const list = await listGroupsForUser(user.uid);
      setGroups(list as any);
    } catch (e) {
      console.log('Failed to load groups for join flow', e);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const startJoinGroupRunFlow = useCallback(
    async (_entryPoint: 'home' | 'territoryMap') => {
      if (!user?.uid) {
        Alert.alert('Sign in required', 'Sign in to join a group run.');
        return;
      }
      if (loadingGroups) return;
      if (!groups.length) {
        Alert.alert('No groups', 'Join or create a group first.');
        return;
      }
      if (groups.length === 1) {
        setPendingGroup(groups[0]);
        return handleGroupChosen(groups[0]);
      }
      setPickerVisible(true);
    },
    [user?.uid, groups, loadingGroups]
  );

  const handleGroupChosen = useCallback(
    async (group: Group) => {
      setPendingGroup(group);
      // Clean up previous subscription before subscribing again
      if (activeRunUnsubRef.current) {
        activeRunUnsubRef.current();
        activeRunUnsubRef.current = null;
      }
      const unsub = subscribeActiveGroupRun(group.id, (run) => {
        setActiveRun(run);
        setParticipants(run?.participants ?? []);
      });
      activeRunUnsubRef.current = unsub;
      setLobbyVisible(true);
      return () => unsub && unsub();
    },
    []
  );

  // Hydrate participant display names.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!participants.length) {
        setParticipantProfiles({});
        return;
      }
      const next: Record<string, string> = {};
      const lvl: Record<string, number> = {};
      for (const uid of participants) {
        try {
          const profile = await loadUserProfile(uid);
          const name =
            profile?.displayName ||
            profile?.username ||
            profile?.email ||
            uid.slice(0, 6);
          next[uid] = name;
          const level = (profile as any)?.level;
          if (typeof level === 'number') lvl[uid] = level;
        } catch {
          next[uid] = uid.slice(0, 6);
        }
      }
      if (!cancelled) {
        setParticipantProfiles(next);
        setParticipantLevels(lvl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [participants]);

  const ensureRun = useCallback(async () => {
    if (!pendingGroup || !user?.uid) return;
    if (activeRun) return activeRun;
    const members = await listMembersForGroup(pendingGroup.id);
    const me = members.find((m) => m.userId === user.uid);
    if (!me) {
      Alert.alert('Join group', 'Join the group first.');
      return null;
    }
    const runType = canStartGroupRun(me.role as any, 'official', pendingGroup) ? 'official' : 'casual';
    return startActiveGroupRun(pendingGroup.id, user.uid, runType);
  }, [pendingGroup, user?.uid, activeRun]);

  const joinRun = useCallback(async () => {
    if (!pendingGroup || !user?.uid) return;
    if (activeRun) {
      const joined = await joinActiveGroupRun(pendingGroup.id, user.uid);
      const session = joined ?? activeRun;
      setActiveRun(session);
      const count = (session.participants ?? []).length;
      if (count < 2) {
        Alert.alert('Need more runners', 'Group runs need at least 2 participants to begin.');
        setNeedMoreVisible(true);
        return;
      }
      router.push({
        pathname: '/run-window',
        params: { mode: 'group', groupId: pendingGroup.id, runType: session.groupRunType },
      });
      return;
    }
    const session = await ensureRun();
    if (!session) return;
    setActiveRun(session);
    const joined = await joinActiveGroupRun(pendingGroup.id, user.uid);
    const run = joined ?? session;
    setActiveRun(run);
    const count = (run.participants ?? []).length;
    if (count < 2) {
      Alert.alert('Need more runners', 'Group runs need at least 2 participants to begin.');
      setNeedMoreVisible(true);
      return;
    }
    router.push({
      pathname: '/run-window',
      params: { mode: 'group', groupId: pendingGroup.id, runType: run.groupRunType },
    });
  }, [pendingGroup, user?.uid, activeRun, ensureRun, router]);

  const selectionModal = useMemo(
    () => (
      <GroupRunPickerModal
        visible={pickerVisible}
        groups={groups}
        onSelect={(gid) => {
          const chosen = groups.find((g) => g.id === gid);
          setPickerVisible(false);
          if (chosen) handleGroupChosen(chosen);
        }}
        onClose={() => setPickerVisible(false)}
      />
    ),
    [pickerVisible, groups, handleGroupChosen]
  );

  const lobbyModal = useMemo(
    () => (
      <Modal visible={lobbyVisible} transparent animationType="slide" onRequestClose={() => setLobbyVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          onPress={() => {
            setLobbyVisible(false);
            setNeedMoreVisible(false);
            setActiveRun(null);
            setParticipants([]);
            setPendingGroup(null);
            if (activeRunUnsubRef.current) {
              activeRunUnsubRef.current();
              activeRunUnsubRef.current = null;
            }
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ backgroundColor: '#0b1120', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' }}
            onPress={() => {}}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 18 }}>
              {pendingGroup?.name ?? 'Group'}
            </Text>
            <Text style={{ color: '#9ca3af', marginBottom: 12 }}>Run lobby</Text>
            <Text style={{ color: '#9ca3af', marginBottom: 8 }}>
              Participants ({participants.length})
            </Text>
            <FlatList
              data={participants}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <View style={{ paddingVertical: 8 }}>
                  <Text style={{ color: 'white', fontWeight: '800' }}>
                    {participantProfiles[item] ?? item}
                  </Text>
                  {participantLevels[item] ? (
                    <Text style={{ color: '#9ca3af', fontWeight: '700', marginTop: 2 }}>
                      Level {participantLevels[item]}
                    </Text>
                  ) : null}
                </View>
              )}
              style={{ maxHeight: 220 }}
            />
            <TouchableOpacity
              onPress={joinRun}
              style={{
                marginTop: 16,
                backgroundColor: '#22c55e',
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#020617', fontWeight: '800' }}>
                {activeRun ? 'Join run' : 'Start run'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    ),
    [lobbyVisible, pendingGroup?.name, participants, participantProfiles, joinRun, activeRun]
  );

  const needMoreModal = useMemo(
    () => (
      <Modal
        visible={needMoreVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNeedMoreVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 18 }}
          onPress={() => setNeedMoreVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: '90%',
              maxWidth: 420,
              backgroundColor: '#0b1120',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#111827',
              paddingVertical: 18,
              paddingHorizontal: 16,
              alignItems: 'center',
            }}
            onPress={() => {}}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 18, marginBottom: 6 }}>Need more runners</Text>
            <Text style={{ color: '#9ca3af', textAlign: 'center', lineHeight: 20, marginBottom: 14 }}>
              Group runs require at least two participants. Invite another runner to start.
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#22c55e',
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 12,
              }}
              onPress={() => setNeedMoreVisible(false)}
            >
              <Text style={{ color: '#020617', fontWeight: '800' }}>Got it</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    ),
    [needMoreVisible]
  );

  // Close "need more" warning automatically if a second participant appears.
  useEffect(() => {
    if (needMoreVisible && (participants?.length ?? 0) >= 2) {
      setNeedMoreVisible(false);
    }
  }, [needMoreVisible, participants]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeRunUnsubRef.current) {
        activeRunUnsubRef.current();
        activeRunUnsubRef.current = null;
      }
    };
  }, []);

  return {
    startJoinGroupRunFlow,
    selectionModal,
    lobbyModal,
    needMoreModal,
    groups,
    loadingGroups,
  };
}

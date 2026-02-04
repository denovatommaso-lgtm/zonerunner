import { useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import GroupPicker from '../../components/groups/GroupPicker';
import { HomePersonal } from '../../components/home/HomePersonal';
import { HomeGroup } from '../../components/home/HomeGroup';
import { HomeGroupModals } from '../../components/home/HomeGroupModals';
import { FriendsBlock } from '../../components/home/FriendsBlock';
import FriendDetailModal from '../../components/modals/FriendDetailModal';
import { useFriendProfiles } from '../../hooks/useFriendProfiles';
import { useHomeGroupManagement } from '../../hooks/useHomeGroupManagement';
import { useHomeGroupRuns } from '../../hooks/useHomeGroupRuns';
import { useHomeFriends } from '../../hooks/useHomeFriends';
import { useHomeLeaderboard } from '../../hooks/useHomeLeaderboard';
import { useGroupRunJoinFlow } from '../../hooks/useGroupRunJoinFlow';
import { useRunsContext } from '../../hooks/useRunsContext';
import { useLevelColors } from '../../hooks/useLevelColors';
import { useGoogleAuth } from '../../lib/auth';
import { sendFriendRequest } from '../../lib/friendService';
import {
  loadLastTerritoryAreaKm2,
  loadLastTerritoryNotifyAtMs,
  saveLastTerritoryAreaKm2,
  saveLastTerritoryNotifyAtMs,
  showLocalNotification,
} from '../../lib/notifications/service';
import { DEFAULT_NOTIFICATION_PREFS } from '../../lib/notifications/types';
import {
  getGroupStats,
  getUserGroupStats,
} from '../../lib/groupService';
import { useMode } from '../../lib/modeContext';
import { preloadTerritoryData } from '../../lib/territoryPrefetch';
import { canManage as canManageFn, isOwner as isOwnerFn } from '../../lib/utils/group';
import { buildHomeStats } from '../../lib/utils/homeAggregates';
import { computeRanks } from '../../lib/utils/rank';
import { checkAndRecordMainRanking } from '../../lib/rankingTracker';
import { FriendEntry } from '../../types/friends';
import { HomeHeader } from '../../components/home/HomeHeader';
import { ModeToggle } from '../../components/home/ModeToggle';
import { useRenderTrace } from '../../hooks/useRenderTrace';

type ProfileSettings = {
  territoryColor: string;
  avatarUri?: string;
};

const STALE_MS_DEFAULT = 120_000;
const STALE_MS_LEADERBOARD = 90_000;
const STALE_MS_FRIENDS = 120_000;

export default function HomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView | null>(null);
  const insets = useSafeAreaInsets();
  const { mode, setMode, activeGroupId, setActiveGroupId, groups, refreshGroups } = useMode();
  const { user } = useGoogleAuth();
  const {
    leaderboardEntries,
    leaderboardById,
    ownedTerritoryKm2,
    groupAreaKm2,
    loadLeaderboard,
  } = useHomeLeaderboard({
    mode,
    activeGroupId,
    groups,
    userId: user?.uid,
  });
  const [groupStats, setGroupStats] = useState<{ distanceKm: number; areaKm2: number; runs: number }>({
    distanceKm: 0,
    areaKm2: 0,
    runs: 0,
  });
  const [myGroupStats, setMyGroupStats] = useState<{ distanceKm: number; areaKm2: number; runs: number }>({
    distanceKm: 0,
    areaKm2: 0,
    runs: 0,
  });

  const [profile, setProfile] = useState<ProfileSettings>({
    territoryColor: '#1e90ff',
    avatarUri: undefined,
  });
  const {
    runs,
    loading: loadingRuns,
    reload: reloadRuns,
  } = useRunsContext({ mode, groupId: activeGroupId, userId: user?.uid });
  const {
    friends,
    setFriends,
    showAddFriend,
    setShowAddFriend,
    friendUsername,
    setFriendUsername,
    showAllFriends,
    setShowAllFriends,
    handleAddFriend,
    loadFriendsList,
  } = useHomeFriends({
    userId: user?.uid,
    userUsername: user?.profile?.username,
    leaderboardById,
  });
  const {
    selectedFriend,
    friendRuns,
    removingFriend,
    openFriendDetails,
    closeFriend,
    removeFriendFromProfile,
    addFriendFromProfile,
  } = useFriendProfiles({ friends, user, setFriends });
  const levelColors = useLevelColors(user?.uid);
  const isLoadingRunsRef = useRef(false);
  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshRef = useRef(0);
  const lastTerritoryAreaRef = useRef<number | null>(null);
  const lastTerritoryNotifyAtRef = useRef<number | null>(null);
  const territoryAreaLoadedRef = useRef(false);

  useRenderTrace({
    screen: 'Home',
    label: 'HomeScreen',
    props: {
      mode,
      activeGroupId: activeGroupId ?? null,
      runs: runs.length,
      leaderboard: leaderboardEntries.length,
      friends: friends.length,
      loadingRuns,
      refreshing,
    },
  });
  const lastLoadTimesRef = useRef<{
    runs: number;
    friends: number;
    leaderboard: number;
    territory: number;
  }>({
    runs: 0,
    friends: 0,
    leaderboard: 0,
    territory: 0,
  });
  const {
    startJoinGroupRunFlow,
    selectionModal: joinFlowGroupPicker,
    lobbyModal: joinFlowLobby,
    needMoreModal: joinFlowNeedMore,
  } = useGroupRunJoinFlow();
  const startRun = useCallback(
    async (
      targetMode: 'personal' | 'group' = 'personal',
      options?: { skipPermission?: boolean; groupRunType?: 'casual' | 'official' }
    ) => {
      router.push({
        pathname: '/run-window',
        params: { mode: targetMode, runType: options?.groupRunType },
      });
    },
    [router]
  );

  const startGroupRunNow = useCallback(
    (options: { groupRunType: 'casual' | 'official' }) => {
      startRun('group', { skipPermission: true, groupRunType: options.groupRunType });
    },
    [startRun]
  );

  const {
    groupMembers,
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
  } = useHomeGroupRuns({
    mode,
    activeGroupId: activeGroupId ?? undefined,
    setActiveGroupId,
    groups,
    userId: user?.uid,
    startRun: startGroupRunNow,
    notificationPrefs: user?.profile?.notificationPrefs,
  });

  const {
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
    startGroupRunIntent,
    setStartGroupRunIntent,
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
  } = useHomeGroupManagement({
    userId: user?.uid,
    groups,
    activeGroupId: activeGroupId ?? undefined,
    setActiveGroupId,
    refreshGroups,
    handleGroupRunPress,
  });

  const isOwner = isOwnerFn(groupDetailModal.data?.members ?? [], user?.uid);
  const canManageMembers = canManageFn(groupDetailModal.data?.members ?? [], user?.uid);

  const loadRuns = useCallback(async () => {
    if (isLoadingRunsRef.current || !user?.uid) return;
    isLoadingRunsRef.current = true;
    await reloadRuns();
    isLoadingRunsRef.current = false;
  }, [reloadRuns, user?.uid]);

  const loadProfile = useCallback(async () => {
    if (user?.profile?.territoryColor || user?.profile?.avatarUrl) {
      setProfile((prev) => ({
        ...prev,
        territoryColor:
          user.profile?.territoryColor ?? prev.territoryColor,
        avatarUri: user.profile?.avatarUrl ?? prev.avatarUri,
      }));
    }
  }, [user?.profile?.territoryColor, user?.profile?.avatarUrl]);

  const handleFriendPress = useCallback(
    (friend: FriendEntry) => {
      openFriendDetails(friend);
    },
    [openFriendDetails]
  );

  const refreshHome = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const showSpinner = !opts?.silent;
      const force = opts?.force ?? false;
      const now = Date.now();
      const shouldFetch = (last: number, ttl: number) => force || now - last > ttl;
      try {
        if (showSpinner) setRefreshing(true);
        const tasks: Promise<unknown>[] = [];

        if (shouldFetch(lastLoadTimesRef.current.runs, STALE_MS_DEFAULT)) {
          tasks.push(
            loadRuns().then(() => {
              lastLoadTimesRef.current.runs = now;
            })
          );
        }

        if (shouldFetch(lastLoadTimesRef.current.leaderboard, STALE_MS_LEADERBOARD)) {
          tasks.push(
            loadLeaderboard().then(() => {
              lastLoadTimesRef.current.leaderboard = now;
            })
          );
        }

        if (shouldFetch(lastLoadTimesRef.current.friends, STALE_MS_FRIENDS)) {
          tasks.push(
            loadFriendsList().then(() => {
              lastLoadTimesRef.current.friends = now;
            })
          );
        }

        // Local profile state is cheap; run every time to keep colors/avatar in sync.
        tasks.push(loadProfile());

        await Promise.all(tasks);

        if (shouldFetch(lastLoadTimesRef.current.territory, STALE_MS_DEFAULT)) {
          await preloadTerritoryData().catch(() => {});
          lastLoadTimesRef.current.territory = now;
        }

        lastRefreshRef.current = now;
      } catch {
        // ignore
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [loadRuns, loadProfile, loadLeaderboard, loadFriendsList]
  );

useEffect(() => {
  void refreshHome({ silent: true, force: true });
}, [refreshHome]);

// Group stats when in group mode
useEffect(() => {
  const run = async () => {
    if (mode !== 'group' || !activeGroupId || !user?.uid) {
      setGroupStats({ distanceKm: 0, areaKm2: 0, runs: 0 });
      setMyGroupStats({ distanceKm: 0, areaKm2: 0, runs: 0 });
      return;
    }
    try {
      const gs = await getGroupStats(activeGroupId);
      setGroupStats({
        distanceKm: gs.totalDistanceKm,
        areaKm2: gs.totalAreaKm2,
        runs: gs.totalRuns,
      });
      const us = await getUserGroupStats(user.uid, activeGroupId);
      setMyGroupStats({
        distanceKm: us.distanceKm,
        areaKm2: us.areaKm2 ?? 0,
        runs: us.runs,
      });
    } catch (e) {
      console.log('Failed to load group stats', e);
    }
};
  run();
}, [mode, activeGroupId, user?.uid]);

// Keep group area in sync with current territories (can decrease if stolen)
useEffect(() => {
  if (mode !== 'group' || !activeGroupId) return;
  setGroupStats((prev) => ({ ...prev, areaKm2: groupAreaKm2 }));
}, [groupAreaKm2, mode, activeGroupId]);

  const stats = useMemo(() => {
    const base = buildHomeStats(mode, runs, groupStats, {
      currentAreaKm2: mode === 'personal' ? ownedTerritoryKm2 : undefined,
      groupAreaKm2: mode === 'group' ? groupAreaKm2 : undefined,
    });
    return base;
  }, [runs, mode, groupStats, ownedTerritoryKm2, groupAreaKm2]);

  const { areaRank, distanceRank, areaRankColor, distanceRankColor } = React.useMemo(
    () => computeRanks(leaderboardEntries, user?.uid, stats.totalRuns > 0),
    [leaderboardEntries, user?.uid, stats.totalRuns]
  );

  // Ranking challenge should reflect the user's current rank even if it doesn't change.
  // This snapshot is lightweight (doesn't refetch all runs) and complements the background tracker.
  useEffect(() => {
    if (!user?.uid) return;
    if (mode !== 'personal') return;
    if (!distanceRank || distanceRank <= 0) return;
    void checkAndRecordMainRanking({ userId: user.uid, reason: 'app_resume', force: true });
  }, [user?.uid, mode, distanceRank]);

  const displayInitial =
    user?.profile?.displayName?.[0]?.toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    'Z';

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId),
    [groups, activeGroupId]
  );

  const notificationPrefs = useMemo(
    () => ({ ...DEFAULT_NOTIFICATION_PREFS, ...(user?.profile?.notificationPrefs ?? {}) }),
    [user?.profile?.notificationPrefs]
  );

  useEffect(() => {
    territoryAreaLoadedRef.current = false;
    lastTerritoryAreaRef.current = null;
    lastTerritoryNotifyAtRef.current = null;
    if (!user?.uid) return;
    (async () => {
      const [lastArea, lastNotifyAt] = await Promise.all([
        loadLastTerritoryAreaKm2(),
        loadLastTerritoryNotifyAtMs(),
      ]);
      lastTerritoryAreaRef.current = lastArea;
      lastTerritoryNotifyAtRef.current = lastNotifyAt;
      territoryAreaLoadedRef.current = true;
    })();
  }, [user?.uid]);

  useEffect(() => {
    if (mode !== 'personal') return;
    if (!user?.uid) return;
    if (!territoryAreaLoadedRef.current) return;

    const prev = lastTerritoryAreaRef.current;
    const next = ownedTerritoryKm2;
    if (prev == null) {
      lastTerritoryAreaRef.current = next;
      void saveLastTerritoryAreaKm2(next);
      return;
    }

    const dropKm2 = prev - next;
    const thresholdKm2 = 0.01;
    const cooldownMs = 30 * 60 * 1000;
    const now = Date.now();
    const lastNotifyAt = lastTerritoryNotifyAtRef.current ?? 0;

    if (
      dropKm2 >= thresholdKm2 &&
      notificationPrefs.localEnabled &&
      notificationPrefs.territoryStolen &&
      now - lastNotifyAt > cooldownMs
    ) {
      showLocalNotification({
        title: 'Territory stolen',
        body: `You lost ${dropKm2.toFixed(2)} km² of territory.`,
        tag: 'territory-stolen',
        data: { dropKm2, nextKm2: next },
      });
      lastTerritoryNotifyAtRef.current = now;
      void saveLastTerritoryNotifyAtMs(now);
    }

    lastTerritoryAreaRef.current = next;
    void saveLastTerritoryAreaKm2(next);
  }, [mode, ownedTerritoryKm2, notificationPrefs.localEnabled, notificationPrefs.territoryStolen, user?.uid]);

  const normalizedRuns = runs.map((r) => ({
    ...r,
    id: (r.id ?? '').toString(),
  }));
  const normalizedLastRun = stats.lastRun
    ? ({
        id: (stats.lastRun.id ?? '').toString(),
        distance: stats.lastRun.distance ?? 0,
        elapsedSeconds: stats.lastRun.elapsedSeconds ?? 0,
        startedAt: stats.lastRun.startedAt,
        areaKm2: stats.lastRun.areaKm2,
        createdAt: stats.lastRun.createdAt ?? Date.now(),
        userId: stats.lastRun.userId ?? user?.uid ?? '',
        route: (stats.lastRun as any).route ?? [],
      } as const)
    : null;

  const startGroupLabel = 'Group run';
  const hasMultipleGroups = groups.length > 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: (insets.bottom || 0) + 64, flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refreshHome({ silent: false, force: true })}
              tintColor="#e5e7eb"
            />
          }
        >
        <HomeHeader
          territoryColor={profile.territoryColor}
          avatarUri={profile.avatarUri}
          displayInitial={displayInitial}
          onPressAvatar={() => router.push('/profile')}
        />

        <ModeToggle mode={mode} onSelect={setMode} />

        <HomeGroupModals
          insets={insets}
          userId={user?.uid}
          groups={groups}
          levelColors={levelColors}
          createGroupModal={createGroupModal}
          groupNameInput={groupNameInput}
          setGroupNameInput={setGroupNameInput}
          groupColor={groupColor}
          setGroupColor={setGroupColor}
          joiningGroup={joiningGroup}
          onCreateGroup={handleCreateGroup}
          joinGroupModal={joinGroupModal}
          joinCodeInput={joinCodeInput}
          setJoinCodeInput={setJoinCodeInput}
          joinError={joinError}
          setJoinError={setJoinError}
          onJoinGroup={handleJoinGroup}
          runGroupPicker={runGroupPicker}
          startGroupRunIntent={startGroupRunIntent}
          setStartGroupRunIntent={setStartGroupRunIntent}
          onPickGroup={handlePickGroupForRunIntent}
          onPickGroupForDetail={handlePickGroupForDetail}
          groupDetailModal={groupDetailModal}
          isOwner={isOwner}
          canManageMembers={canManageMembers}
          memberAction={memberAction}
          setMemberAction={setMemberAction}
          friends={friends}
          selectedFriend={selectedFriend}
          friendRuns={friendRuns as any}
          removingFriend={!!removingFriend}
          onCloseFriend={closeFriend}
          onOpenRunDetail={(id) => router.push({ pathname: '/run-detail', params: { id } })}
          onRemoveFriend={removeFriendFromProfile}
          onAddFriend={addFriendFromProfile}
          onOpenFriendProfile={async (existing) => {
            await openFriendDetails(existing);
          }}
          onSendFriendRequest={async (targetUserId) => {
            try {
              const result = await sendFriendRequest(user!.uid, user?.profile?.username, targetUserId);
              setMemberAction(null);
              Alert.alert(
                result.action === 'cancelled' ? 'Cancelled' : 'Sent',
                result.action === 'cancelled' ? 'Friend request cancelled.' : 'Friend request sent.'
              );
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not send request.');
            }
          }}
          onDeleteGroup={handleDeleteGroup}
          onMakeAdminToggle={handleMakeAdminToggle}
          onRemoveMember={handleRemoveMember}
          onInvite={handleInvite}
          participantsModalVisible={participantsModalVisible}
          setParticipantsModalVisible={setParticipantsModalVisible}
          pendingGroupRunAction={pendingGroupRunAction}
          pendingRunType={pendingRunType}
          participantList={participantList}
          participantLevels={participantLevels}
          onConfirmGroupRun={handleConfirmGroupRun}
          runTypeModalVisible={runTypeModalVisible}
          setRunTypeModalVisible={setRunTypeModalVisible}
          setPendingRunType={setPendingRunType}
          confirmRunTypeSelection={confirmRunTypeSelection}
          groupMembers={groupMembers}
          pendingGroupId={pendingGroupId}
          onSwitchActiveGroup={handleSwitchActiveGroup}
          onCloseParticipants={closeParticipantsModal}
        />

        {mode === 'group' ? (
          <HomeGroup
            accentColor={profile.territoryColor}
            activeGroupName={activeGroup?.name}
            activeGroupColor={activeGroup?.color}
            groupStats={groupStats}
            myGroupStats={myGroupStats}
            areaRank={areaRank}
            distanceRank={distanceRank}
            areaRankColor={areaRankColor}
            distanceRankColor={distanceRankColor}
            startLabel={startGroupLabel}
            // No active group run right now – show idle state
            isLive={false}
            onPressAreaRank={() =>
              router.push({ pathname: '/leaderboard', params: { focus: 'area' } })
            }
            onPressDistanceRank={() =>
              router.push({ pathname: '/leaderboard', params: { focus: 'distance' } })
            }
            onPressStartGroupRun={async () => {
              await startJoinGroupRunFlow('home');
            }}
            onPressSelectGroup={() => {
              if (hasMultipleGroups) {
                runGroupPicker.open('switch');
              }
            }}
            hasMultipleGroups={hasMultipleGroups}
            groupPicker={
              <GroupPicker
                groups={groups}
                activeGroupId={activeGroupId}
                onSelect={async (g) => {
                  await handleShowGroupDetail(g.id);
                }}
                onCreate={() => createGroupModal.open()}
                onJoin={() => {
                  setJoinError(null);
                  setJoinCodeInput('');
                  joinGroupModal.open();
                }}
              />
            }
          />
        ) : (
          <HomePersonal
            accentColor={profile.territoryColor}
            stats={{
              totalRuns: stats.totalRuns,
              totalDistanceMeters: stats.totalDistanceMeters,
              totalTimeSeconds: stats.totalTimeSeconds,
              totalAreaKm2: stats.totalAreaKm2,
              lastRun: normalizedLastRun,
            }}
            areaRank={areaRank}
            distanceRank={distanceRank}
            areaRankColor={areaRankColor}
            distanceRankColor={distanceRankColor}
            runs={normalizedRuns}
            loadingRuns={loadingRuns}
            onPressStart={() => startRun('personal')}
            onPressViewAllRuns={() => router.push('/history')}
            onPressRun={(id) =>
              router.push({ pathname: '/run-detail', params: { id: id.toString() } })
            }
            onPressAreaRank={() =>
              router.push({ pathname: '/leaderboard', params: { focus: 'area' } })
            }
            onPressDistanceRank={() =>
              router.push({ pathname: '/leaderboard', params: { focus: 'distance' } })
            }
            friendsHeader={null}
            friendsList={
              <FriendsBlock
                friends={friends}
                showAllFriends={showAllFriends}
                showAddFriend={showAddFriend}
                friendUsername={friendUsername}
                accentColor={profile.territoryColor}
                onChangeFriendUsername={setFriendUsername}
                onAddFriendPress={() => setShowAddFriend(true)}
                onSubmitFriend={handleAddFriend}
                onCancelAddFriend={() => {
                  setShowAddFriend(false);
                  setFriendUsername('');
                }}
                onFriendPress={handleFriendPress}
                onToggleShowAll={() => setShowAllFriends((prev) => !prev)}
              />
            }
          />
        )}

        {/* Friend detail overlay/modal */}
        <FriendDetailModal
          visible={!!selectedFriend && !groupDetailModal.visible}
          friend={selectedFriend}
          runs={friendRuns}
          removing={removingFriend}
          isFriend={!!selectedFriend?.isFriend}
          onClose={closeFriend}
          onOpenRunDetail={(id) =>
            router.push({ pathname: '/run-detail', params: { id } })
          }
          onRemoveFriend={removeFriendFromProfile}
          onAddFriend={addFriendFromProfile}
        />

        {joinFlowNeedMore}
        {joinFlowGroupPicker}
        {joinFlowLobby}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 64,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: 'white',
  },
  tagline: {
    marginTop: 4,
    fontSize: 13,
    color: '#9ca3af',
  },
  avatarButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  heroCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: '#111827',
    marginBottom: 12,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 18,
    textAlign: 'center',
  },
  contributionText: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  modeToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1220',
    alignItems: 'center',
  },
  modeToggleActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  modeToggleText: {
    color: '#9ca3af',
    fontWeight: '700',
  },
  modeToggleTextActive: {
    color: '#22c55e',
  },
  groupPickerRow: {
    marginBottom: 12,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
    marginBottom: 6,
  },
  groupHeaderTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  groupAddButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1220',
    marginRight: 8,
  },
  heroDivider: {
    alignSelf: 'center',
    width: '50%',
    height: 1,
    backgroundColor: '#9ca3af',
    marginBottom: 14,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 6,
    marginBottom: 14,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatLabel: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e5e7eb',
    textAlign: 'center',
  },
  heroButtonsRow: {
    flexDirection: 'column',
    marginTop: 4,
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#22c55e',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryButtonFull: {
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 16,
  },
  buttonBar: {
    marginTop: 20,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  bigButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bigButtonStart: {
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#22c55e',
  },
  bigButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#020617',
  },
  buttonPressed: {
    opacity: 0.8,
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
  leaderboardRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: '#e5e7eb',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 6,
  },
  friendsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  friendsTitle: {
    marginBottom: 0,
  },
  sectionLink: {
    fontSize: 13,
    color: '#38bdf8',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingText: {
    marginLeft: 8,
    color: '#9ca3af',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  lastRunCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  lastRunIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  lastRunTextBlock: {
    flex: 1,
  },
  lastRunDistance: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  lastRunDate: {
    color: '#9ca3af',
    fontSize: 13,
  },
  lastRunChevron: {
    fontSize: 24,
    color: '#9ca3af',
  },
  friendsCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  friendsPlaceholder: {
    color: '#9ca3af',
    fontSize: 14,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 4,
  },
  friendInitial: {
    color: '#e5e7eb',
    fontWeight: '700',
  },
  friendName: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  friendUsername: {
    color: '#9ca3af',
    fontSize: 12,
  },
  friendsList: {
    gap: 8,
    marginTop: 8,
  },
  friendItem: {
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
  friendMeta: {
    color: '#9ca3af',
    fontSize: 12,
  },
  friendChevron: {
    color: '#6b7280',
    fontSize: 18,
    marginLeft: 'auto',
  },
  addFriendText: {
    color: '#60a5fa',
    fontWeight: '700',
    fontSize: 14,
  },
  addFriendRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  addFriendInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: 'white',
  },
  addFriendConfirm: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#22c55e',
  },
  addFriendConfirmText: {
    color: '#020617',
    fontWeight: '700',
  },
  addFriendCancel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ef4444',
  },
  addFriendCancelText: {
    color: 'white',
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
  },
  actionTitle: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  actionSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
  },
  participantsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  participantsCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0b1120',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#111827',
  },
  participantsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
    marginBottom: 4,
  },
  participantsSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 10,
  },
  participantsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111827',
    color: '#22c55e',
    fontWeight: '800',
    marginTop: 4,
  },
  participantsEmpty: {
    color: '#9ca3af',
    fontSize: 13,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  participantDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  participantName: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  participantRole: {
    color: '#9ca3af',
    fontSize: 12,
  },
  participantYou: {
    color: '#22c55e',
    fontWeight: '700',
    fontSize: 12,
  },
  participantActionButton: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantActionText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 15,
  },
  runTypeRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    marginTop: 10,
    backgroundColor: '#0b1120',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  runTypeTitle: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  runTypeSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
    maxWidth: 240,
  },
  // Group creation modal styles (unique keys)
});

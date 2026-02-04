import { useRouter } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { logout, updateUserProfile } from '../../lib/authService';
import { auth } from '../../lib/firebaseConfig';
import { loadIncomingFriendRequests, respondToFriendRequest } from '../../lib/friendService';
import { showLocalNotification } from '../../lib/notifications/service';
import { DEFAULT_NOTIFICATION_PREFS } from '../../lib/notifications/types';
import Ionicons from '@/components/common/Ionicons';
import { listGroupsForUser, listGroupInvitesForUser, acceptGroupInvite, declineGroupInvite } from '../../lib/groupService';
import { formatTimeHrs, formatDistance, formatDate } from '../../lib/utils/format';
import ChallengesModal from '../../components/profile/ChallengesModal';
import { useMonthlyChallenges } from '../../hooks/useMonthlyChallenges';
import { useYearlyChallenges } from '../../hooks/useYearlyChallenges';
import { useProfileData } from '../../hooks/useProfileData';
import { useProfileRuns } from '../../hooks/useProfileRuns';
import { defaultXPConfig, levelFromTotalXp } from '../../lib/xpProgression';
import { getPrefetchedTerritory, preloadTerritoryData } from '../../lib/territoryPrefetch';
import { PendingRunsStore } from '../../lib/pendingRunsStore';
import { DeletedRunsStore } from '../../lib/deletedRunsStore';
import { rebuildTerritoriesFromRuns, territoryAreaKm2 } from '../../lib/territoryEngine';
import { fetchRunsForContext } from '../../lib/runContext';
import { resolveLevelBorderTier } from '../../lib/rewardSelectors';
import { StyledAvatar } from '../../components/common/StyledAvatar';
import {
  medalFromId,
  medalsFromChallenges,
  medalsFromMonthlyHistory,
  medalsFromYearlyHistory,
  type Medal,
} from '../../lib/medals';
import { MedalPicker, MedalSlots } from '../../components/profile/MedalPicker';
import { MedalChooserModal } from '../../components/profile/MedalChooserModal';
import { useRenderTrace } from '../../hooks/useRenderTrace';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
const {
  profileSettings,
  userProfile,
  previewUri,
  setPreviewUri,
  loadProfileSettings,
  handleAvatarPress,
  handleBannerPress,
} = useProfileData(currentUser);
  const [groups, setGroups] = useState<{ id: string; name: string; color: string }[]>([]);
  const [friendRequests, setFriendRequests] = useState<
    {
      id: string;
      fromUsername?: string;
      fromDisplayName?: string;
      createdAt: number;
    }[]
  >([]);
  const friendRequestIdsRef = useRef<Set<string>>(new Set());
  const friendRequestLoadedRef = useRef(false);
  const [showChallenges, setShowChallenges] = useState(false);
  const [groupInvites, setGroupInvites] = useState<
    {
      id: string;
      groupId: string;
      groupName?: string;
      groupColor?: string;
      fromUsername?: string;
      fromDisplayName?: string;
      createdAt: number;
    }[]
  >([]);

  const router = useRouter();

  const { loadingRuns: loading, loadRuns, stats, levelInfo, recentRuns } = useProfileRuns(
    currentUser,
    userProfile,
    groups
  );
  const [medalPickerOpen, setMedalPickerOpen] = useState(false);
  const monthlyChallenges = useMonthlyChallenges(currentUser?.uid ?? undefined, userProfile);
  const yearlyChallenges = useYearlyChallenges(currentUser?.uid ?? undefined);

  useRenderTrace({
    screen: 'Profile',
    label: 'ProfileScreen',
    props: {
      userId: currentUser?.uid ?? null,
      loading,
      groups: groups.length,
      friendRequests: friendRequests.length,
      groupInvites: groupInvites.length,
      recentRuns: recentRuns.length,
      showChallenges,
      medalPickerOpen,
    },
  });
  const [ownedTerritoryKm2, setOwnedTerritoryKm2] = useState<number>(0);
  const [selectedMedals, setSelectedMedals] = useState<string[]>(userProfile?.selectedMedals ?? []);
  const [savingMedals, setSavingMedals] = useState(false);
  const normalizeTemp = useCallback((ids: string[] | null | undefined): (string | null)[] => {
    const base: (string | null)[] = Array.isArray(ids) ? [...ids] : [];
    while (base.length < 3) base.push(null);
    return base.slice(0, 3);
  }, []);
  const [tempMedals, setTempMedals] = useState<(string | null)[]>(normalizeTemp(userProfile?.selectedMedals));
  const tempMedalIds = useMemo(() => (tempMedals ?? []).filter((m): m is string => !!m), [tempMedals]);
const [refreshing, setRefreshing] = useState(false);
const lastRefreshRef = useRef(0);
const lastLoadTimesRef = useRef<{
  runs: number;
  profile: number;
  friendRequests: number;
  groupInvites: number;
  territory: number;
}>({
  runs: 0,
  profile: 0,
  friendRequests: 0,
  groupInvites: 0,
  territory: 0,
});
const [unlockedMedalsDisplay, setUnlockedMedalsDisplay] = useState<Medal[]>([]);
const isRefreshingTerritory = useRef(false);
const fastLevelInfo = useMemo(
  () => levelFromTotalXp(Math.max(0, userProfile?.lifetimeXp ?? 0), defaultXPConfig),
  [userProfile?.lifetimeXp]
);
const displayedLevelInfo = useMemo(() => {
  return levelInfo.totalXp > fastLevelInfo.totalXp ? levelInfo : fastLevelInfo;
}, [fastLevelInfo, levelInfo]);
const [stableLevelInfo, setStableLevelInfo] = useState(displayedLevelInfo);
useEffect(() => {
  // Keep level non-decreasing to avoid flicker from incremental data loading.
  if (!stableLevelInfo || displayedLevelInfo.totalXp > stableLevelInfo.totalXp) {
    setStableLevelInfo(displayedLevelInfo);
  }
}, [displayedLevelInfo, stableLevelInfo]);
const levelReady = !!userProfile;
  const unlockedMedals: Medal[] = useMemo(() => {
    const current = [
      ...medalsFromChallenges(monthlyChallenges.views, 'monthly'),
      ...medalsFromChallenges(yearlyChallenges.views, 'yearly'),
    ];
    const historical = [
      ...medalsFromMonthlyHistory(monthlyChallenges.state),
      ...medalsFromYearlyHistory(yearlyChallenges.state),
    ];
    const deduped = new Map<string, Medal>();
    [...current, ...historical].forEach((m) => deduped.set(m.id, m));
    return Array.from(deduped.values());
  }, [monthlyChallenges.state, monthlyChallenges.views, yearlyChallenges.state, yearlyChallenges.views]);

  useEffect(() => {
    if (unlockedMedals.length) {
      setUnlockedMedalsDisplay(unlockedMedals);
    }
  }, [unlockedMedals]);

  const medalCountsByChallenge = useMemo(() => {
    const counts: Record<string, { bronze: number; silver: number; gold: number }> = {};
    for (const medal of unlockedMedals) {
      const parts = medal.id.split(':');
      if (parts.length !== 4) continue;
      const challengeId = parts[2];
      if (!counts[challengeId]) {
        counts[challengeId] = { bronze: 0, silver: 0, gold: 0 };
      }
      counts[challengeId][medal.tier] = 1;
    }
    return counts;
  }, [unlockedMedals]);

  const refreshOwnedTerritory = useCallback(async () => {
    try {
      if (isRefreshingTerritory.current) return;
      isRefreshingTerritory.current = true;
      if (!currentUser?.uid) {
        setOwnedTerritoryKm2(0);
        isRefreshingTerritory.current = false;
        return;
      }

      // Best-effort refresh so steals are reflected (uses the same "global runs" source as the territory map).
      await preloadTerritoryData({ force: true }).catch(() => {});
      const prefetched = getPrefetchedTerritory().runs;

      const [allRuns, pendingMine, deleted] = await Promise.all([
        (prefetched && Array.isArray(prefetched) ? prefetched : fetchRunsForContext({ mode: 'personal', userId: currentUser.uid })) as any,
        PendingRunsStore.listRunDocs(currentUser.uid),
        DeletedRunsStore.getSet(),
      ]);

      const merged = [...(pendingMine as any[]), ...(allRuns as any[])].filter((r: any) => {
        const id = (r?.id ?? '').toString();
        if (!id) return false;
        if (deleted.has(id)) return false;
        // Ignore group runs for personal territory.
        if ((r as any).mode === 'group' || (r as any).groupId) return false;
        return !!r.userId && Array.isArray(r.route) && r.route.length >= 3;
      });

      // Deduplicate by id (prefer pending/most-recent first) to avoid applying the same run twice.
      const seen = new Set<string>();
      const deduped = merged.filter((r: any) => {
        const id = (r?.id ?? '').toString();
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      const territories = rebuildTerritoriesFromRuns(
        deduped.map((r: any) => ({
          userId: r.userId,
          route: r.route ?? [],
          startedAt: r.startedAt,
          createdAt: r.createdAt,
        }))
      );

      const mine = territories.get(currentUser.uid) ?? null;
      setOwnedTerritoryKm2(territoryAreaKm2(mine));
    } catch (e) {
      console.log('Failed to refresh owned territory area', e);
    } finally {
      isRefreshingTerritory.current = false;
    }
  }, [currentUser?.uid]);

  const loadFriendRequests = useCallback(async () => {
    if (!currentUser?.uid) {
      setFriendRequests([]);
      return;
    }
    try {
      const incoming = await loadIncomingFriendRequests(currentUser.uid);
      const mapped = incoming.map((r) => ({
        id: r.id,
        fromUsername: r.fromUsername,
        fromDisplayName: r.fromDisplayName,
        createdAt: r.createdAt,
      }));
      const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(userProfile?.notificationPrefs ?? {}) };
      if (prefs.localEnabled && prefs.friendRequest && friendRequestLoadedRef.current) {
        const prev = friendRequestIdsRef.current;
        const nextIds = new Set(mapped.map((r) => r.id));
        const newReq = mapped.find((r) => !prev.has(r.id));
        if (newReq) {
          const name = newReq.fromDisplayName || newReq.fromUsername || 'Someone';
          showLocalNotification({
            title: 'Friend request',
            body: `${name} sent you a friend request`,
            tag: `friend-request:${newReq.id}`,
            data: { requestId: newReq.id },
          });
        }
        friendRequestIdsRef.current = nextIds;
      } else {
        friendRequestIdsRef.current = new Set(mapped.map((r) => r.id));
      }
      friendRequestLoadedRef.current = true;
      setFriendRequests(mapped);
    } catch (e) {
      console.log('Failed to load friend requests', e);
      setFriendRequests([]);
    }
  }, [currentUser?.uid, userProfile?.notificationPrefs]);

  const handleFriendResponse = useCallback(
    async (id: string, status: 'accepted' | 'declined') => {
      try {
        await respondToFriendRequest(id, status);
        setFriendRequests((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        console.log('Failed to respond to friend request', e);
        Alert.alert('Error', 'Failed to update request. Try again.');
      }
    },
    []
  );

  const loadGroupInvites = useCallback(async () => {
    if (!currentUser?.uid) {
      setGroupInvites([]);
      return;
    }
    try {
      const invites = await listGroupInvitesForUser(currentUser.uid);
      setGroupInvites(
        invites.map((inv) => ({
          id: inv.id,
          groupId: inv.groupId,
          groupName: inv.group?.name,
          groupColor: inv.group?.color,
          fromUsername: inv.fromUsername,
          fromDisplayName: inv.fromDisplayName,
          createdAt: inv.createdAt,
        }))
      );
    } catch (e) {
      console.log('Failed to load group invites', e);
      setGroupInvites([]);
    }
  }, [currentUser?.uid]);

  const refreshProfile = useCallback(
    async (opts?: { silent?: boolean; skipTerritory?: boolean; force?: boolean }) => {
      const showSpinner = !opts?.silent;
      const force = opts?.force ?? false;
      const now = Date.now();
      const shouldFetch = (last: number, ttl: number) => force || now - last > ttl;
      const TTL = 120_000;
      try {
        if (showSpinner) setRefreshing(true);
        const tasks: Promise<unknown>[] = [];

        if (shouldFetch(lastLoadTimesRef.current.runs, TTL)) {
          tasks.push(
            loadRuns().then(() => {
              lastLoadTimesRef.current.runs = now;
            })
          );
        }

        if (shouldFetch(lastLoadTimesRef.current.profile, TTL)) {
          tasks.push(
            loadProfileSettings().then(() => {
              lastLoadTimesRef.current.profile = now;
            })
          );
        } else {
          tasks.push(loadProfileSettings());
        }

        if (shouldFetch(lastLoadTimesRef.current.friendRequests, TTL)) {
          tasks.push(
            loadFriendRequests().then(() => {
              lastLoadTimesRef.current.friendRequests = now;
            })
          );
        }

        if (shouldFetch(lastLoadTimesRef.current.groupInvites, TTL)) {
          tasks.push(
            loadGroupInvites().then(() => {
              lastLoadTimesRef.current.groupInvites = now;
            })
          );
        }

        if (!opts?.skipTerritory && shouldFetch(lastLoadTimesRef.current.territory, TTL)) {
          tasks.push(
            refreshOwnedTerritory().then(() => {
              lastLoadTimesRef.current.territory = now;
            })
          );
        }

        await Promise.all(tasks);
        lastRefreshRef.current = now;
      } catch {
        // ignore
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [loadRuns, loadProfileSettings, loadFriendRequests, loadGroupInvites, refreshOwnedTerritory]
  );

const handleGroupInviteResponse = useCallback(
  async (id: string, action: 'accept' | 'decline') => {
    try {
      const invite = groupInvites.find((i) => i.id === id);
      if (action === 'accept') {
          await acceptGroupInvite(id, currentUser!.uid);
          if (invite) {
            setGroups((prev) => {
              if (prev.some((g) => g.id === invite.groupId)) return prev;
              return [
                ...prev,
                {
                  id: invite.groupId,
                  name: invite.groupName ?? 'Group',
                  color: invite.groupColor ?? '#22c55e',
                },
              ];
            });
          }
        } else {
          await declineGroupInvite(id);
        }
        setGroupInvites((prev) => prev.filter((i) => i.id !== id));
      } catch (e) {
        console.log('Failed to update group invite', e);
        Alert.alert('Error', 'Could not update invite.');
      }
  },
  [currentUser, groupInvites]
);

  const handleToggleMedal = useCallback((id: string) => {
    setTempMedals((prev) => {
      const next = normalizeTemp(prev as any);
      const existingIdx = next.findIndex((m) => m === id);
      if (existingIdx >= 0) {
        next[existingIdx] = null;
        return next;
      }
      const emptyIdx = next.findIndex((m) => !m);
      if (emptyIdx >= 0) {
        next[emptyIdx] = id;
        return next;
      }
      return next;
    });
  }, [normalizeTemp]);

  const handleSaveMedals = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      setSavingMedals(true);
      const cleaned = tempMedals.filter((m): m is string => !!m);
      setSelectedMedals(cleaned);
      await updateUserProfile(currentUser.uid, { selectedMedals: cleaned });
      setMedalPickerOpen(false);
      setTempMedals(normalizeTemp(cleaned));
    } catch (e) {
      console.log('Failed to save medals', e);
      Alert.alert('Save failed', 'Could not save medals. Try again.');
    } finally {
      setSavingMedals(false);
    }
  }, [currentUser?.uid, tempMedals, normalizeTemp]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setCurrentUser(fbUser);
      setAccountLoading(false);
    });

    return unsub;
  }, []);

  useEffect(() => {
    friendRequestIdsRef.current = new Set();
    friendRequestLoadedRef.current = false;
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!accountLoading && !currentUser) {
      // Send unauthenticated users to the auth flow
      router.replace('/(auth)/welcome');
    }
  }, [accountLoading, currentUser, router]);

  useEffect(() => {
    // Initial load (silent; no spinner)
    void refreshProfile({ silent: true, force: true });
  }, [refreshProfile]);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (e) {
              console.log('Sign out error', e);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    setSelectedMedals(userProfile?.selectedMedals ?? []);
    setTempMedals(normalizeTemp(userProfile?.selectedMedals));
  }, [userProfile?.selectedMedals, normalizeTemp]);

  const selectedMedalObjects = useMemo(
    () => (selectedMedals ?? []).map(medalFromId).filter(Boolean) as Medal[],
    [selectedMedals]
  );
  const tempMedalObjects = useMemo(
    () =>
      (tempMedals ?? []).map((id) => (id ? medalFromId(id) : null)) as Array<Medal | null>,
    [tempMedals]
  );

  const medalChangesPending = useMemo(() => {
    const current = JSON.stringify(selectedMedals ?? []);
    const next = JSON.stringify(tempMedalIds);
    return current !== next;
  }, [selectedMedals, tempMedalIds]);
  useEffect(() => {
    const loadGroups = async () => {
      if (!currentUser?.uid) {
        setGroups([]);
        return;
      }
      try {
        const list = await listGroupsForUser(currentUser.uid);
        setGroups(list.map((g) => ({ id: g.id, name: g.name, color: g.color })));
      } catch (e) {
        console.log('Failed to load groups', e);
      }
    };
    loadGroups();
  }, [currentUser?.uid]);

  if (accountLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Checking your account…</Text>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Redirecting to sign in…</Text>
      </SafeAreaView>
    );
  }

  const effectiveLevelInfo = stableLevelInfo ?? displayedLevelInfo;
  const avatarTier = resolveLevelBorderTier(effectiveLevelInfo.level ?? 1, userProfile);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refreshProfile({ silent: false, force: true })}
            tintColor="#e5e7eb"
          />
        }
      >
        {/* Cover banner */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleBannerPress}
          style={[
            styles.coverBanner,
            { backgroundColor: profileSettings.territoryColor || '#0b1120' },
          ]}
        >
          {profileSettings.bannerUri ? (
            <Image source={{ uri: profileSettings.bannerUri }} style={styles.coverImage} />
          ) : null}
        </TouchableOpacity>

        {/* Top profile card */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarButton} onPress={handleAvatarPress}>
            <StyledAvatar
              uri={profileSettings.avatarUri}
              name={currentUser?.displayName ?? userProfile?.displayName ?? 'Runner'}
              size={92}
              tier={avatarTier}
            />
          </TouchableOpacity>

        <View style={styles.profileInfoRow}>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Runner'}
            </Text>
            {currentUser?.email ? (
              <Text style={styles.email}>{currentUser.email}</Text>
            ) : null}
            {userProfile?.username ? (
              <Text style={styles.username}>@{userProfile.username}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.settingsIconButton}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={22} color="#e5e7eb" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ marginTop: 10, marginBottom: 8 }}>
        <View style={styles.levelHeader}>
          <Text style={styles.levelLabel}>Level {levelReady ? effectiveLevelInfo.level : '…'}</Text>
          <Text style={styles.levelXp}>
            {levelReady ? effectiveLevelInfo.xpIntoLevel ?? 0 : '…'}/
            {levelReady ? effectiveLevelInfo.xpForNext : '…'} xp
          </Text>
        </View>
        <View style={styles.levelBarTrack}>
          <View
            style={[
              styles.levelBarFill,
              { width: levelReady ? `${Math.round(effectiveLevelInfo.progressPct * 100)}%` : '0%' },
            ]}
          />
        </View>
        <Text style={styles.levelMeta}>
          {defaultXPConfig.sources.distanceXpPerKm} XP/km · {defaultXPConfig.sources.territoryXpPerKm2} XP/km²
        </Text>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
            marginBottom: 14,
            paddingHorizontal: 10,
          }}
        >
          <TouchableOpacity onPress={() => setShowChallenges(true)}>
            <Text style={[styles.challengeButtonText, { textAlign: 'left' }]}>View challenges</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/rewards')}>
            <Text style={[styles.challengeButtonText, { textAlign: 'right' }]}>Customize</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, styles.medalTitle]}>Medals</Text>
        <MedalSlots
          variant="plain"
          selected={medalPickerOpen ? tempMedalObjects : selectedMedalObjects}
          onPress={() => {
            setTempMedals(normalizeTemp(selectedMedals));
            setMedalPickerOpen(true);
          }}
          onRemove={
            medalPickerOpen
              ? (id) => {
                  setTempMedals((prev) => {
                    const next = normalizeTemp(prev as any);
                    const idx = next.findIndex((m) => m === id);
                    if (idx >= 0) next[idx] = null;
                    return next;
                  });
                }
              : undefined
          }
        />
      </View>

      {/* Stats grid */}
      <Text style={[styles.sectionTitle, styles.medalTitle]}>Your stats</Text>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardFull]}>
          <Text style={styles.statLabel}>Area captured</Text>
          <Text style={styles.statValue}>
            {ownedTerritoryKm2.toFixed(2)} km²
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total distance</Text>
          <Text style={styles.statValue}>
            {formatDistance(stats.totalDistanceMeters)}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total time</Text>
          <Text style={styles.statValue}>
            {stats.totalTimeSeconds > 0
              ? formatTimeHrs(stats.totalTimeSeconds)
              : '0h 00m'}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total runs</Text>
          <Text style={styles.statValue}>{stats.totalRuns}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total calories</Text>
          <Text style={styles.statValue}>
            {Math.round(stats.totalCaloriesKcal)} kcal
          </Text>
        </View>
      </View>

        {/* Groups */}
        <Text style={styles.sectionTitle}>Groups</Text>
        {groups.length === 0 ? (
          <Text style={styles.emptyText}>You are not in any groups yet.</Text>
        ) : (
          <View style={styles.groupList}>
            {groups.map((g) => (
              <View key={g.id} style={styles.groupRow}>
                <View style={[styles.groupDot, { backgroundColor: g.color }]} />
                <Text style={styles.groupName}>{g.name}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.recentHeaderRow}>
          <Text style={styles.sectionTitle}>Recent runs</Text>
          <TouchableOpacity onPress={() => router.push('/history')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {loading && <Text style={styles.loadingText}>Loading runs…</Text>}

        {!loading && recentRuns.length === 0 && (
          <Text style={styles.emptyText}>
            Your recent runs will appear here once you start running.
          </Text>
        )}

        {!loading && recentRuns.length > 0 && (
          <View style={styles.recentListScroll}>
              <FlatList
                data={recentRuns}
                keyExtractor={(item) => (item.id ?? '').toString()}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.recentList}
              renderItem={({ item }) => {
                const distanceLabel = formatDistance(item.distance);

                return (
                  <TouchableOpacity
                    style={styles.runRow}
                    onPress={() =>
                      router.push({
                        pathname: '/run-detail',
                        params: { id: (item.id ?? '').toString() },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.runIcon,
                        { backgroundColor: profileSettings.territoryColor },
                      ]}
                    />
                    <View style={styles.runTextBlock}>
                      <Text style={styles.runDistance}>{distanceLabel}</Text>
                      <Text style={styles.runDate}>
                        {formatDate(item.startedAt)}
                      </Text>
      </View>

      <ChallengesModal
        visible={showChallenges}
        challenges={monthlyChallenges.views}
        yearlyChallenges={yearlyChallenges.views}
        onClose={() => setShowChallenges(false)}
      />
                    <Text style={styles.runChevron}>›</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* Group invites */}
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Group invites</Text>
          {groupInvites.length === 0 ? (
            <Text style={styles.emptyText}>No group invites yet.</Text>
          ) : (
            groupInvites.map((inv) => (
              <View key={inv.id} style={styles.requestRow}>
                <View style={styles.requestTextBlock}>
                  <Text style={styles.requestName} numberOfLines={2}>
                    {inv.fromDisplayName ?? inv.fromUsername ?? 'Runner'} invited you to
                    {inv.groupName ? ` #${inv.groupName}` : ' a group'}
                  </Text>
                  <Text style={styles.requestDate}>
                    {new Date(inv.createdAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.requestAccept}
                    onPress={() => handleGroupInviteResponse(inv.id, 'accept')}
                  >
                    <Text style={styles.requestAcceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.requestDecline}
                    onPress={() => handleGroupInviteResponse(inv.id, 'decline')}
                  >
                    <Text style={styles.requestDeclineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Friend requests */}
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Friend requests</Text>
          {friendRequests.length === 0 ? (
            <Text style={styles.emptyText}>No friend requests yet.</Text>
          ) : (
            friendRequests.map((req) => (
              <View key={req.id} style={styles.requestRow}>
                <View style={styles.requestTextBlock}>
                  <Text style={styles.requestName} numberOfLines={2}>
                    {req.fromDisplayName ?? 'Player'}
                  </Text>
                  <Text style={styles.requestUsername}>
                    @{req.fromUsername ?? 'unknown'}
                  </Text>
                  <Text style={styles.requestDate}>
                    {new Date(req.createdAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.requestAccept}
                    onPress={() => handleFriendResponse(req.id, 'accepted')}
                  >
                    <Text style={styles.requestAcceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.requestDecline}
                    onPress={() => handleFriendResponse(req.id, 'declined')}
                  >
                    <Text style={styles.requestDeclineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.signOutContainer}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Preview modal */}
        {previewUri && (
          <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={() => setPreviewUri(null)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.previewOverlay}
              onPress={() => setPreviewUri(null)}
            >
              <View style={styles.previewCard}>
                <Image source={{ uri: previewUri }} style={styles.previewImage} />
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </ScrollView>
    
      <MedalChooserModal
        visible={medalPickerOpen}
        tempMedals={tempMedalIds}
        tempMedalObjects={tempMedalObjects}
        unlockedMedals={unlockedMedalsDisplay.length ? unlockedMedalsDisplay : unlockedMedals}
        ownedCounts={medalCountsByChallenge}
        onClose={() => setMedalPickerOpen(false)}
        onSave={handleSaveMedals}
        saving={savingMedals}
        canSave={medalChangesPending}
        onToggle={handleToggleMedal}
        onRemove={(id) =>
          setTempMedals((prev) => {
            const next = normalizeTemp(prev as any);
            const idx = next.findIndex((m) => m === id);
            if (idx >= 0) next[idx] = null;
            return next;
          })
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  coverBanner: {
    height: 140,
    borderRadius: 20,
    marginHorizontal: -4,
    marginBottom: -48, // lift profile card over the banner
    opacity: 0.9,
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  signInCard: {
    marginTop: 40,
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#0b1220',
  },
  authScroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  signInTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: 'white',
    marginBottom: 8,
  },
  signInSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 20,
  },
  inputRow: {
    width: '100%',
    gap: 10,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
  },
  smallInput: {
    flex: 1,
  },
  mediumInput: {
    flex: 1.5,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#020617',
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    alignItems: 'center',
    backgroundColor: '#0b1220',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  linkButton: {
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  linkButtonText: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '700',
  },
  resetInfo: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#111827',
  },
  resetInfoText: {
    color: '#e5e7eb',
    fontSize: 12,
    marginBottom: 8,
  },
  resendButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  resendButtonText: {
    color: '#22c55e',
    fontWeight: '700',
    fontSize: 13,
  },
  errorText: {
    marginTop: 12,
    color: '#f87171',
    fontSize: 13,
  },
  profileCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 20,
    // Slight transparency so the banner shows through subtly
    backgroundColor: 'rgba(11, 18, 32, 0.72)',
    marginBottom: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  avatarButton: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    marginRight: 12,
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
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  profileInfoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  email: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  username: {
    fontSize: 13,
    color: '#38bdf8',
  },
  settingsIconButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 6,
  },
  sectionCard: {
    marginTop: 10,
    marginBottom: 8,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  sectionHint: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 10,
  },
  medalTitle: {
    textAlign: 'center',
    width: '100%',
    fontSize: 20,
    marginBottom: 8,
  },
  selectedMedalsRow: {
    flexDirection: 'row',
    gap: 25,
    marginTop: 6,
    marginBottom: 10,
    justifyContent: 'center',
  },
  medalSlot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#1f2937',
    backgroundColor: '#0b1120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalSlotPlus: {
    color: '#6b7280',
    fontSize: 26,
    fontWeight: '800',
  },
  medalIcon: {
    fontSize: 22,
    fontWeight: '900',
  },
  medalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  medalCard: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  medalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  medalCardSource: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
  },
  medalCardLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  medalCardTier: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    flexBasis: '48%',
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#0b1120',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statCardFull: {
    flexBasis: '100%',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  statLabel: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 14,
    color: '#9ca3af',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  viewAll: {
    fontSize: 13,
    color: '#38bdf8',
  },
  loadingText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  levelLabel: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  levelXp: {
    color: '#9ca3af',
    fontWeight: '700',
    fontSize: 12,
  },
  levelBarTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
    overflow: 'hidden',
    marginHorizontal: 10,
    justifyContent: 'center',
  },
  levelBarFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#22c55e',
  },
  levelMeta: {
    marginTop: 4,
    textAlign: 'left',
    paddingLeft: 10,
    color: '#4b5563',
    fontSize: 10,
    fontWeight: '600',
  },
  challengeButtonText: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 13,
  },
  challengeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  challengeModalCard: {
    width: '100%',
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
  challengeModalTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  recentList: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  recentListScroll: {
    maxHeight: 190, // tighter window (~3 items)
    marginBottom: 12,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCard: {
    width: '85%',
    maxWidth: 360,
    backgroundColor: 'transparent',
    padding: 0,
    borderRadius: 16,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    resizeMode: 'contain',
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  runIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 12,
  },
  runTextBlock: {
    flex: 1,
  },
  runDistance: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  runDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  runChevron: {
    fontSize: 20,
    color: '#6b7280',
    marginLeft: 4,
  },
  signOutContainer: {
    marginTop: 32,
    marginBottom: 12,
    alignItems: 'center',
  },
  signOutButton: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButtonText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '700',
  },
  settingsContainer: {
    marginTop: 4,
    marginBottom: 12,
  },
  settingsButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0b1120',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonText: {
    fontSize: 15,
    color: '#e5e7eb',
    fontWeight: '700',
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  requestTextBlock: {
    flex: 1,
    paddingRight: 10,
  },
  requestName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  requestDate: {
    color: '#9ca3af',
    fontSize: 12,
  },
  requestUsername: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
  },
  requestAccept: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#22c55e',
  },
  requestAcceptText: {
    color: '#020617',
    fontWeight: '700',
    fontSize: 12,
  },
  requestDecline: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#ef4444',
  },
  requestDeclineText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12,
  },
  groupList: {
    marginBottom: 14,
    gap: 8,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  groupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  groupName: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  prefixPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
  },
  prefixPillActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  prefixText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 13,
  },
  prefixTextActive: {
    color: '#22c55e',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#0b1120',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 6,
  },
  modalTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  modalTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 20,
    textAlign: 'center',
  },
  modalContent: {
    paddingBottom: 20,
    gap: 10,
  },
});

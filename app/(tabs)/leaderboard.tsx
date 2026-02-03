import Ionicons from '@/components/common/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoogleAuth } from '../../lib/auth';
import { sendFriendRequest, loadFriends } from '../../lib/friendService';
import { loadAllRuns } from '../../lib/runService';
import { loadUserProfile } from '../../lib/authService';
import { useMode } from '../../lib/modeContext';
import { listAllGroups, listGroupRuns } from '../../lib/groupService';
import { computeCurrentAreasFromRuns } from '../../lib/utils/currentAreas';
import { xpFromSources, defaultXPConfig, levelFromTotalXp } from '../../lib/xpProgression';
import { StyledAvatar } from '../../components/common/StyledAvatar';
import { resolveLevelBorderTier, resolveLevelBorderStyleTier } from '../../lib/rewardSelectors';
import type { RewardTier } from '../../lib/rewardsConfig';
import FriendDetailModal from '../../components/modals/FriendDetailModal';
import type { FriendEntry } from '../../types/friends';
import { useFriendProfiles } from '../../hooks/useFriendProfiles';
import { useRenderTrace } from '../../hooks/useRenderTrace';
import { compareRankEntries } from '../../lib/rankingSort';

export type LeaderboardEntry = {
  id: string;
  name: string;
  initials: string;
  avatarUrl?: string | null;
  color: string;
  username?: string;
  isYou?: boolean;
  isMine?: boolean;
  isFriend?: boolean;
  areaKm2: number; // area captured
  distanceKm: number; // total distance
  level?: number;
  borderTier?: RewardTier;
  borderStyleTier?: RewardTier;
};

export default function LeaderboardScreen() {
  const [mode, setMode] = useState<'area' | 'distance'>('area');
  const [filter, setFilter] = useState<'state' | 'country' | 'world'>('world');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [locationByUser, setLocationByUser] = useState<
    Record<string, { stateCode?: string; countryCode?: string }>
  >({});
  const [latestTsByUser, setLatestTsByUser] = useState<Record<string, number>>({});
  const [territoryColor, setTerritoryColor] = useState<string>('#1e90ff');
  const [pendingAdd, setPendingAdd] = useState<LeaderboardEntry | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useGoogleAuth();
  const params = useLocalSearchParams();
  const { mode: appMode, setMode: setAppMode, activeGroupId, groups } = useMode();
  const {
    selectedFriend,
    friendRuns,
    openFriendDetails,
    closeFriend,
    removeFriendFromProfile,
    addFriendFromProfile,
  } = useFriendProfiles({ friends, user, setFriends });

  useRenderTrace({
    screen: 'Leaderboard',
    label: 'LeaderboardScreen',
    props: {
      mode,
      filter,
      entries: entries.length,
      friends: friends.length,
      refreshing,
      appMode,
    },
  });

  const handleSendRequest = async () => {
    if (!pendingAdd || !user?.uid) return;

    // Already a friend?
    const alreadyFriend = friends.some((f) => f.otherUserId === pendingAdd.id);
    if (alreadyFriend) {
      alert(`${pendingAdd.name} is already your friend.`);
      setPendingAdd(null);
      return;
    }

    if (!pendingAdd.username) {
      alert('This player has no username set yet.');
      return;
    }

    try {
      const result = await sendFriendRequest(
        user.uid,
        user.profile?.username,
        pendingAdd.username
      );
      setPendingAdd(null);
      alert(
        result.action === 'cancelled'
          ? `Cancelled request to ${pendingAdd.name}`
          : `Request sent to ${pendingAdd.name}`
      );
    } catch (e: any) {
      alert(e?.message ?? 'Failed to send request.');
    }
  };

  const loadLeaderboard = React.useCallback(async () => {
    try {
      setRefreshing(true);
        // Group mode: show only groups by name; if no groups, show none.
        if (appMode === 'group') {
          const allGroups = await listAllGroups();
          const groupEntries: LeaderboardEntry[] = await Promise.all(
            allGroups.map(async (g) => {
              const runs = await listGroupRuns(g.id);
              const areaMap = computeCurrentAreasFromRuns(runs as any[], {
                mode: 'group',
                activeGroupId: g.id,
              });
              const areaKm2 = areaMap.get(g.id) ?? 0;
              const distanceKm = runs.reduce(
                (s, r) => s + (r.distance ?? 0) / 1000,
                0
              );
              const isMine = groups.some((gg) => gg.id === g.id);
              return {
                id: g.id,
                name: g.name,
                initials: g.name[0]?.toUpperCase() || 'G',
                color: g.color || '#38bdf8',
                areaKm2,
                distanceKm,
                isMine,
              };
            })
          );
          setEntries(groupEntries);
          setLocationByUser({});
          return;
        }

        // Personal/global mode: per-user leaderboard
        if (__DEV__) {
          console.log(`[RUNS_CALLSITE] file=app/(tabs)/leaderboard.tsx fn=loadLeaderboard reason=personal/global leaderboard ts=${Date.now()}`);
        }
        const runs = await loadAllRuns();
        const youHasRuns = runs.some((run: any) => run.userId === user?.uid);
        const areaMap = computeCurrentAreasFromRuns(runs as any[], { mode: 'personal', activeGroupId: null });
        const aggregates = new Map<string, { areaKm2: number; distanceKm: number }>();
        const latestLocationByUser: Record<string, { stateCode?: string; countryCode?: string }> = {};
        const latestTsByUser: Record<string, number> = {};

        runs.forEach((run: any) => {
          const uid = run.userId || 'unknown';
          const agg = aggregates.get(uid) ?? { areaKm2: 0, distanceKm: 0 };
          agg.distanceKm += (run.distance ?? 0) / 1000;
          aggregates.set(uid, agg);

          const stateCode = (run.stateCode ?? run.stateName ?? '').toString().trim();
          const countryCode = (run.countryCode ?? '').toString().trim();
          if (!stateCode && !countryCode) return;

          const ts = run.createdAt ?? Date.parse(run.startedAt ?? '') ?? 0;
          const prevTs = latestTsByUser[uid] ?? -1;
          if (ts >= prevTs) {
            latestTsByUser[uid] = ts;
            latestLocationByUser[uid] = {
              stateCode,
              countryCode,
            };
          }
        });

        // Limit profile fetch to top performers + you/friends to speed up load.
        const topArea = Array.from(aggregates.entries())
          .sort((a, b) => (b[1].areaKm2 ?? 0) - (a[1].areaKm2 ?? 0))
          .slice(0, 50)
          .map(([uid]) => uid);
        const topDistance = Array.from(aggregates.entries())
          .sort((a, b) => (b[1].distanceKm ?? 0) - (a[1].distanceKm ?? 0))
          .slice(0, 50)
          .map(([uid]) => uid);
        const friendIds = friends.map((f) => f.otherUserId ?? f.id).filter(Boolean) as string[];
        const idsToInclude = new Set<string>([
          ...topArea,
          ...topDistance,
          ...(user?.uid ? [user.uid] : []),
          ...friendIds,
        ]);

        const profiles = await Promise.all(
          Array.from(idsToInclude).map(async (uid) => {
            const profile = await loadUserProfile(uid);
            return {
              uid,
              profile,
              level: (profile as any)?.level ?? undefined,
            };
          })
        );

        const combined: LeaderboardEntry[] = Array.from(idsToInclude).map((uid) => {
          const agg = aggregates.get(uid) ?? { areaKm2: 0, distanceKm: 0 };
          const profEntry = profiles.find((p) => p.uid === uid);
          const profile = profEntry?.profile;
          const name = profile?.displayName || profile?.email || `User ${uid.slice(0, 6)}`;
          const initials =
            profile?.displayName
              ?.split(' ')
              ?.map((p) => p[0])
              ?.join('')
              ?.toUpperCase() || (profile?.email ? profile.email[0]?.toUpperCase() : 'U');
          const color = profile?.territoryColor || '#38bdf8';
          const level = (() => {
            const computedXp = xpFromSources(
              {
                distanceKm: agg.distanceKm,
                territoryKm2: areaMap.get(uid) ?? 0,
                challengeXp: profile?.monthlyChallenges?.totalChallengeXp ?? 0,
              },
              defaultXPConfig
            );
            const totalXp = Math.max(profile?.lifetimeXp ?? 0, computedXp);
            return levelFromTotalXp(totalXp, defaultXPConfig).level;
          })();
          const borderTier = resolveLevelBorderTier(level ?? 1, profile as any);
          const borderStyleTier = resolveLevelBorderStyleTier(level ?? 1, profile as any);
          return {
            id: uid,
            name,
            initials: initials || 'U',
            avatarUrl: profile?.avatarUrl,
            username: profile?.username,
            color,
            isYou: uid === user?.uid,
            isFriend: friends.some((f) => f.otherUserId === uid || f.id === uid),
            areaKm2: areaMap.get(uid) ?? 0,
            distanceKm: agg.distanceKm,
            level,
            borderTier,
            borderStyleTier,
          };
        });

        // Ensure current user is present even with zero runs
        if (user?.uid && !aggregates.has(user.uid) && !youHasRuns) {
          const computedXp = xpFromSources(
            {
              distanceKm: 0,
              territoryKm2: 0,
              challengeXp: user?.profile?.monthlyChallenges?.totalChallengeXp ?? 0,
            },
            defaultXPConfig
          );
          const totalXp = Math.max(user?.profile?.lifetimeXp ?? 0, computedXp);
          const level = levelFromTotalXp(totalXp, defaultXPConfig).level;
          combined.push({
            id: user.uid,
            name: user?.email || 'You',
            initials: (user?.email?.[0] || 'Y').toUpperCase(),
            avatarUrl: user?.profile?.avatarUrl,
            color: user?.profile?.territoryColor || '#38bdf8',
            isYou: true,
            areaKm2: 0,
            distanceKm: 0,
            level,
            borderTier: resolveLevelBorderTier(level, user?.profile as any),
            borderStyleTier: resolveLevelBorderStyleTier(level, user?.profile as any),
          });
        }

        setEntries(combined);
        setLocationByUser(latestLocationByUser);
        setLatestTsByUser(latestTsByUser);
        if (user?.profile?.territoryColor) {
          setTerritoryColor(user.profile.territoryColor);
        }
    } catch (e) {
      console.log('Failed to load leaderboard', e);
    } finally {
      setRefreshing(false);
    }
  }, [activeGroupId, appMode, friends, groups, user?.email, user?.profile, user?.profile?.monthlyChallenges?.totalChallengeXp, user?.profile?.territoryColor, user?.uid]);

  const loadLeaderboardRef = React.useRef(loadLeaderboard);
  useEffect(() => {
    loadLeaderboardRef.current = loadLeaderboard;
  }, [loadLeaderboard]);

  useEffect(() => {
    void loadLeaderboardRef.current();
  }, [appMode, mode]);

  useEffect(() => {
    const loadFriendsList = async () => {
      if (!user?.uid) {
        setFriends([]);
        return;
      }
      try {
        const accepted = await loadFriends(user.uid);
        setFriends(
          accepted.map((f: { id: string; otherUserId: string; otherUsername?: string; areaKm2?: number; distanceKm?: number }) => ({
            id: f.id,
            otherUserId: f.otherUserId,
            otherUsername: f.otherUsername,
            areaKm2: f.areaKm2,
            distanceKm: f.distanceKm,
            isFriend: true,
          }))
        );
      } catch (e) {
        console.log('Failed to load friends for leaderboard', e);
        setFriends([]);
      }
    };
    loadFriendsList();
  }, [user?.uid]);

  // Honor incoming focus param (from rank pills)
  useEffect(() => {
    const focusParam = Array.isArray(params.focus)
      ? params.focus[0]
      : params.focus;
    if (focusParam === 'distance') setMode('distance');
    else if (focusParam === 'area') setMode('area');
  }, [params.focus]);

  const sortedEntries = useMemo(() => {
    const key: 'areaKm2' | 'distanceKm' =
      mode === 'area' ? 'areaKm2' : 'distanceKm';
    const userLocation = user?.uid ? locationByUser[user.uid] : undefined;
    const normalizeState = (value?: string) => (value ?? '').trim().toLowerCase();
    const normalizeCountry = (value?: string) => (value ?? '').trim().toUpperCase();
    const userState = normalizeState(userLocation?.stateCode);
    const userCountry = normalizeCountry(userLocation?.countryCode);

    const filtered = [...entries].filter((entry) => {
      if (appMode === 'group' || filter === 'world') return true;
      const entryLoc = locationByUser[entry.id];
      if (filter === 'state') {
        if (!userState) return false;
        return normalizeState(entryLoc?.stateCode) === userState;
      }
      if (filter === 'country') {
        if (!userCountry) return false;
        return normalizeCountry(entryLoc?.countryCode) === userCountry;
      }
      return true;
    });

    const copy = filtered.map((e) => ({
      ...e,
      areaKm2: e.areaKm2 ?? 0,
      distanceKm: e.distanceKm ?? 0,
    }));
    copy.sort((a, b) =>
      compareRankEntries(
        {
          userId: a.id,
          distanceMeters:
            key === 'distanceKm' ? (a[key] ?? 0) * 1000 : (a[key] ?? 0),
          lastActivityAtMs: Number.isFinite(latestTsByUser[a.id])
            ? latestTsByUser[a.id]
            : Number.MAX_SAFE_INTEGER,
        },
        {
          userId: b.id,
          distanceMeters:
            key === 'distanceKm' ? (b[key] ?? 0) * 1000 : (b[key] ?? 0),
          lastActivityAtMs: Number.isFinite(latestTsByUser[b.id])
            ? latestTsByUser[b.id]
            : Number.MAX_SAFE_INTEGER,
        }
      )
    );
    return copy;
  }, [appMode, entries, filter, latestTsByUser, locationByUser, mode, user?.uid]);

  const you = sortedEntries.find((e) => e.isYou) ?? sortedEntries[0];
  const yourValue = you ? (mode === 'area' ? you.areaKm2 : you.distanceKm) : 0;
  const youHasRuns =
    (you && (you.areaKm2 > 0 || you.distanceKm > 0)) ||
    false;
  const unit = mode === 'area' ? 'km²' : 'km';
  const headerSubtitle =
    appMode === 'group'
      ? `Group ${mode === 'area' ? 'territory' : 'distance'} leaderboard`
      : mode === 'area'
        ? 'Compete for territory dominance'
        : 'Rack up distance and climb the ranks';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {filterMenuOpen && (
        <Pressable
          style={styles.filterBackdrop}
          onPress={() => setFilterMenuOpen(false)}
        />
      )}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadLeaderboard();
            }}
            tintColor="#e5e7eb"
          />
        }
      >
        <View style={styles.headerBlock}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={styles.heroTitle}>Leaderboard</Text>
                <Ionicons name="trophy" size={32} color="#fbbf24" />
              </View>
              <Text style={styles.heroSubtitle}>{headerSubtitle}</Text>
            </View>
            <View style={styles.modeSwitchRow}>
              <Pressable
                onPress={() => setAppMode(appMode === 'group' ? 'personal' : 'group')}
                style={styles.modeToggleTrack}
              >
                <View
                  style={[
                    styles.modeToggleThumb,
                    appMode === 'group' ? styles.modeThumbRight : styles.modeThumbLeft,
                  ]}
                >
                  <Ionicons
                    name={appMode === 'group' ? 'people-outline' : 'person-outline'}
                    size={18}
                    color="#0b1120"
                  />
                </View>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Toggle pills */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              mode === 'area' && styles.toggleButtonActive,
            ]}
            onPress={() => setMode('area')}
          >
            <Ionicons
              name="map-outline"
              size={16}
              color={mode === 'area' ? '#020617' : '#e5e7eb'}
            />
            <Text
              style={[
                styles.toggleText,
                mode === 'area' && styles.toggleTextActive,
              ]}
            >
              Area captured
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleButton,
              mode === 'distance' && styles.toggleButtonActive,
            ]}
            onPress={() => setMode('distance')}
          >
            <Ionicons
              name="footsteps-outline"
              size={16}
              color={mode === 'distance' ? '#020617' : '#e5e7eb'}
            />
            <Text
              style={[
                styles.toggleText,
                mode === 'distance' && styles.toggleTextActive,
              ]}
            >
              Total distance
            </Text>
          </TouchableOpacity>
        </View>

        {/* Your rank card (hide in group mode) */}
        {appMode !== 'group' && you ? (
          <View style={[styles.yourRankCard, { borderColor: territoryColor }]}>
            <View style={styles.yourRankLeft}>
              <StyledAvatar
                name={you.name}
                uri={you.avatarUrl ?? user?.profile?.avatarUrl}
                size={52}
                tier={you.borderTier ?? resolveLevelBorderTier(you.level ?? 1, user?.profile as any)}
                styleTier={
                  you.borderStyleTier ??
                  resolveLevelBorderStyleTier(you.level ?? 1, user?.profile as any)
                }
              />
              <View style={styles.yourRankMeta}>
                <Text style={styles.yourRankLabel}>Your rank</Text>
                <Text style={styles.yourRankPosition}>
                  #
                  {youHasRuns
                    ? sortedEntries.findIndex((e) => e.id === you.id) + 1
                    : 0}
                </Text>
                {you.level ? (
                  <Text style={styles.levelLabel}>Level {you.level}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.yourRankRight}>
              <Text style={[styles.yourRankValue, { color: territoryColor }]}>
                {yourValue.toFixed(2)} {unit}
              </Text>
              <Text style={styles.yourRankValueLabel}>
                {mode === 'area' ? 'captured' : 'total'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* List */}
        <View style={styles.listContainer}>
          {sortedEntries
            .filter((entry) => entry.areaKm2 > 0 || entry.distanceKm > 0)
            .map((entry, index) => {
            const rank = index + 1;
            const rankColor =
              rank === 1
                ? '#fbbf24' // gold
                : rank === 2
                  ? '#d1d5db' // silver
                  : rank === 3
                    ? '#f97316' // bronze
                    : '#e5e7eb'; // white

            return (
              <TouchableOpacity
                key={entry.id}
                style={[
                  styles.listRow,
                  entry.isMine && [
                    styles.listRowHighlighted,
                    { borderColor: entry.color || territoryColor },
                  ],
                ]}
                onPress={() => {
                  if (!entry.isYou) {
                    if (entry.isFriend) {
                      openFriendDetails({
                        id: entry.id,
                        otherUserId: entry.id,
                        otherUsername: entry.username,
                        displayName: entry.name,
                        avatarUrl: entry.avatarUrl ?? undefined,
                        territoryColor: entry.color,
                        areaKm2: entry.areaKm2,
                        distanceKm: entry.distanceKm,
                        isFriend: true,
                      });
                    } else if (entry.username) {
                      setPendingAdd(entry);
                    }
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.listLeft}>
                  <Text
                    style={[
                      styles.entryRankNumber,
                      { color: rankColor },
                    ]}
                  >
                    #{rank}
                  </Text>
                  <StyledAvatar
                    name={entry.name}
                    uri={entry.avatarUrl ?? undefined}
                    size={44}
                    tier={
                      entry.borderTier ??
                      resolveLevelBorderTier(entry.level ?? 1, entry.isYou ? (user?.profile as any) : null)
                    }
                    styleTier={
                      entry.borderStyleTier ??
                      resolveLevelBorderStyleTier(entry.level ?? 1, entry.isYou ? (user?.profile as any) : null)
                    }
                  />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.entryName}>{entry.name}</Text>
                    <View style={styles.entrySubRow}>
                      {entry.level ? (
                        <Text style={styles.entryLevel}>Level {entry.level}</Text>
                      ) : null}
                      {entry.isMine && (
                        <View
                          style={[
                            styles.youPill,
                            { backgroundColor: entry.color || territoryColor },
                          ]}
                        >
                          <Text style={styles.youPillText}>My group</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.listRight}>
                  <Text style={styles.entryMetric}>
                    {mode === 'area'
                      ? `${(entry.areaKm2 ?? 0).toFixed(2)} km²`
                      : `${(entry.distanceKm ?? 0).toFixed(2)} km`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Modal
          visible={!!pendingAdd}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingAdd(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add friend</Text>
              <Text style={styles.modalSubtitle}>
                Send a request to {pendingAdd?.name}
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirm]}
                  onPress={handleSendRequest}
                >
                  <Text style={styles.modalConfirmText}>Send</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancel]}
                  onPress={() => setPendingAdd(null)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <FriendDetailModal
          visible={!!selectedFriend}
          friend={selectedFriend}
          runs={friendRuns}
          onClose={closeFriend}
          onOpenRunDetail={(id) => {
            closeFriend();
            // Reuse navigation pattern from other screens
            // We only need id; parent handles navigation elsewhere if desired.
          }}
          onRemoveFriend={removeFriendFromProfile}
          onAddFriend={addFriendFromProfile}
          isFriend={!!selectedFriend?.isFriend}
        />
      </ScrollView>

      <View style={styles.filterFabWrap}>
        {filterMenuOpen && (
          <View style={styles.filterMenu}>
            {([
              { id: 'state', label: 'State' },
              { id: 'country', label: 'Country' },
              { id: 'world', label: 'World' },
            ] as const).map((option) => {
              const active = filter === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[
                    styles.filterMenuItem,
                    active && styles.filterMenuItemActive,
                  ]}
                  onPress={() => {
                    setFilter(option.id);
                    setFilterMenuOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.filterMenuText,
                      active && styles.filterMenuTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark" size={16} color="#22c55e" />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable
          style={styles.filterFab}
          onPress={() => setFilterMenuOpen((prev) => !prev)}
        >
          <Ionicons name="menu" size={20} color="#020617" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // almost-black navy
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 96,
  },
  headerBlock: {
    marginBottom: 16,
    alignItems: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    textAlign: 'left',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'left',
    marginTop: 4,
    marginBottom: 12,
  },
  modeSwitchRow: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  modeToggleTrack: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 86,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  modeToggleThumb: {
    position: 'absolute',
    top: 4,
    width: 40,
    height: 30,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeThumbLeft: {
    left: 4,
  },
  modeThumbRight: {
    right: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#020617',
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleButtonActive: {
    backgroundColor: '#22c55e',
  },
  toggleText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
  toggleTextActive: {
    color: '#020617',
    fontWeight: '700',
  },
  yourRankCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#020617',
    borderWidth: 1,
    marginBottom: 16,
  },
  yourRankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yourRankMeta: {
    marginLeft: 12,
    gap: 2,
  },
  yourRankLabel: {
    color: '#9ca3af',
    fontSize: 12,
  },
  yourRankPosition: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
  },
  yourRankRight: {
    alignItems: 'flex-end',
  },
  yourRankValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  yourRankValueLabel: {
    color: '#9ca3af',
    fontSize: 12,
  },
  levelLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    marginTop: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
    marginBottom: 10,
  },
  listRowHighlighted: {
    backgroundColor: '#0b1120',
  },
  listLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarInitial: {
    color: 'white',
    fontWeight: '700',
  },
  entryName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  entrySubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  entryLevel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  entryMetric: {
    color: '#9ca3af',
    fontSize: 18,
    fontWeight: '800',
  },
  entryRankNumber: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '800',
    marginRight: 10,
  },
  youPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 8,
  },
  youPillText: {
    color: '#e5e7eb',
    fontSize: 11,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '80%',
    backgroundColor: '#0b1120',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#111827',
  },
  modalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 14,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirm: {
    backgroundColor: '#22c55e',
  },
  modalCancel: {
    backgroundColor: '#1f2937',
  },
  modalConfirmText: {
    color: '#020617',
    fontWeight: '800',
  },
  modalCancelText: {
    color: '#e5e7eb',
    fontWeight: '700',
  },
  filterBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 10,
  },
  filterFabWrap: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterMenu: {
    backgroundColor: '#0b1120',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#111827',
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  filterMenuItemActive: {
    backgroundColor: '#111827',
  },
  filterMenuText: {
    color: '#e5e7eb',
    fontWeight: '600',
    fontSize: 13,
  },
  filterMenuTextActive: {
    color: '#22c55e',
    fontWeight: '800',
  },
  filterFab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#22c55e',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});

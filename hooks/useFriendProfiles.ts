import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseConfig';
import { loadAllRuns, loadRunsForUser } from '../lib/runService';
import { removeFriend, sendFriendRequest } from '../lib/friendService';
import { FriendEntry } from '../types/friends';
import { computeCurrentAreasFromRuns } from '../lib/utils/currentAreas';

type RunSummary = {
  id: string;
  seq?: number;
  distance: number; // meters
  elapsedSeconds: number; // seconds
  startedAt: string; // ISO date string
  route: Array<{ latitude: number; longitude: number }>;
  areaKm2?: number;
  createdAt?: number;
};

type Params = {
  friends: FriendEntry[];
  user: { uid?: string; profile?: any } | null | undefined;
  setFriends: React.Dispatch<React.SetStateAction<FriendEntry[]>>;
};

export function useFriendProfiles({ friends, user, setFriends }: Params) {
  const [selectedFriend, setSelectedFriend] = useState<FriendEntry | null>(null);
  const [friendRuns, setFriendRuns] = useState<RunSummary[]>([]);
  const [removingFriend, setRemovingFriend] = useState(false);

  const closeFriend = useCallback(() => {
    setSelectedFriend(null);
    setFriendRuns([]);
  }, []);

  const openFriendDetails = useCallback(
    async (friend: FriendEntry) => {
      const isFriend = friends.some((f) => f.otherUserId === friend.otherUserId);
      // Show immediately with what we have, then hydrate
      setSelectedFriend({ ...friend, isFriend });
      setFriendRuns([]);
      try {
        const snap = await getDoc(doc(db, 'users', friend.otherUserId));
        const data = snap.exists() ? (snap.data() as any) : {};
        const profileFriend = {
          ...friend,
          displayName: data.displayName ?? friend.displayName,
          avatarUrl: data.avatarUrl ?? friend.avatarUrl,
          bannerUrl: data.bannerUrl ?? friend.bannerUrl,
          territoryColor: data.territoryColor ?? friend.territoryColor,
          otherUsername: friend.otherUsername ?? data.username ?? data.displayName ?? data.email,
          isFriend,
        };
        setSelectedFriend(profileFriend);

        // Load last 3 runs for this friend
        if (__DEV__) {
          console.log(`[RUNS_CALLSITE] file=hooks/useFriendProfiles.ts fn=openFriendDetails reason=friendRecentRuns ts=${Date.now()}`);
        }
        const runs = await loadRunsForUser(friend.otherUserId);
        const ordered = [...runs].sort(
          (a, b) =>
            (b.createdAt ?? new Date(b.startedAt).getTime()) -
            (a.createdAt ?? new Date(a.startedAt).getTime())
        );
        setFriendRuns(ordered.slice(0, 3) as any);

        // Current territory area (not lifetime): rebuild from territory runs.
        try {
          if (__DEV__) {
            console.log(`[RUNS_CALLSITE] file=hooks/useFriendProfiles.ts fn=openFriendDetails reason=friendAreaFromAllRuns ts=${Date.now()}`);
          }
          const allRuns = await loadAllRuns();
          const areaMap = computeCurrentAreasFromRuns(allRuns as any[], { mode: 'personal', activeGroupId: null });
          const currentArea = areaMap.get(friend.otherUserId) ?? undefined;
          if (currentArea !== undefined) {
            setSelectedFriend((prev) =>
              prev ? { ...prev, areaKm2: currentArea } : prev
            );
          }
        } catch {
          // ignore area failures; keep existing data
        }
      } catch (e) {
        console.log('Failed to load friend profile', e);
        setSelectedFriend(friend);
      }
    },
    [friends]
  );

  const removeFriendFromProfile = useCallback(async () => {
    if (!selectedFriend || !user?.uid) return;
    try {
      setRemovingFriend(true);
      await removeFriend(user.uid, selectedFriend.otherUserId);
      setFriends((prev) =>
        prev.filter((f) => f.otherUserId !== selectedFriend.otherUserId)
      );
      closeFriend();
    } catch (e) {
      Alert.alert('Error', 'Could not remove friend. Try again.');
    } finally {
      setRemovingFriend(false);
    }
  }, [selectedFriend, user?.uid, setFriends, closeFriend]);

  const addFriendFromProfile = useCallback(async () => {
    if (!selectedFriend || !user?.uid) return;
    let targetUsername = selectedFriend.otherUsername;
    if (!targetUsername) {
      try {
        const snap = await getDoc(doc(db, 'users', selectedFriend.otherUserId));
        if (snap.exists()) {
          const data = snap.data() as any;
          targetUsername = data.username || data.displayName || data.email || undefined;
          setSelectedFriend((prev) =>
            prev ? { ...prev, otherUsername: targetUsername } : prev
          );
        }
      } catch {
        // ignore; will handle below
      }
    }
    if (!targetUsername) {
      Alert.alert('Unavailable', 'Cannot add this player right now.');
      return;
    }
    try {
      setRemovingFriend(true);
      await sendFriendRequest(user.uid, user?.profile?.username, targetUsername);
      Alert.alert('Request sent', `Friend request sent to @${targetUsername}.`);
      setSelectedFriend((prev) =>
        prev ? { ...prev, isFriend: true } : prev
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send request.');
    } finally {
      setRemovingFriend(false);
    }
  }, [selectedFriend, user?.uid, user?.profile?.username]);

  return {
    selectedFriend,
    friendRuns,
    removingFriend,
    openFriendDetails,
    closeFriend,
    removeFriendFromProfile,
    addFriendFromProfile,
  };
}

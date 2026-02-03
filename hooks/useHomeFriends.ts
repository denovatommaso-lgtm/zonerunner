import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { hydrateFriendProfiles, loadFriends, sendFriendRequest } from '../lib/friendService';
import type { FriendEntry } from '../types/friends';

export function useHomeFriends(params: {
  userId?: string;
  userUsername?: string;
  leaderboardById: Map<string, { areaKm2: number; distanceKm: number }>;
}) {
  const { userId, userUsername, leaderboardById } = params;

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendUsername, setFriendUsername] = useState('');
  const [showAllFriends, setShowAllFriends] = useState(false);

  const handleAddFriend = useCallback(async () => {
    const uname = friendUsername.trim();
    if (!uname) {
      Alert.alert('Username required', 'Enter a username to send a request.');
      return;
    }
    try {
      if (!userId) {
        Alert.alert('Sign in required', 'Sign in to send friend requests.');
        return;
      }
      const result = await sendFriendRequest(userId, userUsername, uname);
      setFriendUsername('');
      setShowAddFriend(false);
      if (result.action === 'cancelled') {
        Alert.alert('Request cancelled', `Cancelled your request to @${uname}`);
      } else {
        Alert.alert('Request sent', `Friend request sent to @${uname}`);
      }
    } catch (e) {
      console.log('Failed to add friend request', e);
      Alert.alert('Error', (e as any)?.message ?? 'Could not send request. Try again.');
    }
  }, [friendUsername, userId, userUsername]);

  const loadFriendsList = useCallback(async () => {
    try {
      if (!userId) {
        setFriends([]);
        return;
      }
      const accepted = await loadFriends(userId);
      const hydrated = await hydrateFriendProfiles(accepted);
      const normalized = hydrated.map((f) => {
        const boardEntry = leaderboardById.get(f.otherUserId);
        return {
          id: f.id,
          otherUserId: f.otherUserId,
          otherUsername: f.otherUsername,
          displayName: f.displayName,
          createdAt: f.createdAt,
          territoryColor: f.territoryColor,
          areaKm2: boardEntry?.areaKm2 ?? f.areaKm2 ?? 0,
          distanceKm: boardEntry?.distanceKm ?? f.distanceKm ?? 0,
          avatarUrl: f.avatarUrl,
          bannerUrl: f.bannerUrl,
          isFriend: true,
          selectedMedals: f.selectedMedals ?? [],
        } satisfies FriendEntry;
      });
      normalized.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
      setFriends(normalized);
    } catch (e) {
      console.log('Failed to load friends', e);
      // keep previous friends to avoid flicker on transient errors
    }
  }, [leaderboardById, userId]);

  return {
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
  };
}

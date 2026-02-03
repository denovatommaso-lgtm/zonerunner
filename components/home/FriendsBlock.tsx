import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FriendEntry } from '../../types/friends';
import { FriendsSection } from './FriendsSection';

type Props = {
  friends: FriendEntry[];
  showAllFriends: boolean;
  showAddFriend: boolean;
  friendUsername: string;
  accentColor: string;
  onChangeFriendUsername: (v: string) => void;
  onAddFriendPress: () => void;
  onSubmitFriend: () => void;
  onCancelAddFriend: () => void;
  onFriendPress: (friend: FriendEntry) => void;
  onToggleShowAll: () => void;
};

function FriendsBlockComponent({
  friends,
  showAllFriends,
  showAddFriend,
  friendUsername,
  accentColor,
  onChangeFriendUsername,
  onAddFriendPress,
  onSubmitFriend,
  onCancelAddFriend,
  onFriendPress,
  onToggleShowAll,
}: Props) {
  const visibleFriends = showAllFriends ? friends : friends.slice(0, 4);
  return (
    <View>
      <FriendsSection
        friends={visibleFriends}
        showAddFriend={showAddFriend}
        friendUsername={friendUsername}
        onChangeFriendUsername={onChangeFriendUsername}
        onAddFriendPress={onAddFriendPress}
        onSubmitFriend={onSubmitFriend}
        onCancelAddFriend={onCancelAddFriend}
        onFriendPress={onFriendPress}
        accentColor={accentColor}
      />
      {friends.length > 4 ? (
        <TouchableOpacity style={styles.toggle} onPress={onToggleShowAll}>
          <Text style={styles.toggleText}>{showAllFriends ? 'Show less' : 'Show more'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const FriendsBlock = React.memo(FriendsBlockComponent);

const styles = StyleSheet.create({
  toggle: { marginTop: 12, paddingHorizontal: 4, marginBottom: 8 },
  toggleText: { color: '#94a3b8', fontWeight: '700' },
});

export default FriendsBlock;

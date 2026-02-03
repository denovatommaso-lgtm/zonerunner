import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  territoryColor: string;
  avatarUri?: string;
  displayInitial: string;
  onPressAvatar: () => void;
};

function HomeHeaderComponent({ territoryColor, avatarUri, displayInitial, onPressAvatar }: Props) {
  return (
    <View style={styles.headerRow}>
      <View>
        <Text style={styles.appName}>ZoneRunner</Text>
        <Text style={styles.tagline}>Conquer the real world, one run at a time.</Text>
      </View>

      <TouchableOpacity
        style={[styles.avatarButton, { borderColor: territoryColor }]}
        onPress={onPressAvatar}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{displayInitial}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

export const HomeHeader = React.memo(HomeHeaderComponent);

const styles = StyleSheet.create({
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
});

export default HomeHeader;

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { OSM_ATTRIBUTION } from '../../lib/maps/osm';

type Props = {
  style?: ViewStyle;
};

export default function OsmAttribution({ style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>{OSM_ATTRIBUTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(30, 41, 59, 0.6)',
  },
  text: {
    color: '#e2e8f0',
    fontSize: 9,
    letterSpacing: 0.2,
  },
});

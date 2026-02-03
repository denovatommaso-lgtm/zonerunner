import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  areaRank: number;
  distanceRank: number;
  areaColor: string;
  distanceColor: string;
  onPressArea: () => void;
  onPressDistance: () => void;
};

export function RankPills({
  areaRank,
  distanceRank,
  areaColor,
  distanceColor,
  onPressArea,
  onPressDistance,
}: Props) {
  const areaLabel = areaRank > 0 ? `#${areaRank}` : '—';
  const distanceLabel = distanceRank > 0 ? `#${distanceRank}` : '—';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.pill, { borderColor: areaColor }]}
          onPress={onPressArea}
        >
          <Text style={[styles.pillLabel, { color: areaColor }]}>Area rank</Text>
          <Text style={[styles.pillValue, { color: areaColor }]}>{areaLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.pill, { borderColor: distanceColor }]}
          onPress={onPressDistance}
        >
          <Text style={[styles.pillLabel, { color: distanceColor }]}>Distance rank</Text>
          <Text style={[styles.pillValue, { color: distanceColor }]}>{distanceLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 6,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  pill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#0f172a',
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e5e7eb',
    marginBottom: 6,
    textAlign: 'center',
  },
  pillValue: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
  },
});

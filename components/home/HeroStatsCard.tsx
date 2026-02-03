import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  mode: 'personal' | 'group';
  stats: {
    totalAreaKm2?: number;
    totalDistanceMeters?: number;
    totalTimeSeconds?: number;
  };
  myGroupStats?: { distanceKm?: number; areaKm2?: number };
  formatDistance: (meters: number) => string;
  formatTime: (seconds: number) => string;
};

export function HeroStatsCard({ mode, stats, myGroupStats, formatDistance, formatTime }: Props) {
  const totalAreaKm2 = stats.totalAreaKm2 ?? 0;
  const totalDistanceMeters = stats.totalDistanceMeters ?? 0;
  const totalTimeSeconds = stats.totalTimeSeconds ?? 0;
  const myArea = myGroupStats?.areaKm2 ?? 0;
  const myDistance = myGroupStats?.distanceKm ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Territory overview</Text>
      </View>

      <Text style={styles.subtitle}>
        {mode === 'group'
          ? 'Group territory and progress'
          : 'Your territory, distance and time across all runs.'}
      </Text>
      <View style={styles.divider} />
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>
            {mode === 'group' ? 'Group area' : 'Area captured'}
          </Text>
          <Text style={styles.statValue}>
            {totalAreaKm2.toFixed(2)} km²
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>
            {mode === 'group' ? 'Group distance' : 'Distance'}
          </Text>
          <Text style={styles.statValue}>
            {formatDistance(totalDistanceMeters)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>
            {formatTime(totalTimeSeconds)}
          </Text>
        </View>
      </View>
      {mode === 'group' && myGroupStats && (
        <Text style={styles.contributionText}>
          My contribution: {myDistance.toFixed(2)} km · {myArea.toFixed(2)} km²
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#0b1220',
    borderWidth: 1.5,
    borderColor: '#111827',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  divider: {
    marginTop: 10,
    marginBottom: 12,
    height: 1,
    backgroundColor: '#111827',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    gap: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  contributionText: {
    marginTop: 10,
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
  },
});

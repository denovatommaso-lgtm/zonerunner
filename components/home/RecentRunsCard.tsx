import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet, ViewStyle } from 'react-native';
import { formatDistance, formatDate } from '../../lib/utils/format';
import type { RunDoc } from '../../lib/runService';

type Props = {
  loading: boolean;
  runs: RunDoc[];
  onPressRun: (id: string) => void;
  onPressViewAll?: () => void;
  accentColor?: string;
  style?: ViewStyle;
};

export function RecentRunsCard({
  loading,
  runs,
  onPressRun,
  onPressViewAll,
  accentColor = '#38bdf8',
  style,
}: Props) {
  const lastRun = runs[0];
  const showLoading = loading && runs.length === 0;

  return (
    <View style={style}>
      <View style={styles.row}>
        <Text style={styles.sectionTitle}>Recent runs</Text>
        {onPressViewAll ? (
          <TouchableOpacity onPress={onPressViewAll}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {showLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#e5e7eb" />
          <Text style={styles.loadingText}>Loading your runs…</Text>
        </View>
      ) : !lastRun ? (
        <Text style={styles.emptyText}>
          No runs yet. Start your first run from the Map tab.
        </Text>
      ) : (
        <TouchableOpacity
          style={styles.lastRunCard}
          onPress={() => lastRun.id && onPressRun(lastRun.id)}
        >
          <View
            style={[
              styles.lastRunIcon,
              { backgroundColor: accentColor },
            ]}
          />
          <View style={styles.lastRunTextBlock}>
            <Text style={styles.lastRunDistance}>
              {formatDistance(lastRun.distance)}
            </Text>
            <Text style={styles.lastRunDate}>
              {formatDate(lastRun.startedAt)}
            </Text>
          </View>
          <Text style={styles.lastRunChevron}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 6,
  },
  lastRunCard: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lastRunIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  lastRunTextBlock: {
    flex: 1,
  },
  lastRunDistance: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  lastRunDate: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  lastRunChevron: {
    color: '#6b7280',
    fontSize: 20,
  },
  viewAll: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
});

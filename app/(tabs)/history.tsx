import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@/components/common/Ionicons';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useGoogleAuth } from '../../lib/auth';
import { deleteRun, type RunDoc } from '../../lib/runService';
import { formatDistance, formatDate } from '../../lib/utils/format';
import { formatElapsed, formatPace } from '../../lib/utils/runMetrics';
import { useRunsContext } from '../../hooks/useRunsContext';
import { BackButton } from '../../components/common/BackButton';

export default function HistoryScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useGoogleAuth();
  const { runs, loading, reload } = useRunsContext({ mode: 'personal', userId: user?.uid });
  const accentColor = user?.profile?.territoryColor ?? '#1e90ff';

  const handleDeleteRun = useCallback(
    async (id: string) => {
      try {
        await deleteRun(id);
        reload({ force: true });
      } catch (e) {
        console.log('Failed to delete run from history', e);
      }
    },
    [reload]
  );

  const sortedRuns = useMemo(
    () => [...runs].sort((a: RunDoc, b: RunDoc) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [runs]
  );

  const renderItem = ({ item }: { item: RunDoc }) => {
    const distanceLabel = formatDistance(item.distance);
    const timeText = formatElapsed(item.elapsedSeconds);
    const pace = formatPace(item.distance, item.elapsedSeconds);
    const areaLabel = `${(item.areaKm2 ?? 0).toFixed(2)} km²`;
    const dateLabel = formatDate(item.startedAt);
    const started = new Date(item.startedAt);
    const timeOfDay = started.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });

    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.swipeDelete}
        onPress={() => {
          if (!item.id) return;
          Alert.alert(
            'Delete run',
            'Are you sure you want to delete this run?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => handleDeleteRun(item.id!),
              },
            ]
          );
        }}
      >
        <Ionicons name="trash-outline" size={22} color="white" />
      </TouchableOpacity>
    );

    return (
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        <TouchableOpacity
          style={[
            styles.runCard,
            { borderColor: 'transparent', shadowColor: '#000' },
          ]}
          onPress={() =>
            router.push({
              pathname: '/run-detail',
              params: { id: (item.id ?? '').toString() },
            })
          }
        >
          <View style={styles.runRow}>
            <View style={styles.runLeftBlock}>
              <Text style={styles.runDistanceBig}>{distanceLabel}</Text>
              <Text style={styles.runPace}>Pace {pace}</Text>
            </View>

            <View style={styles.runRightBlock}>
              <Text style={styles.runTime}>{timeText}</Text>
              <Text style={styles.runDate}>
                {dateLabel} · {timeOfDay}
              </Text>
            </View>
          </View>

          <View style={styles.runFooterRow}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Text
                style={[
                  styles.areaBadge,
                  { color: accentColor, borderColor: accentColor },
                ]}
              >
                Area {areaLabel}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.header}>Run history</Text>
        <View style={{ width: 48 }} />
      </View>
      <View style={styles.headerSpacer} />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#9ca3af" />
          <Text style={styles.loadingText}>Loading runs…</Text>
        </View>
      ) : runs.length === 0 ? (
        <Text style={styles.emptyText}>
          Your runs will appear here once you start running.
        </Text>
      ) : (
        <FlatList
          data={sortedRuns}
          keyExtractor={(item) => (item.id ?? '').toString()}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 12 }]}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  header: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSpacer: {
    height: 12,
  },
  loadingBox: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#9ca3af',
  },
  emptyText: {
    marginTop: 20,
    fontSize: 13,
    color: '#9ca3af',
  },
  listContent: {
    paddingBottom: 0,
  },
  runCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#0b1120',
    borderWidth: 1.5,
    borderColor: '#111827',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    marginBottom: 10,
  },
  runRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  runLeftBlock: {
    flex: 1,
  },
  runRightBlock: {
    flex: 1,
    alignItems: 'flex-end',
  },
  runDistanceBig: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
  },
  runPace: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
  },
  runTime: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  runDate: {
    marginTop: 4,
    fontSize: 12,
    color: '#9ca3af',
  },
  runFooterRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  runIdBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1f2937',
    fontSize: 11,
    color: '#9ca3af',
  },
  areaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  inlineDeleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineDeleteText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  swipeDelete: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    backgroundColor: '#ef4444',
    marginVertical: 10,
    borderRadius: 16,
    alignSelf: 'stretch',
    marginLeft: 8,
  },
});

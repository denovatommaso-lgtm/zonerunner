import React from 'react';
import { View } from 'react-native';
import { formatDistance as fmtDistance } from '../../lib/utils/format';
import { HeroStatsCard } from './HeroStatsCard';
import { StartRunButton } from './StartRunButton';
import { RankPills } from './RankPills';
import { RecentRunsCard } from './RecentRunsCard';

import type { RunDoc } from '../../lib/runService';

type Stats = {
  totalRuns: number;
  totalDistanceMeters: number;
  totalTimeSeconds: number;
  totalAreaKm2: number;
  lastRun: RunDoc | null;
};

type Props = {
  accentColor: string;
  stats: Stats;
  areaRank: number;
  distanceRank: number;
  areaRankColor: string;
  distanceRankColor: string;
  runs: RunDoc[];
  loadingRuns: boolean;
  onPressStart: () => void;
  onPressViewAllRuns: () => void;
  onPressRun: (id: string) => void;
  onPressAreaRank: () => void;
  onPressDistanceRank: () => void;
  friendsHeader: React.ReactNode;
  friendsList: React.ReactNode;
  quickActions?: React.ReactNode;
};

export function HomePersonal({
  accentColor,
  stats,
  areaRank,
  distanceRank,
  areaRankColor,
  distanceRankColor,
  runs,
  loadingRuns,
  onPressStart,
  onPressViewAllRuns,
  onPressRun,
  onPressAreaRank,
  onPressDistanceRank,
  friendsHeader,
  friendsList,
  quickActions,
}: Props) {
  const totalArea = stats.totalAreaKm2 ?? 0;
  const totalDistanceMeters = stats.totalDistanceMeters ?? 0;
  const totalTimeSeconds = stats.totalTimeSeconds ?? 0;

  return (
    <View style={{ gap: 12 }}>
      <HeroStatsCard
        mode="personal"
        stats={{
          totalAreaKm2: totalArea,
          totalDistanceMeters,
          totalTimeSeconds,
        }}
        formatDistance={(m) => fmtDistance(m)}
        formatTime={(s) => formatTime(s)}
      />

      <RankPills
        areaRank={areaRank}
        distanceRank={distanceRank}
        areaColor={areaRankColor}
        distanceColor={distanceRankColor}
        onPressArea={onPressAreaRank}
        onPressDistance={onPressDistanceRank}
      />

      <StartRunButton
        style={{ marginTop: 2, marginBottom: 8 }}
        onPress={onPressStart}
        label="Start run"
      />

      <RecentRunsCard
        style={{ marginTop: 0, marginBottom: 10 }}
        loading={loadingRuns}
        runs={runs}
        accentColor={accentColor}
        onPressViewAll={onPressViewAllRuns}
        onPressRun={(id) => onPressRun(id.toString())}
      />

      <View style={{ marginTop: 6 }}>
        {friendsHeader}
        {friendsList}
      </View>

    </View>
  );
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  return `${hours}h ${minutes}m`;
}

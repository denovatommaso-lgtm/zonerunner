import React from 'react';
import Ionicons from '@/components/common/Ionicons';
import { Pressable, View, Text } from 'react-native';
import { HeroStatsCard } from './HeroStatsCard';
import { StartRunButton } from './StartRunButton';
import { RankPills } from './RankPills';
import { formatDistance as fmtDistance, formatTimeHrs } from '../../lib/utils/format';

type GroupStats = {
  distanceKm: number;
  areaKm2: number;
  runs: number;
};

type Props = {
  accentColor: string;
  activeGroupName?: string;
  activeGroupColor?: string;
  groupStats: GroupStats;
  myGroupStats: GroupStats;
  onPressStartGroupRun: () => void;
  onPressAreaRank: () => void;
  onPressDistanceRank: () => void;
  areaRank: number;
  distanceRank: number;
  areaRankColor: string;
  distanceRankColor: string;
  groupPicker: React.ReactNode;
  startLabel?: string;
  onPressSelectGroup?: () => void;
  hasMultipleGroups?: boolean;
  isLive?: boolean;
  children?: React.ReactNode; // for members/friends sections
};

export function HomeGroup({
  accentColor,
  activeGroupName,
  activeGroupColor,
  groupStats,
  myGroupStats,
  onPressStartGroupRun,
  onPressAreaRank,
  onPressDistanceRank,
  areaRank,
  distanceRank,
  areaRankColor,
  distanceRankColor,
  groupPicker,
  startLabel = 'Start group run',
  onPressSelectGroup,
  hasMultipleGroups = false,
  isLive = false,
  children,
}: Props) {
  const totalArea = groupStats.areaKm2 ?? 0;
  const totalDistance = groupStats.distanceKm ?? 0;
  const myArea = myGroupStats.areaKm2 ?? 0;
  const myDistance = myGroupStats.distanceKm ?? 0;

  return (
    <View style={{ gap: 12 }}>
      <Pressable
        onPress={onPressSelectGroup}
        disabled={!onPressSelectGroup}
        style={({ pressed }) => [
          {
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: activeGroupColor ?? accentColor,
            backgroundColor: '#0b1220',
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          pressed && onPressSelectGroup ? { opacity: 0.9 } : null,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: activeGroupColor ?? accentColor,
            }}
          />
            <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }} numberOfLines={1}>
                  {activeGroupName ?? 'Select a group'}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: isLive
                    ? (activeGroupColor ?? accentColor) + 'e6'
                    : (activeGroupColor ?? accentColor) + '22',
                  borderWidth: 1,
                  borderColor: (activeGroupColor ?? accentColor) + '55',
                  shadowColor: isLive ? activeGroupColor ?? accentColor : undefined,
                  shadowOpacity: isLive ? 0.9 : undefined,
                  shadowRadius: isLive ? 16 : undefined,
                  shadowOffset: isLive ? { width: 0, height: 0 } : undefined,
                  elevation: isLive ? 0 : undefined, // avoid Android dark shadow tint
                  marginLeft: 2,
                }}
              >
                <Text
                  style={{
                    color: isLive ? '#ffffff' : '#9ca3af',
                    fontWeight: '800',
                    fontSize: 12,
                  }}
                >
                  Live
                </Text>
              </View>
            </View>
          </View>
          {hasMultipleGroups && onPressSelectGroup && (
            <Ionicons
              name="chevron-down"
              size={18}
              color="#9ca3af"
              style={{ marginLeft: 6 }}
            />
          )}
        </View>
      </Pressable>

      <HeroStatsCard
        mode="group"
        stats={{
          totalAreaKm2: totalArea,
          totalDistanceMeters: totalDistance * 1000,
          totalTimeSeconds: 0,
        }}
        myGroupStats={{ distanceKm: myDistance, areaKm2: myArea }}
        formatDistance={(m) => fmtDistance(m)}
        formatTime={(s) => formatTimeHrs(s)}
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
        onPress={onPressStartGroupRun}
        label={startLabel}
      />

      {groupPicker}

      {children}
    </View>
  );
}

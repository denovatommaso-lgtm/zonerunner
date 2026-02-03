import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useGoogleAuth } from '../lib/auth';
import { loadUserProfile, updateUserProfile } from '../lib/authService';
import { loadRunsForUser } from '../lib/runService';
import { loadMonthlyChallengesState } from '../lib/monthlyChallengesStore';
import { computeCurrentAreasFromRuns } from '../lib/utils/currentAreas';
import { defaultXPConfig, levelFromTotalXp, xpFromSources } from '../lib/xpProgression';
import { getEffectiveTier } from '../lib/rewardsHelpers';
import { type RewardCategory, type RewardTier } from '../lib/rewardsConfig';
import { StyledAvatar } from '../components/common/StyledAvatar';
import Ionicons from '@/components/common/Ionicons';
import { BackButton } from '../components/common/BackButton';
import {
  DEFAULT_TERRITORY_COLOR_ID,
  validateTerritoryColorSelection,
  findColorByHex,
  type TerritoryColor,
  type TerritoryColorId,
} from '../lib/territoryColors';
import {
  getAllBorderStylesWithRequiredLevels,
  getAllColorsWithRequiredLevels,
  getAllTiersWithRequiredLevels,
  getNextReward,
  isUnlocked,
} from '../lib/rewards/rewardSchedule';

type ModeState = {
  levelBorderMode: 'auto' | 'manual';
  selectedLevelBorderTier?: RewardTier | null;
  levelBorderStyleMode: 'auto' | 'manual';
  selectedLevelBorderStyleTier?: RewardTier | null;
  territoryColorId?: TerritoryColorId;
  customTerritoryColorHex?: string | null;
};

export default function RewardsScreen() {
  const isSSR = typeof document === 'undefined';
  if (isSSR) {
    return null;
  }

  const { user } = useGoogleAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const [challengeXp, setChallengeXp] = useState(0);
  const [lifetimeXp, setLifetimeXp] = useState(0);
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [customRgb, setCustomRgb] = useState<{ r: number; g: number; b: number }>({ r: 255, g: 255, b: 255 });
  const [modeState, setModeState] = useState<ModeState>({
    levelBorderMode: 'auto',
    levelBorderStyleMode: 'auto',
    territoryColorId: DEFAULT_TERRITORY_COLOR_ID,
    customTerritoryColorHex: null,
  });
  const unlockedColorRef = useRef<Set<TerritoryColorId>>(new Set());
  const unlockedInitRef = useRef(false);

  const rgbToHex = (rgb: { r: number; g: number; b: number }) => {
    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    return `#${[rgb.r, rgb.g, rgb.b]
      .map((v) => clamp(v).toString(16).padStart(2, '0'))
      .join('')}`.toLowerCase();
  };

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (__DEV__) {
          console.log(`[RUNS_CALLSITE] file=app/rewards.tsx fn=RewardsScreen.useEffect reason=bootstrapRewards ts=${Date.now()}`);
        }
        const [profile, runDocs, mcState] = await Promise.all([
          loadUserProfile(user.uid),
          loadRunsForUser(user.uid),
          loadMonthlyChallengesState(user.uid),
        ]);
        if (cancelled) return;
        setRuns(runDocs as any[]);
        const mcXp = profile?.monthlyChallenges?.totalChallengeXp ?? mcState?.totalChallengeXp ?? 0;
        setChallengeXp(mcXp);
        setLifetimeXp(profile?.lifetimeXp ?? 0);
        setModeState({
          levelBorderMode: profile?.levelBorderMode ?? 'auto',
          selectedLevelBorderTier: (profile?.selectedLevelBorderTier as RewardTier | null | undefined) ?? null,
          levelBorderStyleMode: (profile as any)?.levelBorderStyleMode ?? profile?.levelBorderMode ?? 'auto',
          selectedLevelBorderStyleTier:
            ((profile as any)?.selectedLevelBorderStyleTier as RewardTier | null | undefined) ?? null,
          territoryColorId:
            findColorByHex(profile?.territoryColor)?.id ??
            (profile?.territoryColor as TerritoryColorId | undefined) ??
            (profile?.territoryColor ? 'custom' : DEFAULT_TERRITORY_COLOR_ID),
          customTerritoryColorHex:
            findColorByHex(profile?.territoryColor)?.id || !profile?.territoryColor
              ? null
              : (profile?.territoryColor as string),
        });
      } catch (e) {
        console.log('Failed to load rewards data', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const totals = useMemo(() => {
    const distanceKm = runs.reduce((s, r) => s + ((r.distance ?? 0) / 1000), 0);
    const areaMap = computeCurrentAreasFromRuns(runs as any[], { mode: 'personal', activeGroupId: null });
    const areaKm2 = user?.uid ? areaMap.get(user.uid) ?? 0 : 0;
    const computedXp = xpFromSources({ distanceKm, territoryKm2: areaKm2, challengeXp }, defaultXPConfig);
    const totalXp = Math.max(lifetimeXp, computedXp);
    const levelInfo = levelFromTotalXp(totalXp, defaultXPConfig);
    return { distanceKm, areaKm2, totalXp, levelInfo };
  }, [runs, challengeXp, user?.uid, lifetimeXp]);

  useEffect(() => {
    if (!user?.uid) return;
    const computedXp = totals.totalXp;
    if (computedXp <= (lifetimeXp || 0)) return;
    setLifetimeXp(computedXp);
    // Best-effort persist to keep XP non-decreasing across sessions.
    void updateUserProfile(user.uid, { lifetimeXp: computedXp }).catch(() => {});
  }, [totals.totalXp, lifetimeXp, user?.uid]);

  const colorOptions = useMemo(() => getAllColorsWithRequiredLevels(), []);
  const borderStyleOptions = useMemo(() => getAllBorderStylesWithRequiredLevels(), []);
  const tierOptions = useMemo(() => getAllTiersWithRequiredLevels(), []);
  const unlockedColors = useMemo(
    () => colorOptions.filter((c) => isUnlocked(totals.levelInfo.level, 'color', c.id)),
    [colorOptions, totals.levelInfo.level]
  );
  const territoryUnlockedCount = unlockedColors.length;
  const selectedTerritoryColor = validateTerritoryColorSelection(
    modeState.territoryColorId,
    totals.levelInfo.level,
    modeState.customTerritoryColorHex ?? undefined
  );

  useEffect(() => {
    const unlockedIds = new Set(unlockedColors.map((c) => c.id));
    unlockedColorRef.current = unlockedIds;
    unlockedInitRef.current = true;
    const validated = validateTerritoryColorSelection(modeState.territoryColorId, totals.levelInfo.level);
    if (validated.id !== modeState.territoryColorId) {
      setModeState((prev) => ({ ...prev, territoryColorId: validated.id }));
    }
  }, [unlockedColors, totals.levelInfo.level, modeState.territoryColorId]);

  const nextUnlock = getNextReward(totals.levelInfo.level);
  const progressPct =
    totals.levelInfo.xpForNext > 0
      ? Math.min(1, totals.levelInfo.xpIntoLevel / totals.levelInfo.xpForNext)
      : 1;
  const swatchGap = 8;
  const swatchSize = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const outerPadding = 16 * 2; // scroll container horizontal padding
    const cardPadding = 14 * 2; // section card horizontal padding
    const available = Math.max(0, screenWidth - outerPadding - cardPadding);
    const columns = 7;
    const size = Math.floor((available - swatchGap * (columns - 1)) / columns);
    return Math.max(30, size);
  }, []);
  const previewBorderTier = getEffectiveTier({
    level: totals.levelInfo.level,
    mode: modeState.levelBorderMode,
    selectedTier: modeState.selectedLevelBorderTier ?? undefined,
    category: 'levelBorder',
  });
  const previewBorderStyleTier = getEffectiveTier({
    level: totals.levelInfo.level,
    mode: modeState.levelBorderStyleMode,
    selectedTier: modeState.selectedLevelBorderStyleTier ?? undefined,
    category: 'levelBorderStyle',
  });

  const handleModeChange = async (category: RewardCategory, mode: 'auto' | 'manual') => {
    if (!user?.uid) return;
    const payload =
      category === 'levelBorderStyle'
        ? { levelBorderStyleMode: mode }
        : { levelBorderMode: mode };
    setModeState((prev) => ({ ...prev, ...(payload as any) }));
    try {
      setSaving(true);
      await updateUserProfile(user.uid, payload as any);
    } catch (e) {
      console.log('Failed to save mode', e);
      Alert.alert('Save failed', 'Could not save your preference.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTier = async (category: RewardCategory, tier: RewardTier) => {
    if (!user?.uid) return;
    const type = category === 'levelBorderStyle' ? 'borderStyle' : 'tier';
    if (!isUnlocked(totals.levelInfo.level, type, tier)) return;
    const payload =
      category === 'levelBorderStyle'
        ? { levelBorderStyleMode: 'manual' as const, selectedLevelBorderStyleTier: tier }
        : { levelBorderMode: 'manual' as const, selectedLevelBorderTier: tier };
    setModeState((prev) => ({ ...prev, ...(payload as any) }));
    try {
      setSaving(true);
      await updateUserProfile(user.uid, payload as any);
    } catch (e) {
      console.log('Failed to save selection', e);
      Alert.alert('Save failed', 'Could not save your selection.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTerritoryColor = async (color: TerritoryColor) => {
    if (!user?.uid) return;
    if (!isUnlocked(totals.levelInfo.level, 'color', color.id)) {
      Alert.alert('Locked color', `Unlocks at level ${color.requiredLevel}.`);
      return;
    }
    if (color.id === 'custom') {
      setShowCustomColor(true);
      const hex = modeState.customTerritoryColorHex ?? '#ffffff';
      const r = parseInt(hex.slice(1, 3), 16) || 255;
      const g = parseInt(hex.slice(3, 5), 16) || 255;
      const b = parseInt(hex.slice(5, 7), 16) || 255;
      setCustomRgb({ r, g, b });
      setModeState((prev) => ({ ...prev, territoryColorId: 'custom' }));
      return;
    }
    setModeState((prev) => ({ ...prev, territoryColorId: color.id, customTerritoryColorHex: null }));
    try {
      setSaving(true);
      await updateUserProfile(user.uid, { territoryColor: color.hex });
    } catch (e) {
      console.log('Failed to save territory color', e);
      Alert.alert('Save failed', 'Could not update territory color.');
    } finally {
      setSaving(false);
    }
  };

  if (!user?.uid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>Rewards</Text>
          <Text style={styles.subtitle}>Sign in to view and select rewards.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.subtitle}>Loading rewards…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarSide}>
            <BackButton onPress={() => router.back()} />
          </View>
          <View style={styles.toolbarTitleWrap}>
            <Text style={styles.toolbarTitle}>Customize</Text>
          </View>
          <View style={styles.toolbarSide} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.levelPill}>
                <Ionicons name="flame" size={14} color="#fbbf24" />
                <Text style={styles.levelPillText}>Level {totals.levelInfo.level}</Text>
              </View>
              <Text style={styles.heroSubtitle}>Unlock cosmetic tiers as you level up.</Text>
            </View>
            <StyledAvatar
              name="You"
              uri={user?.profile?.avatarUrl}
              size={74}
              tier={previewBorderTier}
              styleTier={previewBorderStyleTier}
            />
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progressPct * 100)}%` }]} />
          </View>
          <View style={styles.heroStatsRow}>
            <Text style={styles.heroStat}>
              {totals.levelInfo.xpIntoLevel}/{totals.levelInfo.xpForNext} XP this level
            </Text>
            <Text style={styles.heroStat}>
              {nextUnlock ? `Next: ${nextUnlock.title} at Lv ${nextUnlock.level}` : 'All rewards unlocked'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile Border Styles</Text>
            <View style={styles.modeToggleRow}>
              <TouchableOpacity
                style={[styles.modeChip, modeState.levelBorderStyleMode === 'auto' && styles.modeChipActive]}
                onPress={() => handleModeChange('levelBorderStyle', 'auto')}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    modeState.levelBorderStyleMode === 'auto' && styles.modeChipTextActive,
                  ]}
                >
                  Auto
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeChip, modeState.levelBorderStyleMode === 'manual' && styles.modeChipActive]}
                onPress={() => handleModeChange('levelBorderStyle', 'manual')}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    modeState.levelBorderStyleMode === 'manual' && styles.modeChipTextActive,
                  ]}
                >
                  Manual
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.cardGrid}>
            {borderStyleOptions.map((def) => {
              const unlocked = isUnlocked(totals.levelInfo.level, 'borderStyle', def.id);
              const isSelected =
                modeState.levelBorderStyleMode === 'manual' && modeState.selectedLevelBorderStyleTier === def.id;
              const status = unlocked
                ? isSelected
                  ? 'Selected'
                  : 'Unlocked'
                : `Unlocks at Lv ${def.requiredLevel}`;
              return (
                <TouchableOpacity
                  key={def.id}
                  style={[
                    styles.rewardCard,
                    isSelected && styles.rewardCardSelected,
                    !unlocked && styles.rewardCardLocked,
                  ]}
                  activeOpacity={unlocked ? 0.8 : 1}
                  onPress={() => (unlocked ? handleSelectTier('levelBorderStyle', def.id) : undefined)}
                >
                  <Text style={styles.rewardTitle}>{def.title}</Text>
                  <Text style={styles.rewardStatus}>{status}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile Border Colors</Text>
            <View style={styles.modeToggleRow}>
              <TouchableOpacity
                style={[styles.modeChip, modeState.levelBorderMode === 'auto' && styles.modeChipActive]}
                onPress={() => handleModeChange('levelBorder', 'auto')}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    modeState.levelBorderMode === 'auto' && styles.modeChipTextActive,
                  ]}
                >
                  Auto
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeChip, modeState.levelBorderMode === 'manual' && styles.modeChipActive]}
                onPress={() => handleModeChange('levelBorder', 'manual')}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    modeState.levelBorderMode === 'manual' && styles.modeChipTextActive,
                  ]}
                >
                  Manual
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.cardGrid}>
            {tierOptions.map((def) => {
              const unlocked = isUnlocked(totals.levelInfo.level, 'tier', def.id);
              const isSelected =
                modeState.levelBorderMode === 'manual' && modeState.selectedLevelBorderTier === def.id;
              const status = unlocked
                ? isSelected
                  ? 'Selected'
                  : 'Unlocked'
                : `Unlocks at Lv ${def.requiredLevel}`;
              return (
                <TouchableOpacity
                  key={def.id}
                  style={[
                    styles.rewardCard,
                    isSelected && styles.rewardCardSelected,
                    !unlocked && styles.rewardCardLocked,
                  ]}
                  activeOpacity={unlocked ? 0.8 : 1}
                  onPress={() => (unlocked ? handleSelectTier('levelBorder', def.id) : undefined)}
                >
                  <Text style={styles.rewardTitle}>{def.title}</Text>
                  <Text style={styles.rewardStatus}>{status}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Territory Colors</Text>
            <Text style={styles.colorMetaText}>
              {territoryUnlockedCount}/28 unlocked
            </Text>
          </View>
          <FlatList
            data={colorOptions}
            keyExtractor={(c) => c.id}
            numColumns={7}
            scrollEnabled={false}
            columnWrapperStyle={{ gap: swatchGap }}
            contentContainerStyle={[styles.colorGrid, { rowGap: swatchGap }]}
            renderItem={({ item: color }) => {
              const unlocked = isUnlocked(totals.levelInfo.level, 'color', color.id);
              const isSelected = selectedTerritoryColor.id === color.id;
              const isCustom = color.id === 'custom';
              const swatchHex = isCustom ? (modeState.customTerritoryColorHex ?? color.hex) : color.hex;
              return (
                <TouchableOpacity
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: isCustom ? 'transparent' : swatchHex,
                      width: swatchSize,
                      height: swatchSize,
                    },
                    isSelected && styles.colorSelected,
                    unlocked ? styles.colorUnlocked : styles.colorLocked,
                    isCustom && styles.multiColorPreview,
                  ]}
                  activeOpacity={unlocked ? 0.9 : 1}
                  onPress={() => handleSelectTerritoryColor(color as any)}
                >
                  {isCustom && (
                    <View style={styles.multiColorInner}>
                      <View style={[styles.multiColorRay, styles.ray0, { backgroundColor: '#22d3ee' }]} />
                      <View style={[styles.multiColorRay, styles.ray45, { backgroundColor: '#fbbf24' }]} />
                      <View style={[styles.multiColorRay, styles.ray90, { backgroundColor: '#a78bfa' }]} />
                      <View style={[styles.multiColorRay, styles.ray135, { backgroundColor: '#10b981' }]} />
                      <View style={[styles.multiColorRay, styles.ray180, { backgroundColor: '#f472b6' }]} />
                      <View style={[styles.multiColorRay, styles.ray225, { backgroundColor: '#38bdf8' }]} />
                    </View>
                  )}
                  {!unlocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={14} color="#e5e7eb" />
                      <Text style={styles.lockLabel}>Lv {color.requiredLevel}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Custom color picker modal */}
        {!isSSR && showCustomColor ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setShowCustomColor(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Pick a custom color</Text>
                <View style={[styles.customPreview, { backgroundColor: rgbToHex(customRgb) }]} />
                {(['r', 'g', 'b'] as const).map((ch) => (
                  <View key={ch} style={styles.sliderRow}>
                    <Text style={styles.sliderLabel}>{ch.toUpperCase()}</Text>
                    <View style={styles.sliderTrack}>
                      <View
                        style={[
                          styles.sliderFill,
                          { width: `${(customRgb[ch] / 255) * 100}%` },
                        ]}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.sliderButton}
                      onPress={() =>
                        setCustomRgb((prev) => ({
                          ...prev,
                          [ch]: Math.max(0, Math.min(255, prev[ch] - 15)),
                        }))
                      }
                    >
                      <Text style={styles.sliderBtnText}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sliderButton}
                      onPress={() =>
                        setCustomRgb((prev) => ({
                          ...prev,
                          [ch]: Math.max(0, Math.min(255, prev[ch] + 15)),
                        }))
                      }
                    >
                      <Text style={styles.sliderBtnText}>+</Text>
                    </TouchableOpacity>
                    <Text style={styles.sliderValue}>{customRgb[ch]}</Text>
                  </View>
                ))}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCustomColor(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSave}
                    onPress={async () => {
                      if (!user?.uid) return;
                      const hex = rgbToHex(customRgb);
                      setModeState((prev) => ({
                        ...prev,
                        territoryColorId: 'custom',
                        customTerritoryColorHex: hex,
                      }));
                      try {
                        setSaving(true);
                        await updateUserProfile(user.uid, { territoryColor: hex });
                      } catch {
                        Alert.alert('Save failed', 'Could not update territory color.');
                      } finally {
                        setSaving(false);
                        setShowCustomColor(false);
                      }
                    }}
                  >
                    <Text style={styles.modalSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={styles.subtitle}>Saving…</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050914' },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  toolbar: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  toolbarSide: { width: 64, alignItems: 'flex-start' },
  toolbarTitleWrap: { flex: 1, alignItems: 'center' },
  toolbarTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
  heroCard: {
    backgroundColor: '#0b1220',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#13213a',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    gap: 10,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fbbf2418',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fbbf2430',
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 18,
  },
  levelPillText: { color: '#fbbf24', fontWeight: '800', fontSize: 13 },
  heroTitle: { color: 'white', fontSize: 20, fontWeight: '800' },
  progressBar: {
    height: 12,
    backgroundColor: '#111827',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 999,
  },
  heroStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroStat: { color: '#cbd5e1', fontWeight: '700', fontSize: 12 },
  sectionCard: {
    backgroundColor: '#0b1220',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#13213a',
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: 'white', fontSize: 16, fontWeight: '800' },
  modeToggleRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0d1627',
  },
  modeChipActive: { backgroundColor: '#22c55e22', borderColor: '#22c55e55' },
  modeChipText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  modeChipTextActive: { color: '#bbf7d0' },
  effectiveText: { color: '#a5b4fc', marginTop: -2, marginBottom: 4, fontWeight: '700' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rewardCard: {
    width: '48%',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 6,
  },
  rewardCardSelected: { borderColor: '#22c55e', backgroundColor: '#22c55e16' },
  rewardCardLocked: { opacity: 0.5 },
  rewardTitle: { color: 'white', fontWeight: '800', fontSize: 14 },
  rewardDesc: { color: '#94a3b8', fontSize: 12, lineHeight: 16 },
  rewardStatus: { color: '#e5e7eb', fontSize: 12, fontWeight: '700' },
  colorMetaText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  unlockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unlockNote: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  colorGrid: {
    flexDirection: 'column',
  },
  colorSwatch: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#0f172a',
    position: 'relative',
    overflow: 'hidden',
  },
  multiColorPreview: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  multiColorInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  multiColorRay: {
    position: 'absolute',
    width: '140%',
    height: 6,
    top: '50%',
    left: '-20%',
  },
  ray0: { transform: [{ translateY: -3 }, { rotate: '0deg' }] },
  ray45: { transform: [{ translateY: -3 }, { rotate: '45deg' }] },
  ray90: { transform: [{ translateY: -3 }, { rotate: '90deg' }] },
  ray135: { transform: [{ translateY: -3 }, { rotate: '135deg' }] },
  ray180: { transform: [{ translateY: -3 }, { rotate: '180deg' }] },
  ray225: { transform: [{ translateY: -3 }, { rotate: '225deg' }] },
  colorSelected: {
    borderColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  colorUnlocked: { opacity: 1 },
  colorLocked: { opacity: 0.4 },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0b1220aa',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  lockLabel: { color: '#e5e7eb', fontSize: 11, fontWeight: '800' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#22c55e',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: { color: '#0b1120', fontWeight: '800' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  backText: { color: '#94a3b8', fontWeight: '700', marginRight: 12 },
  title: { color: 'white', fontSize: 26, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#0b1220',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#13213a',
    gap: 12,
  },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
  customPreview: {
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderLabel: { color: '#e5e7eb', width: 18, fontWeight: '800' },
  sliderTrack: {
    flex: 1,
    height: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
  },
  sliderButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderBtnText: { color: '#e5e7eb', fontWeight: '800', fontSize: 14 },
  sliderValue: { width: 40, textAlign: 'right', color: '#e5e7eb', fontWeight: '700' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
  },
  modalCancelText: { color: '#e5e7eb', fontWeight: '700' },
  modalSave: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#22c55e',
  },
  modalSaveText: { color: '#0b1120', fontWeight: '800' },
});

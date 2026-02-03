import React from 'react';
import {
  LayoutAnimation,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BackButton } from '../common/BackButton';
import { romanNumeral, xpForMilestone, type MonthlyChallengeView } from '../../lib/monthlyChallenges';
import type { YearlyChallengeView } from '../../lib/yearlyChallenges';

type Props = {
  visible: boolean;
  challenges: MonthlyChallengeView[];
  yearlyChallenges?: YearlyChallengeView[];
  onClose: () => void;
};

function stageMetalColor(stage: number) {
  if (stage <= 1) return '#c2410c'; // bronze (darker)
  if (stage === 2) return '#c0c7d1'; // silver
  return '#fbbf24'; // gold (stage 3+)
}

function stageMetalOutlineColor(stage: number) {
  // Use a subtle outline; RN supports #RRGGBBAA.
  return `${stageMetalColor(stage)}55`;
}

function isGoldCompleteCard(ch: ChallengeViewCommon) {
  // Only when completing Stage III (or higher) with ★★★.
  return ch.stage >= 3 && ch.starsEarned >= 3;
}

function formatValue(unit: string, value: number) {
  if (unit === 'km') return `${Math.round(value)} km`;
  if (unit === 'sec') {
    const totalMinutes = Math.floor(Math.max(0, value) / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h <= 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  if (unit === 'paceSec') {
    if (!value || value <= 0) return '--:-- /km';
    const s = Math.max(0, Math.round(value));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')} /km`;
  }
  if (unit === 'count') {
    return `${Math.round(value)}`;
  }
  return `${Math.round(value)}`;
}

function formatTarget(unit: string, value: number) {
  if (unit === 'km') return `${Math.round(value)} km`;
  if (unit === 'sec') {
    const totalMinutes = Math.round(Math.max(0, value) / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h <= 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  if (unit === 'paceSec') {
    const s = Math.max(0, Math.round(value));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')} /km`;
  }
  if (unit === 'count') {
    return `${Math.round(value)}`;
  }
  return `${Math.round(value)}`;
}

function countLabel(challengeId: string) {
  if (challengeId === 'friends') return 'new friends';
  if (challengeId === 'consistency') return 'days';
  if (challengeId === 'earlyBird') return 'runs in window';
  if (challengeId === 'nightOwl') return 'runs in window';
  return 'count';
}

function rankingScopeSuffix(stage: number) {
  if (stage <= 1) return 'in your state';
  if (stage === 2) return 'in your country';
  return 'in the world';
}

function formatCountTarget(challengeId: string, stage: number, star: 1 | 2 | 3, target: number) {
  const n = Math.round(target);
  if (challengeId === 'friends') return `${n} new friend${n === 1 ? '' : 's'}`;
  if (challengeId === 'consistency') return `${n} day${n === 1 ? '' : 's'}`;
  if (challengeId === 'earlyBird') return `${n} run${n === 1 ? '' : 's'} in window`;
  if (challengeId === 'nightOwl') return `${n} run${n === 1 ? '' : 's'} in window`;
  if (challengeId === 'ranking') {
    const scope = rankingScopeSuffix(stage);
    if (star === 1) return `Reach Top 25 ${scope}`;
    if (star === 2) return `Reach Top 10 ${scope}`;
    return `Reach Top 3 ${scope}`;
  }
  return `${n}`;
}

type ChallengeViewCommon = MonthlyChallengeView | YearlyChallengeView;

function progressPct(ch: ChallengeViewCommon) {
  const { unit, progressValue: v, nextStarTarget: nextTarget } = ch as any;
  if (!nextTarget || nextTarget <= 0) return 1;
  if (unit === 'paceSec') {
    if (!v || v <= 0) return 0;
    // Lower is better; fill approaches 1.0 as best pace approaches the next threshold.
    return Math.max(0, Math.min(1, nextTarget / v));
  }
  if (ch.id === 'ranking') {
    const scopes = ((ch.meta as any)?.scopes ?? {}) as any;
    const scopeValues = Object.values(scopes);
    const totalStars = scopeValues.length
      ? scopeValues.reduce((sum: number, scope: any) => {
          const stars = scope?.stars;
          const count = stars?.top3 ? 3 : stars?.top10 ? 2 : stars?.top25 ? 1 : 0;
          return sum + count;
        }, 0)
      : ch.starsEarned ?? 0;
    return Math.max(0, Math.min(1, totalStars / 9));
  }
  if (ch.id === 'longest') {
    if (!v || v <= 0) return 0;
    return Math.max(0, Math.min(1, v / nextTarget));
  }
  return Math.max(0, Math.min(1, v / nextTarget));
}

function rankingStarsFor(ch: ChallengeViewCommon, scope: 'state' | 'country' | 'world') {
  return ((ch.meta as any)?.scopes?.[scope]?.stars ?? {}) as {
    top25?: boolean;
    top10?: boolean;
    top3?: boolean;
  };
}


export default function ChallengesModal({ visible, challenges, yearlyChallenges = [], onClose }: Props) {
  const [selected, setSelected] = React.useState<ChallengeViewCommon | null>(null);
  const prevTitlesRef = React.useRef<Record<string, string>>({});
  const monthlyChallenges = challenges;

  React.useEffect(() => {
    const prev = prevTitlesRef.current;
    let changed = false;
    for (const c of monthlyChallenges) {
      if (prev[c.id] && prev[c.id] !== c.title) {
        changed = true;
        break;
      }
    }
    prevTitlesRef.current = Object.fromEntries(monthlyChallenges.map((c) => [c.id, c.title]));
    if (changed) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [monthlyChallenges]);

  const renderChallengeCard = (ch: ChallengeViewCommon, cadence: 'monthly' | 'yearly') => {
    const isRanking = ch.id === 'ranking';
    const goldComplete = isGoldCompleteCard(ch);
    const titleColor = goldComplete ? '#0b1120' : stageMetalColor(ch.stage);
    const secondaryTextColor = goldComplete ? '#0b1120' : '#cbd5e1';
    const hintTextColor = goldComplete ? '#0b1120' : '#94a3b8';
    const xpTextColor = goldComplete ? '#0b1120' : '#22c55e';
    const starsColor = goldComplete ? '#0b1120' : '#fbbf24';
    const emptyStarsColor = goldComplete ? '#0b1120' : '#94a3b8';

    const rankingScopes = ((ch.meta as any)?.scopes ?? {}) as any;
    const rankingScopeValues = Object.values(rankingScopes);
    const totalRankingStars = isRanking
      ? rankingScopeValues.length
        ? rankingScopeValues.reduce((sum: number, scope: any) => {
            const stars = scope?.stars;
            const count = stars?.top3 ? 3 : stars?.top10 ? 2 : stars?.top25 ? 1 : 0;
            return sum + count;
          }, 0)
        : ch.starsEarned ?? 0
      : 0;
    const rankingBestRank = isRanking
      ? rankingScopeValues.length
        ? rankingScopeValues.reduce((best: number | null, scope: any) => {
            const rank = Number(scope?.bestRank ?? 0);
            if (!Number.isFinite(rank) || rank <= 0) return best;
            if (best === null || rank < best) return rank;
            return best;
          }, null as number | null)
        : Number.isFinite(ch.progressValue) && (ch.progressValue ?? 0) > 0
          ? (ch.progressValue as number)
          : null
      : null;
    const rankingStarCount = Math.max(0, Math.min(3, Math.floor(totalRankingStars / 3)));
    const filled = '★'.repeat(isRanking ? rankingStarCount : ch.starsEarned);
    const empty = '☆'.repeat(Math.max(0, 3 - (isRanking ? rankingStarCount : ch.starsEarned)));
    const pct = progressPct(ch);
    const hasNextStage = ch.stage < ch.stageMax;
    const nextStageTitle = hasNextStage
      ? `${ch.baseLabel} ${romanNumeral(ch.stage + 1)}`
      : null;
    const xpLine =
      typeof ch.nextMilestoneXp === 'number'
        ? `XP: ${ch.earnedXpThisStage}/${ch.stageTotalXp} · Next +${ch.nextMilestoneXp} XP`
        : `XP: ${ch.earnedXpThisStage}/${ch.stageTotalXp}`;
    const progressLine =
      ch.id === 'ranking'
        ? `Best this month: ${rankingBestRank ? `#${rankingBestRank}` : '—'}`
        : ch.id === 'longest'
          ? `Best this ${cadence === 'yearly' ? 'year' : 'month'}: ${(ch.progressValue ?? 0).toFixed(1)} km`
          : ch.unit === 'paceSec'
            ? `Best 1km: ${formatValue(ch.unit, ch.progressValue)}`
            : ch.unit === 'km'
              ? `${Math.round(ch.progressValue)} km`
              : ch.unit === 'count'
                ? `${Math.round(ch.progressValue)} ${countLabel(ch.id)}`
                : `${formatValue(ch.unit, ch.progressValue)}`;

    return (
      <TouchableOpacity
        key={`${cadence}-${ch.id}`}
        style={[
          styles.challengeCard,
          goldComplete
            ? { backgroundColor: '#fbbf24', borderColor: '#fbbf24' }
            : {
                borderColor:
                  ch.id === 'ranking'
                    ? stageMetalOutlineColor(ch.stage)
                    : ch.starsEarned >= 3
                      ? '#22c55e'
                      : stageMetalOutlineColor(ch.stage),
              },
          ch.starsEarned >= 3 && !goldComplete && ch.id !== 'ranking' && styles.challengeCardComplete,
        ]}
        activeOpacity={0.85}
        onPress={() => setSelected(ch)}
      >
        <View style={styles.challengeTop}>
          <Text style={[styles.challengeLabel, { color: titleColor }]}>
            {ch.title}
          </Text>
          <Text style={styles.challengeStars}>
            <Text style={{ color: starsColor }}>{filled}</Text>
            <Text style={{ color: emptyStarsColor }}>{empty}</Text>
          </Text>
        </View>

        <Text style={[styles.challengeProgress, { color: secondaryTextColor }]}>
          {progressLine}
        </Text>
        {hasNextStage ? (
          <Text style={[styles.challengeHint, { color: hintTextColor }]}>
            Complete ★★★ to unlock {nextStageTitle}
          </Text>
        ) : (
          <Text style={[styles.challengeHint, { color: hintTextColor }]}>Max stage</Text>
        )}
        <Text style={[styles.challengeXp, { color: xpTextColor }]}>{xpLine}</Text>

        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.round(pct * 100)}%` },
              goldComplete && { backgroundColor: '#0b1120' },
            ]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.fullscreen}>
        <View style={styles.fullHeader}>
          <BackButton onPress={onClose} />
          <Text style={styles.title}>Challenges</Text>
          <View style={styles.backPlaceholder} />
        </View>

        <View style={styles.list}>
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Daily</Text>
            <Text style={styles.sectionHint}>Resets every day (coming soon)</Text>

            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Monthly</Text>
            {monthlyChallenges.map((ch) => renderChallengeCard(ch, 'monthly'))}
            <Text style={styles.footerNote}>Monthly challenges reset on the 1st.</Text>

            {yearlyChallenges.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Yearly</Text>
                {yearlyChallenges.map((ch) => renderChallengeCard(ch, 'yearly'))}
                <Text style={styles.footerNote}>Yearly challenges reset every January 1.</Text>
              </>
            )}
          </ScrollView>
        </View>

        <Modal
          visible={!!selected}
          transparent
          animationType="fade"
          onRequestClose={() => setSelected(null)}
        >
          <TouchableOpacity
            style={styles.detailOverlay}
            activeOpacity={1}
            onPress={() => setSelected(null)}
          >
            <View style={styles.detailCard}>
              {selected ? (
                <>
                  <Text style={[styles.detailTitle, { color: stageMetalColor(selected.stage) }]}>
                    {selected.title}
                  </Text>
                  <Text style={styles.detailDescription}>{selected.description}</Text>
                  {selected.id === 'ranking' ? (
                    <>
                      {(() => {
                        const scopeKey =
                          selected.stage <= 1 ? 'state' : selected.stage === 2 ? 'country' : 'world';
                        const scopeLabel =
                          selected.stage <= 1 ? 'State' : selected.stage === 2 ? 'Country' : 'World';
                        const stars = rankingStarsFor(selected, scopeKey);
                        const starCount = stars?.top3 ? 3 : stars?.top10 ? 2 : stars?.top25 ? 1 : 0;
                        const nextStageLabel =
                          selected.stage < selected.stageMax
                            ? `Ranking ${romanNumeral(selected.stage + 1)}`
                            : null;
                        const missingState = !((selected.meta as any)?.scopes?.state);
                        const missingCountry = !((selected.meta as any)?.scopes?.country);
                        return (
                          <>
                            <Text style={styles.detailSubtitle}>
                              {scopeLabel} ranking stage.
                            </Text>
                            <Text style={styles.detailSubtitle}>
                              This month: {starCount} / 3 ranking stars
                            </Text>
                            {nextStageLabel ? (
                              <Text style={styles.detailHint}>
                                Complete ★★★ to unlock {nextStageLabel}
                              </Text>
                            ) : (
                              <Text style={styles.detailHint}>Max stage</Text>
                            )}
                            <Text style={styles.detailXp}>
                              XP this stage: {selected.earnedXpThisStage}/{selected.stageTotalXp}
                            </Text>
                            <View style={styles.tiers}>
                              {([
                                { star: 1, key: 'top25', label: `Reach Top 25 ${rankingScopeSuffix(selected.stage)}` },
                                { star: 2, key: 'top10', label: `Reach Top 10 ${rankingScopeSuffix(selected.stage)}` },
                                { star: 3, key: 'top3', label: `Reach Top 3 ${rankingScopeSuffix(selected.stage)}` },
                              ] as const).map((tier) => {
                                const isEarned = !!stars?.[tier.key];
                                const xp = xpForMilestone('ranking', selected.stage, tier.star as any);
                                return (
                                  <View
                                    key={`ranking-star-${tier.star}`}
                                    style={[styles.tierRow, isEarned && styles.tierRowEarned]}
                                  >
                                    <Text style={[styles.tierStar, isEarned ? styles.tierStarEarned : styles.tierStarEmpty]}>
                                      {isEarned ? '★' : '☆'}
                                    </Text>
                                    <Text style={styles.tierText}>{tier.label}</Text>
                                    <View style={{ flex: 1 }} />
                                    <Text style={styles.tierXp}>+{xp} XP</Text>
                                  </View>
                                );
                              })}
                            </View>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <Text style={styles.detailSubtitle}>
                        {selected.id === 'longest'
                          ? `Best this month: ${(selected.progressValue ?? 0).toFixed(1)} km · Target: ${Math.round(selected.starThresholds.three)} km`
                          : selected.unit === 'paceSec'
                            ? `Best 1km this month: ${formatValue(selected.unit, selected.progressValue)} · Target: ${formatTarget(selected.unit, selected.starThresholds.three)}`
                            : selected.unit === 'count'
                              ? `This month: ${Math.round(selected.progressValue)} / ${Math.round(selected.starThresholds.three)} ${countLabel(selected.id)}`
                              : `This month: ${formatValue(selected.unit, selected.progressValue)} / ${formatTarget(selected.unit, selected.starThresholds.three)}`}
                      </Text>
                      {selected.stage < selected.stageMax ? (
                        <Text style={styles.detailHint}>
                          Complete ★★★ to unlock {selected.baseLabel} {romanNumeral(selected.stage + 1)}
                        </Text>
                      ) : (
                        <Text style={styles.detailHint}>Max stage</Text>
                      )}
                      <Text style={styles.detailXp}>
                        XP this stage: {selected.earnedXpThisStage}/{selected.stageTotalXp}
                      </Text>

                      <View style={styles.tiers}>
                        {([
                          { star: 1, target: selected.starThresholds.one },
                          { star: 2, target: selected.starThresholds.two },
                          { star: 3, target: selected.starThresholds.three },
                        ] as const).map((tier) => {
                          const isEarned = (() => {
                            if (selected.unit === 'paceSec') {
                              return selected.progressValue > 0 && selected.progressValue <= tier.target;
                            }
                            return selected.progressValue >= tier.target;
                          })();
                          const xp = xpForMilestone(selected.id, selected.stage, tier.star as any);
                          const label =
                            selected.unit === 'count'
                              ? formatCountTarget(selected.id, selected.stage, tier.star, tier.target)
                              : formatTarget(selected.unit, tier.target);
                          return (
                            <View
                              key={`${selected.id}-star-${tier.star}`}
                              style={[styles.tierRow, isEarned && styles.tierRowEarned]}
                            >
                              <Text style={[styles.tierStar, isEarned ? styles.tierStarEarned : styles.tierStarEmpty]}>
                                {isEarned ? '★' : '☆'}
                              </Text>
                              <Text style={styles.tierText}>{label}</Text>
                              <View style={{ flex: 1 }} />
                              <Text style={styles.tierXp}>+{xp} XP</Text>
                            </View>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              ) : null}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: '#020617',
    paddingTop: 70,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  fullHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: 'white',
    fontWeight: '800',
    fontSize: 20,
    textAlign: 'center',
    flex: 1,
  },
  backPlaceholder: {
    width: 70,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 4,
    gap: 10,
    paddingBottom: 20,
  },
  challengeCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: '#111827',
  },
  challengeCardComplete: {
    borderColor: '#22c55e',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  cardSubtitle: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 6,
  },
  stagePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 12,
  },
  stars: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  progressTrack: {
    marginTop: 6,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
  },
  progressLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 4,
  },
  challengeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  challengeLabel: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  challengeStars: {
    color: 'transparent', // children define their own colors
    fontWeight: '800',
    letterSpacing: 1,
  },
  challengeProgress: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 6,
  },
  challengeHint: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  challengeXp: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  progressBarTrack: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#22c55e',
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  detailCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9ca3af44',
    gap: 10,
  },
  detailTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  detailSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
  },
  detailDescription: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
  detailHint: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  detailXp: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  tiers: {
    gap: 8,
    marginTop: 6,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
  },
  tierRowEarned: {
    borderColor: '#22c55e55',
    backgroundColor: '#0f172a',
  },
  tierStar: {
    fontSize: 16,
    fontWeight: '800',
  },
  tierStarEarned: {
    color: '#fbbf24',
  },
  tierStarEmpty: {
    color: '#94a3b8',
  },
  tierText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 13,
  },
  tierXp: {
    color: '#22c55e',
    fontWeight: '800',
    fontSize: 12,
  },
  sectionLabel: {
    color: '#e5e7eb',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  sectionHint: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  footerNote: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
});

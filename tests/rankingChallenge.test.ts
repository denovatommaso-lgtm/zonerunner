import { describe, expect, it } from 'vitest';
import {
  applyRankingSnapshotToMonthlyChallenges,
  buildMonthlyChallengeViews,
  evaluateRankingStars,
  initMonthlyChallengesState,
  milestoneId,
  monthKeyFromEpochMsLocal,
} from '../lib/monthlyChallenges';

describe('ranking challenge progression', () => {
  it('evaluateRankingStars uses 25/10/3 thresholds', () => {
    expect(evaluateRankingStars({ scope: 'world', position: 1 })).toEqual({
      top25: true,
      top10: true,
      top3: true,
    });
    expect(evaluateRankingStars({ scope: 'state', position: 11 })).toEqual({
      top25: true,
      top10: false,
      top3: false,
    });
  });

  it('stage1 updates from state rank only', () => {
    const now = Date.now();
    const mk = monthKeyFromEpochMsLocal(now);
    let state = initMonthlyChallengesState(new Date(now));

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now,
      rank: 5,
      scope: 'state',
    }).nextState;

    const ranking = state.months[mk]?.challenges?.ranking;
    expect(ranking?.stage).toBe(1);
    expect(ranking?.starsEarned ?? 0).toBe(2);
    expect((ranking?.meta as any)?.scopes?.state?.stars?.top10).toBe(true);
    expect((ranking?.meta as any)?.scopes?.country).toBeUndefined();
  });

  it('stage2 updates from country rank only after stage1 completes', () => {
    const now = Date.now();
    const mk = monthKeyFromEpochMsLocal(now);
    let state = initMonthlyChallengesState(new Date(now));

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now,
      rank: 1,
      scope: 'state',
    }).nextState;

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now + 1000,
      rank: 2,
      scope: 'country',
    }).nextState;

    const ranking = state.months[mk]?.challenges?.ranking;
    expect(ranking?.stage).toBe(3);
    expect((ranking?.meta as any)?.scopes?.country?.stars?.top3).toBe(true);
    expect((ranking?.meta as any)?.scopes?.world).toBeUndefined();
  });

  it('ignores stage2 snapshots before stage1 is unlocked', () => {
    const now = Date.now();
    const mk = monthKeyFromEpochMsLocal(now);
    let state = initMonthlyChallengesState(new Date(now));

    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    if (isDev) {
      expect(() =>
        applyRankingSnapshotToMonthlyChallenges({
          state,
          atMs: now,
          rank: 2,
          scope: 'country',
        })
      ).toThrow();
      return;
    }
    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now,
      rank: 2,
      scope: 'country',
    }).nextState;

    const ranking = state.months[mk]?.challenges?.ranking;
    expect(ranking?.stage ?? 1).toBe(1);
    expect((ranking?.meta as any)?.scopes?.country).toBeUndefined();
  });

  it('stage3 updates from world rank only', () => {
    const now = Date.now();
    const mk = monthKeyFromEpochMsLocal(now);
    let state = initMonthlyChallengesState(new Date(now));

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now,
      rank: 1,
      scope: 'state',
    }).nextState;

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now + 1000,
      rank: 1,
      scope: 'country',
    }).nextState;

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now + 2000,
      rank: 1,
      scope: 'world',
    }).nextState;

    const ranking = state.months[mk]?.challenges?.ranking;
    expect(ranking?.stage).toBe(3);
    expect((ranking?.meta as any)?.scopes?.world?.stars?.top3).toBe(true);
  });

  it('ignores older snapshots for the same scope', () => {
    const now = Date.now();
    const mk = monthKeyFromEpochMsLocal(now);
    let state = initMonthlyChallengesState(new Date(now));

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now + 2000,
      rank: 1,
      scope: 'state',
    }).nextState;

    state = applyRankingSnapshotToMonthlyChallenges({
      state,
      atMs: now + 1000,
      rank: 20,
      scope: 'state',
    }).nextState;

    const ranking = state.months[mk]?.challenges?.ranking;
    expect((ranking?.meta as any)?.scopes?.state?.stars?.top3).toBe(true);
  });

  it('renders ranking stage progress from scoped meta', () => {
    const now = Date.now();
    const mk = monthKeyFromEpochMsLocal(now);
    const milestones = [
      milestoneId({ monthKey: mk, challengeId: 'ranking', stage: 1, star: 1 }),
      milestoneId({ monthKey: mk, challengeId: 'ranking', stage: 1, star: 2 }),
    ];
    const base = initMonthlyChallengesState(new Date(now));
    const seeded = {
      ...base,
      months: {
        ...base.months,
        [mk]: {
          monthKey: mk,
          appliedRunIds: [],
          appliedEventIds: [],
          challenges: {
            ranking: {
              stage: 1,
              progressValue: 0,
              starsEarned: 0,
              milestonesGranted: milestones,
              meta: {
                scopes: {
                  state: {
                    bestRank: 8,
                    lastKnownRank: 8,
                    lastRankCheckedAtMs: now,
                    stars: { top25: true, top10: true, top3: false },
                  },
                },
              },
            },
          },
        },
      },
    };

    const view = buildMonthlyChallengeViews(seeded, new Date(now));
    const rankingView = view.find((v) => v.id === 'ranking');
    expect(rankingView?.starsEarned ?? 0).toBe(2);
    expect(rankingView?.progressValue ?? 0).toBe(8);
  });
});

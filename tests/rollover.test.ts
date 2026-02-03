import { describe, expect, it } from 'vitest';

import {
  ensureMonthBucket,
  ensureMonthRollover,
  initMonthlyChallengesState,
} from '../lib/monthlyChallenges';
import { ensureYearRollover, initYearlyChallengesState } from '../lib/yearlyChallenges';

describe('rollover resets', () => {
  it('resets monthly unlocked stages and preserves history when the month changes', () => {
    const jan = new Date(2024, 0, 15, 12); // local time to avoid TZ shifts
    const feb = new Date(2024, 1, 2, 12);

    const base = ensureMonthBucket(initMonthlyChallengesState(jan), '2024-01');
    const withUnlocks = { ...base, stageUnlocked: { distance: 2, time: 3 } };

    const rolled = ensureMonthRollover(withUnlocks, feb);

    expect(rolled.stageUnlocked).toEqual({});
    expect(rolled.lastMonthKey).toBe('2024-02');
    expect(rolled.months['2024-02']).toBeTruthy();
    expect(rolled.months['2024-01']).toBeTruthy();
  });

  it('resets yearly unlocked stages when the year changes', () => {
    const base = initYearlyChallengesState(new Date(2024, 4, 1, 12));
    const withUnlocks = {
      ...base,
      stageUnlocked: { countries: 2 },
      years: {
        ...base.years,
        'YEAR-2024': {
          yearKey: 'YEAR-2024' as const,
          challenges: {},
          appliedRunIds: [],
          appliedEventIds: [],
        },
      },
    };

    const rolled = ensureYearRollover(withUnlocks, new Date(2025, 0, 1, 12));

    expect(rolled.stageUnlocked).toEqual({});
    expect(rolled.lastYearKey).toBe('YEAR-2025');
    expect(rolled.years['YEAR-2025']).toBeTruthy();
    expect(rolled.years['YEAR-2024']).toBeTruthy();
  });
});

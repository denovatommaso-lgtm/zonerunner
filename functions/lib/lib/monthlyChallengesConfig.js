"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthlyRankingConfig = exports.monthlyTerritoryRewardConfig = exports.monthlyXpConfig = exports.yearlyChallengeDefinitions = exports.monthlyChallenges = exports.monthlyPaceConfig = exports.monthlyTimeWindows = exports.monthlyRunQualification = exports.monthlyChallengeSettings = void 0;
exports.monthlyChallengeSettings = {
    version: 10,
    carryOverToNextStage: false,
    resetUnlockedStageOnMonthReset: true,
    maxHistoryMonths: 12,
};
exports.monthlyRunQualification = {
    // Used for challenges where we count runs/days, to avoid accidental “test” runs counting.
    // Qualify if distance OR moving time meets the minimum.
    minDistanceMeters: 600,
    minMovingSeconds: 180,
    qualifyMode: 'or',
};
exports.monthlyTimeWindows = {
    // Inclusive start (03:00), exclusive end (07:00).
    earlyBird: { startMinuteInclusive: 3 * 60, endMinuteExclusive: 7 * 60 },
    // Inclusive start (23:00), exclusive end (03:00 next day). Crosses midnight.
    nightOwl: { startMinuteInclusive: 23 * 60, endMinuteExclusive: 3 * 60 },
};
exports.monthlyPaceConfig = {
    // Pace is computed as the fastest continuous segment window.
    segmentMeters: 1000,
    // Minimum run distance required to consider pace segments (tunable).
    // Set to 1000 so ~1km runs qualify; increase if you want extra buffer for GPS noise.
    minRunDistanceMeters: 1000,
    // If the GPS polyline distance is slightly under the reported run distance, allow scaling
    // the polyline distances up to the reported total distance so 1.00 km runs can still qualify.
    // This avoids “no stars” when a run is exactly 1.00 km but the polyline sums to ~0.98–0.99 km.
    allowScalePolylineToRunDistance: true,
};
exports.monthlyChallenges = [
    {
        id: 'distance',
        baseLabel: 'Distance',
        unit: 'km',
        description: 'Total distance this month.',
        // Required by spec (3★ targets):
        stageTargets3Star: [50, 200, 300],
        maxStage: 3,
    },
    {
        id: 'time',
        baseLabel: 'Time on Feet',
        unit: 'sec',
        description: 'Moving time this month.',
        // Required by spec (3★ targets), stored in seconds:
        stageTargets3Star: [5 * 3600, 15 * 3600, 30 * 3600],
        maxStage: 3,
    },
    {
        id: 'pace',
        baseLabel: 'Pace',
        unit: 'paceSec',
        description: 'Fastest continuous 1 km segment this month.',
        // Required by spec (3★ targets), stored as best 1 km time in seconds (lower is better):
        // Pace I: 6:30, Pace II: 4:50, Pace III: 3:40
        stageTargets3Star: [6 * 60 + 30, 4 * 60 + 50, 3 * 60 + 40],
        maxStage: 3,
    },
    {
        id: 'friends',
        baseLabel: 'Friends',
        unit: 'count',
        description: 'Add new friends this month.',
        stageTargets3Star: [3, 10, 20],
        maxStage: 3,
    },
    {
        id: 'ranking',
        baseLabel: 'Ranking',
        unit: 'count',
        description: 'Progress across state, country, and world leaderboards.',
        // Stage I (State): Top 25 / Top 10 / Top 3
        // Stage II (Country): Top 25 / Top 10 / Top 3
        // Stage III (World): Top 25 / Top 10 / Top 3
        stageTargets3Star: [1, 1, 1],
        stageStarThresholds: [
            { one: 25, two: 10, three: 3 }, // State rank thresholds
            { one: 25, two: 10, three: 3 }, // Country rank thresholds
            { one: 25, two: 10, three: 3 }, // World rank thresholds
        ],
        maxStage: 3,
    },
    {
        id: 'consistency',
        baseLabel: 'Consistency',
        unit: 'count',
        description: 'Unique days this month with at least one qualifying run.',
        // 3★ targets required by spec:
        // - I: 7 days
        // - II: 16 days
        // - III: 30 days
        stageTargets3Star: [7, 16, 30],
        stageStarThresholds: [
            { one: 3, two: 5, three: 7 },
            { one: 7, two: 12, three: 16 },
            { one: 14, two: 22, three: 30 },
        ],
        maxStage: 3,
    },
    {
        id: 'longest',
        baseLabel: 'Longest Run',
        unit: 'km',
        description: 'Best single-run distance this month.',
        // 3★ targets required by spec:
        // - I: 8 km
        // - II: 21 km
        // - III: 42 km
        stageTargets3Star: [8, 21, 42],
        stageStarThresholds: [
            { one: 3, two: 6, three: 8 },
            { one: 10, two: 16, three: 21 },
            { one: 20, two: 30, three: 42 },
        ],
        maxStage: 3,
    },
    {
        id: 'earlyBird',
        baseLabel: 'Early Bird',
        unit: 'count',
        description: 'Qualifying runs started between 03:00 and 06:59 (local).',
        // Chosen 3★ targets (configurable):
        // - I: 4 runs (easy)
        // - II: 10 runs (habit-forming)
        // - III: 18 runs (challenging)
        stageTargets3Star: [4, 10, 18],
        stageStarThresholds: [
            { one: 1, two: 2, three: 4 },
            { one: 3, two: 6, three: 10 },
            { one: 6, two: 12, three: 18 },
        ],
        maxStage: 3,
    },
    {
        id: 'nightOwl',
        baseLabel: 'Night Owl',
        unit: 'count',
        description: 'Qualifying runs started between 23:00 and 02:59 (local).',
        // Chosen 3★ targets (configurable):
        // - I: 3 runs (easy)
        // - II: 8 runs (habit-forming)
        // - III: 15 runs (challenging)
        stageTargets3Star: [3, 8, 15],
        stageStarThresholds: [
            { one: 1, two: 2, three: 3 },
            { one: 2, two: 5, three: 8 },
            { one: 5, two: 10, three: 15 },
        ],
        maxStage: 3,
    },
];
// Yearly-only challenges (not part of monthly list).
exports.yearlyChallengeDefinitions = [
    {
        id: 'countries',
        baseLabel: 'Countries',
        unit: 'count',
        description: 'Log runs in different countries this year; each unique country counts once.',
        stageTargets3Star: [3, 6, 9],
        stageStarThresholds: [
            { one: 1, two: 2, three: 3 },
            { one: 4, two: 5, three: 6 },
            { one: 7, two: 8, three: 9 },
        ],
        maxStage: 3,
    },
    {
        id: 'states',
        baseLabel: 'States',
        unit: 'count',
        description: 'Log runs in different states/regions this year; each unique state counts once.',
        stageTargets3Star: [3, 6, 9],
        stageStarThresholds: [
            { one: 1, two: 2, three: 3 },
            { one: 4, two: 5, three: 6 },
            { one: 7, two: 8, three: 9 },
        ],
        maxStage: 3,
    },
];
exports.monthlyXpConfig = {
    // Total XP per stage if you earn all 3 stars (the per-star grants split this total).
    stageTotalXpByChallenge: {
        // Tuned for a monthly cadence; keep values even (see `xpForMilestone` rounding).
        distance: [0, 100, 220, 340],
        time: [0, 80, 160, 240],
        // Pace rewards are intentionally smaller than distance/time per spec.
        pace: [0, 50, 100, 150],
        friends: [0, 60, 120, 180],
        ranking: [0, 60, 120, 180],
        consistency: [0, 60, 120, 180],
        longest: [0, 80, 160, 240],
        earlyBird: [0, 40, 80, 120],
        nightOwl: [0, 40, 80, 120],
        // Yearly challenges: grant significantly more XP to reflect longer cadence.
        countries: [0, 150, 300, 450],
        states: [0, 180, 360, 540],
    },
    // Splits must sum to 1.0 (awarded at each star milestone).
    starSplit: {
        1: 0.33,
        2: 0.33,
        3: 0.34,
    },
};
// Territory reward scaling (configurable, can be applied to map/bonuses later).
exports.monthlyTerritoryRewardConfig = {
    baseRewardByChallenge: {
        distance: 2,
        time: 2,
        pace: 1,
        friends: 0,
        // Ranking rewards should be meaningful but smaller than distance/time.
        ranking: 1,
        consistency: 1,
        longest: 2,
        // Time-window challenges should be modest.
        earlyBird: 1,
        nightOwl: 1,
        countries: 1,
        states: 1,
    },
    stageMultiplier: [0, 1, 2, 3],
};
exports.monthlyRankingConfig = {
    // Throttle backend calls across triggers.
    minCheckIntervalMs: 2 * 60 * 1000,
};

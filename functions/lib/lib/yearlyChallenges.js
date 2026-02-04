"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initYearlyChallengesState = initYearlyChallengesState;
exports.ensureYearRollover = ensureYearRollover;
exports.applyRunToYearlyChallenges = applyRunToYearlyChallenges;
exports.buildYearlyChallengeViews = buildYearlyChallengeViews;
const monthlyChallengesConfig_1 = require("./monthlyChallengesConfig");
const monthlyChallenges_1 = require("./monthlyChallenges");
function yearKeyFromDate(d) {
    return `YEAR-${d.getFullYear()}`;
}
function initYearlyChallengesState(now = new Date()) {
    const yk = yearKeyFromDate(now);
    return {
        version: monthlyChallengesConfig_1.monthlyChallengeSettings.version,
        updatedAt: Date.now(),
        lastYearKey: yk,
        stageUnlocked: {},
        years: {},
        totalChallengeXp: 0,
        totalTerritoryReward: 0,
    };
}
function ensureYearBucket(state, yk) {
    const next = { ...state, years: { ...state.years } };
    if (!next.years[yk]) {
        next.years[yk] = {
            yearKey: yk,
            challenges: {},
            appliedRunIds: [],
            appliedEventIds: [],
        };
    }
    return next;
}
function ensureYearRollover(state, now = new Date()) {
    const yk = yearKeyFromDate(now);
    if (state.lastYearKey === yk)
        return state;
    let next = {
        ...state,
        lastYearKey: yk,
        updatedAt: Date.now(),
    };
    if (monthlyChallengesConfig_1.monthlyChallengeSettings.resetUnlockedStageOnMonthReset) {
        next = { ...next, stageUnlocked: {} };
    }
    next = ensureYearBucket(next, yk);
    return next;
}
function yearlyDefs() {
    return monthlyChallengesConfig_1.yearlyChallengeDefinitions;
}
function applyRunToYearlyChallenges(params) {
    const { state, runId, run } = params;
    const runDateRaw = new Date(run.startedAt);
    const runDate = Number.isFinite(runDateRaw.getTime()) ? runDateRaw : new Date();
    const yk = yearKeyFromDate(runDate);
    let next = ensureYearRollover(state, new Date());
    next = ensureYearBucket(next, yk);
    const year = next.years[yk];
    if (year.appliedRunIds.includes(runId))
        return { nextState: next, awardedMilestones: [] };
    const updatedYear = {
        ...year,
        appliedRunIds: [runId, ...year.appliedRunIds].slice(0, 500),
        appliedEventIds: [...year.appliedEventIds],
        challenges: { ...year.challenges },
    };
    const awarded = [];
    let xpDelta = 0;
    let territoryDelta = 0;
    for (const def of yearlyDefs()) {
        const unlocked = next.stageUnlocked[def.id] ?? 1;
        const existing = updatedYear.challenges[def.id];
        const stage = existing?.stage ?? unlocked;
        const stageMax = def.maxStage ?? def.stageTargets3Star.length;
        const safeStage = Math.min(Math.max(1, stage), stageMax);
        const thresholds = (0, monthlyChallenges_1.thresholdsForStage)(def, safeStage);
        const prevProgress = existing?.progressValue ?? 0;
        const prevStars = existing?.starsEarned ?? (0, monthlyChallenges_1.starsForProgress)(prevProgress, thresholds);
        const milestonesGranted = new Set(existing?.milestonesGranted ?? []);
        const codeRaw = def.id === 'countries'
            ? (run.countryCode ?? '').trim()
            : (run.stateCode ?? run.stateName ?? '').trim();
        if (!codeRaw) {
            if (__DEV__) {
                console.log('[YearlyChallenges] missing region info for run', runId, def.id);
            }
            // If we lack region info, keep existing progress and continue.
            updatedYear.challenges[def.id] = {
                stage: safeStage,
                progressValue: prevProgress,
                starsEarned: prevStars,
                milestonesGranted: Array.from(milestonesGranted),
            };
            continue;
        }
        const code = codeRaw.toUpperCase();
        const eventId = `${def.id}:${code}`;
        if (updatedYear.appliedEventIds.includes(eventId)) {
            updatedYear.challenges[def.id] = {
                stage: safeStage,
                progressValue: prevProgress,
                starsEarned: prevStars,
                milestonesGranted: Array.from(milestonesGranted),
            };
            continue;
        }
        updatedYear.appliedEventIds = [eventId, ...updatedYear.appliedEventIds].slice(0, 500);
        const nextProgress = prevProgress + 1;
        const nextStars = (0, monthlyChallenges_1.starsForProgress)(nextProgress, thresholds);
        for (const star of [1, 2, 3]) {
            if (nextStars >= star && prevStars < star) {
                const mid = (0, monthlyChallenges_1.milestoneId)({ monthKey: yk, challengeId: def.id, stage: safeStage, star });
                if (!milestonesGranted.has(mid)) {
                    milestonesGranted.add(mid);
                    awarded.push(mid);
                    xpDelta += (0, monthlyChallenges_1.xpForMilestone)(def.id, safeStage, star);
                    territoryDelta += (0, monthlyChallenges_1.territoryRewardForMilestone)(def.id, safeStage, star);
                }
            }
        }
        const canAdvance = nextStars >= 3 && safeStage < stageMax;
        if (canAdvance) {
            const newlyUnlocked = Math.max(unlocked, safeStage + 1);
            next.stageUnlocked = { ...next.stageUnlocked, [def.id]: newlyUnlocked };
            if (!monthlyChallengesConfig_1.monthlyChallengeSettings.carryOverToNextStage) {
                updatedYear.challenges[def.id] = {
                    stage: newlyUnlocked,
                    progressValue: 0,
                    starsEarned: 0,
                    milestonesGranted: [],
                };
                continue;
            }
        }
        updatedYear.challenges[def.id] = {
            stage: safeStage,
            progressValue: nextProgress,
            starsEarned: nextStars,
            milestonesGranted: Array.from(milestonesGranted),
        };
    }
    next = {
        ...next,
        years: { ...next.years, [yk]: updatedYear },
        totalChallengeXp: (next.totalChallengeXp ?? 0) + xpDelta,
        totalTerritoryReward: (next.totalTerritoryReward ?? 0) + territoryDelta,
        updatedAt: Date.now(),
    };
    return { nextState: next, awardedMilestones: awarded };
}
function buildYearlyChallengeViews(state, now = new Date()) {
    const yk = yearKeyFromDate(now);
    const year = state.years[yk] ?? { yearKey: yk, challenges: {}, appliedRunIds: [], appliedEventIds: [] };
    return yearlyDefs().map((def) => {
        const unlocked = state.stageUnlocked[def.id] ?? 1;
        const ch = year.challenges[def.id];
        const stage = Math.max(unlocked, ch?.stage ?? 0);
        const safeStage = Math.min(Math.max(1, stage), def.maxStage);
        const thresholds = (0, monthlyChallenges_1.thresholdsForStage)(def, safeStage);
        const progressValue = ch?.progressValue ?? 0;
        const computedStars = (0, monthlyChallenges_1.starsForProgress)(progressValue, thresholds);
        const starsEarned = Math.max(ch?.starsEarned ?? 0, computedStars);
        let nextStarTarget;
        if (starsEarned < 1)
            nextStarTarget = thresholds.one;
        else if (starsEarned < 2)
            nextStarTarget = thresholds.two;
        else if (starsEarned < 3)
            nextStarTarget = thresholds.three;
        const earnedXpThisStage = (starsEarned >= 1 ? (0, monthlyChallenges_1.xpForMilestone)(def.id, safeStage, 1) : 0) +
            (starsEarned >= 2 ? (0, monthlyChallenges_1.xpForMilestone)(def.id, safeStage, 2) : 0) +
            (starsEarned >= 3 ? (0, monthlyChallenges_1.xpForMilestone)(def.id, safeStage, 3) : 0);
        const totalXp = monthlyChallengesConfig_1.monthlyXpConfig.stageTotalXpByChallenge[def.id]?.[safeStage] ?? 0;
        const nextMilestoneXp = starsEarned < 3 ? (0, monthlyChallenges_1.xpForMilestone)(def.id, safeStage, (starsEarned + 1)) : undefined;
        return {
            id: def.id,
            baseLabel: def.baseLabel,
            title: `${def.baseLabel} ${(0, monthlyChallenges_1.romanNumeral)(safeStage)}`,
            description: def.description,
            unit: def.unit,
            stage: safeStage,
            stageMax: def.maxStage,
            progressValue,
            starsEarned,
            starThresholds: thresholds,
            nextStarTarget,
            earnedXpThisStage,
            stageTotalXp: totalXp,
            nextMilestoneXp,
            meta: {},
        };
    });
}

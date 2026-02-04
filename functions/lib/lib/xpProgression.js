"use strict";
/**
 * XP / Level progression utilities.
 *
 * Design goals:
 * - Early levels are quick: low base cost keeps new players hooked.
 * - Mid game stretches: gentle exponential + polynomial term slows growth smoothly.
 * - Late game is a satisfying grind without cliffs: growth factor is < 1.2 so it ramps but never spikes.
 *
 * Curve (XP to go from level L -> L+1):
 *   xpToNext(L) = base * (growth ^ (L - 1)) + linear * L^curve
 *
 * Tuning knobs (edit below):
 * - base: lowers/raises the whole curve (early-game pacing).
 * - growth: exponential slope (mid/late pacing). Keep ~1.08–1.16 for smoothness.
 * - linear: adds a polynomial tail so levels don’t feel flat in the mid-game.
 * - curve: exponent for the polynomial term; 1.3–1.6 is a good sweet spot.
 *
 * XP sources (example weights):
 * - Distance: 5 XP per km (reward every run without breaking the curve).
 * - Territory: 80 XP per km² (rarer, more rewarding).
 * - Challenges: pass-through XP defined per challenge (lets you tune events).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultXPConfig = void 0;
exports.createXPConfig = createXPConfig;
exports.xpToNextLevel = xpToNextLevel;
exports.totalXpForLevel = totalXpForLevel;
exports.xpFromSources = xpFromSources;
exports.applyXpGain = applyXpGain;
exports.sampleCurve = sampleCurve;
exports.levelFromTotalXp = levelFromTotalXp;
exports.buildXpTable = buildXpTable;
exports.describeLevel = describeLevel;
exports.defaultXPConfig = {
    // Retuned to make early levels faster so a couple of stage-1 challenges can push past level 2.
    base: 55,
    growth: 1.1,
    linear: 12,
    curve: 1.3,
    sources: {
        distanceXpPerKm: 5,
        territoryXpPerKm2: 80,
    },
};
/**
 * Merge partial overrides with defaults for easier tuning.
 */
function createXPConfig(overrides) {
    return {
        ...exports.defaultXPConfig,
        ...overrides,
        sources: {
            ...exports.defaultXPConfig.sources,
            ...(overrides.sources || {}),
        },
    };
}
/**
 * XP required to go from level L to L+1.
 * Smooth scaling using a blended exponential + polynomial curve.
 */
function xpToNextLevel(level, cfg = exports.defaultXPConfig) {
    const safeLevel = Math.max(1, Math.floor(level));
    const expPart = cfg.base * Math.pow(cfg.growth, safeLevel - 1);
    const polyPart = cfg.linear * Math.pow(safeLevel, cfg.curve);
    return Math.round(expPart + polyPart);
}
/**
 * Total cumulative XP required to reach a target level (from level 1, 0 XP).
 */
function totalXpForLevel(level, cfg = exports.defaultXPConfig) {
    const safeLevel = Math.max(1, Math.floor(level));
    let total = 0;
    for (let l = 1; l < safeLevel; l++) {
        total += xpToNextLevel(l, cfg);
    }
    return total;
}
/**
 * Calculate XP from multiple sources in one run/session.
 * You can tune the per-source weights in the config.
 */
function xpFromSources(params, cfg = exports.defaultXPConfig) {
    const distance = Math.max(0, params.distanceKm ?? 0);
    const territory = Math.max(0, params.territoryKm2 ?? 0);
    const challenge = Math.max(0, params.challengeXp ?? 0);
    const xpFromDistance = distance * cfg.sources.distanceXpPerKm;
    const xpFromTerritory = territory * cfg.sources.territoryXpPerKm2;
    return Math.round(xpFromDistance + xpFromTerritory + challenge);
}
/**
 * Apply XP gain and return the new level/Xp state.
 * Handles multiple level-ups if a big XP payload arrives at once.
 */
function applyXpGain(currentLevel, currentXp, gainedXp, cfg = exports.defaultXPConfig) {
    let level = Math.max(1, currentLevel);
    let xp = Math.max(0, currentXp) + Math.max(0, gainedXp);
    let levelsGained = 0;
    // Loop in case a single gain jumps multiple levels.
    while (xp >= xpToNextLevel(level, cfg)) {
        xp -= xpToNextLevel(level, cfg);
        level += 1;
        levelsGained += 1;
    }
    return {
        newLevel: level,
        newXp: xp,
        leveledUp: levelsGained > 0,
        levelsGained,
    };
}
/**
 * Helper to preview/inspect the curve for tuning.
 */
function sampleCurve(maxLevel, cfg = exports.defaultXPConfig) {
    const rows = [];
    let total = 0;
    for (let l = 1; l <= maxLevel; l++) {
        const toNext = xpToNextLevel(l, cfg);
        total += toNext;
        rows.push({ level: l, toNext, total });
    }
    return rows;
}
/**
 * Compute level state from a total XP pool (no per-step history required).
 */
function levelFromTotalXp(totalXp, cfg = exports.defaultXPConfig) {
    let level = 1;
    let xp = Math.max(0, totalXp);
    while (xp >= xpToNextLevel(level, cfg)) {
        xp -= xpToNextLevel(level, cfg);
        level += 1;
    }
    const xpForNext = xpToNextLevel(level, cfg);
    const progressPct = xpForNext > 0 ? Math.min(1, xp / xpForNext) : 0;
    return {
        level,
        xpIntoLevel: xp,
        xpForNext,
        progressPct,
        totalXp: totalXp,
    };
}
/**
 * Precompute XP tables for faster lookup in UI (avoids looping per render).
 */
function buildXpTable(maxLevel, cfg = exports.defaultXPConfig) {
    const table = [];
    let total = 0;
    for (let l = 1; l <= maxLevel; l++) {
        const toNext = xpToNextLevel(l, cfg);
        total += toNext;
        table.push({ level: l, toNext, total });
    }
    return table;
}
/**
 * Describe a level with progress into it (for UI).
 */
function describeLevel(currentLevel, currentXp, cfg = exports.defaultXPConfig) {
    const level = Math.max(1, Math.floor(currentLevel));
    const xpIntoLevel = Math.max(0, currentXp);
    const toNext = xpToNextLevel(level, cfg);
    const pct = toNext > 0 ? Math.min(1, xpIntoLevel / toNext) : 0;
    return { level, xpIntoLevel, toNext, progressPct: pct };
}

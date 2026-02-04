"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rewardsByCategory = void 0;
exports.getUnlockLevel = getUnlockLevel;
exports.getHighestUnlockedTier = getHighestUnlockedTier;
exports.isTierUnlocked = isTierUnlocked;
exports.getEffectiveTier = getEffectiveTier;
exports.getNextUnlock = getNextUnlock;
const rewardsConfig_1 = require("./rewardsConfig");
const rewardSchedule_1 = require("./rewards/rewardSchedule");
function getUnlockLevel(category, tier) {
    return (0, rewardSchedule_1.getRequiredLevel)(category === 'levelBorderStyle' ? 'borderStyle' : 'tier', tier);
}
function getHighestUnlockedTier(level, category) {
    const defs = rewardsConfig_1.rewardDefinitions.filter((d) => d.category === category);
    const unlocked = defs.filter((d) => level >= getUnlockLevel(category, d.tier)).sort((a, b) => getUnlockLevel(category, a.tier) - getUnlockLevel(category, b.tier));
    return unlocked.length ? unlocked[unlocked.length - 1].tier : 'default';
}
function isTierUnlocked(level, tier, category) {
    return level >= getUnlockLevel(category, tier);
}
function getEffectiveTier(params) {
    const { level, mode, selectedTier, category } = params;
    if (mode === 'manual' && selectedTier && isTierUnlocked(level, selectedTier, category)) {
        return selectedTier;
    }
    return getHighestUnlockedTier(level, category);
}
function getNextUnlock(level, category) {
    const defs = rewardsConfig_1.rewardDefinitions.filter((d) => d.category === category);
    const next = defs
        .map((d) => ({ tier: d.tier, unlockLevel: getUnlockLevel(category, d.tier) }))
        .filter((t) => t.unlockLevel > level)
        .sort((a, b) => a.unlockLevel - b.unlockLevel)[0];
    return next ?? null;
}
exports.rewardsByCategory = rewardsConfig_1.rewardDefinitions.reduce((acc, r) => {
    acc[r.category] = acc[r.category] ? [...acc[r.category], r] : [r];
    return acc;
}, {});

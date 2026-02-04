"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLevelBorderTier = resolveLevelBorderTier;
exports.resolveLevelBorderStyleTier = resolveLevelBorderStyleTier;
exports.resolveTerritoryNameTier = resolveTerritoryNameTier;
const rewardsHelpers_1 = require("./rewardsHelpers");
function resolveLevelBorderTier(level, profile) {
    const mode = profile?.levelBorderMode ?? 'auto';
    const selected = profile?.selectedLevelBorderTier ?? 'default';
    return (0, rewardsHelpers_1.getEffectiveTier)({
        level,
        mode,
        selectedTier: selected,
        category: 'levelBorder',
    });
}
function resolveLevelBorderStyleTier(level, profile) {
    const mode = profile?.levelBorderStyleMode ?? profile?.levelBorderMode ?? 'auto';
    const selected = profile?.selectedLevelBorderStyleTier ??
        profile?.selectedLevelBorderTier ??
        'default';
    return (0, rewardsHelpers_1.getEffectiveTier)({
        level,
        mode,
        selectedTier: selected,
        category: 'levelBorderStyle',
    });
}
function resolveTerritoryNameTier(level, profile) {
    const mode = profile?.territoryNameStyleMode ?? 'auto';
    const selected = profile?.selectedTerritoryNameStyleTier ?? 'default';
    return (0, rewardsHelpers_1.getEffectiveTier)({
        level,
        mode,
        selectedTier: selected,
        category: 'territoryNameStyle',
    });
}

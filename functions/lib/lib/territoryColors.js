"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TERRITORY_COLOR_ID = void 0;
exports.getAllColors = getAllColors;
exports.findColorById = findColorById;
exports.findColorByHex = findColorByHex;
exports.isColorUnlocked = isColorUnlocked;
exports.getUnlockedColors = getUnlockedColors;
exports.getNextUnlock = getNextUnlock;
exports.validateTerritoryColorSelection = validateTerritoryColorSelection;
exports.unlockedCount = unlockedCount;
const rewardSchedule_1 = require("./rewards/rewardSchedule");
exports.DEFAULT_TERRITORY_COLOR_ID = 'blue_basic';
const palette = Object.freeze([
    { id: 'blue_basic', name: 'Blue', hex: '#1e90ff', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'blue_basic') },
    { id: 'red_basic', name: 'Red', hex: '#ef4444', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'red_basic') },
    { id: 'green_basic', name: 'Green', hex: '#22c55e', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'green_basic') },
    { id: 'gray_basic', name: 'Slate Gray', hex: '#94a3b8', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'gray_basic') },
    { id: 'custom', name: 'Custom', hex: '#ffffff', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'custom') },
    { id: 'orange', name: 'Orange', hex: '#f97316', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'orange') },
    { id: 'yellow', name: 'Yellow', hex: '#eab308', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'yellow') },
    { id: 'purple', name: 'Purple', hex: '#a855f7', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'purple') },
    { id: 'pink', name: 'Pink', hex: '#ec4899', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'pink') },
    { id: 'teal', name: 'Teal', hex: '#14b8a6', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'teal') },
    { id: 'cyan', name: 'Cyan', hex: '#06b6d4', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'cyan') },
    { id: 'indigo', name: 'Indigo', hex: '#6366f1', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'indigo') },
    { id: 'lime', name: 'Lime', hex: '#84cc16', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'lime') },
    { id: 'emerald', name: 'Emerald', hex: '#10b981', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'emerald') },
    { id: 'violet_deep', name: 'Deep Violet', hex: '#7c3aed', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'violet_deep') },
    { id: 'rose', name: 'Rose', hex: '#f43f5e', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'rose') },
    { id: 'sky', name: 'Sky', hex: '#38bdf8', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'sky') },
    { id: 'mint', name: 'Mint', hex: '#2dd4bf', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'mint') },
    { id: 'navy', name: 'Navy', hex: '#1e3a8a', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'navy') },
    { id: 'crimson', name: 'Crimson', hex: '#dc2626', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'crimson') },
    { id: 'forest', name: 'Forest', hex: '#166534', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'forest') },
    { id: 'chocolate', name: 'Chocolate', hex: '#7c2d12', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'chocolate') },
    { id: 'gold', name: 'Gold', hex: '#d4af37', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'gold') },
    { id: 'platinum', name: 'Platinum', hex: '#e5e7eb', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'platinum') },
    { id: 'neon_purple', name: 'Neon Purple', hex: '#c026d3', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'neon_purple') },
    { id: 'neon_cyan', name: 'Neon Cyan', hex: '#22d3ee', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'neon_cyan') },
    { id: 'neon_lime', name: 'Neon Lime', hex: '#a3e635', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'neon_lime') },
    { id: 'obsidian', name: 'Obsidian', hex: '#0b0f1a', requiredLevel: (0, rewardSchedule_1.getRequiredLevel)('color', 'obsidian') },
]);
const paletteById = new Map(palette.map((color) => [color.id, color]));
const paletteByHex = new Map(palette.map((color) => [color.hex, color]));
const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;
function normalizeHex(hex) {
    if (!HEX_COLOR_RE.test(hex))
        return null;
    return hex.toLowerCase();
}
// UNUSED (repo-wide): kept for potential future use.
function getAllColors() {
    return [...palette];
}
// UNUSED (repo-wide): kept for potential future use.
function findColorById(id) {
    if (!id)
        return undefined;
    return paletteById.get(id);
}
function findColorByHex(hex) {
    if (!hex)
        return undefined;
    const normalized = normalizeHex(hex);
    if (!normalized)
        return undefined;
    return paletteByHex.get(normalized);
}
// UNUSED (repo-wide): kept for potential future use.
function isColorUnlocked(colorId, level) {
    const color = findColorById(colorId);
    if (!color)
        return false;
    return level >= color.requiredLevel;
}
// UNUSED (repo-wide): kept for potential future use.
function getUnlockedColors(level) {
    return palette.filter((c) => isColorUnlocked(c.id, level));
}
// UNUSED (repo-wide): kept for potential future use.
function getNextUnlock(level) {
    const locked = palette.filter((c) => !isColorUnlocked(c.id, level));
    if (!locked.length)
        return null;
    return locked.reduce((next, c) => {
        if (!next)
            return c;
        return c.requiredLevel < next.requiredLevel ? c : next;
    }, null);
}
function validateTerritoryColorSelection(colorId, level, customHex) {
    if (colorId === 'custom') {
        const customEntry = findColorById('custom');
        if (customEntry && isColorUnlocked('custom', level)) {
            const normalizedCustom = customHex ? normalizeHex(customHex) : null;
            return { ...customEntry, hex: normalizedCustom ?? customEntry.hex };
        }
    }
    const target = findColorById(colorId ?? '') ?? findColorByHex(colorId ?? '');
    if (target && isColorUnlocked(target.id, level))
        return target;
    // If locked or unknown, fall back to default.
    const fallback = findColorById(exports.DEFAULT_TERRITORY_COLOR_ID);
    return fallback;
}
// UNUSED (repo-wide): kept for potential future use.
function unlockedCount(level) {
    return getUnlockedColors(level).length;
}

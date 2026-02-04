"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REWARD_SCHEDULE = exports.DEFAULT_UNLOCKS = void 0;
exports.getRequiredLevel = getRequiredLevel;
exports.isUnlocked = isUnlocked;
exports.getAllColorsWithRequiredLevels = getAllColorsWithRequiredLevels;
exports.getAllBorderStylesWithRequiredLevels = getAllBorderStylesWithRequiredLevels;
exports.getAllTiersWithRequiredLevels = getAllTiersWithRequiredLevels;
exports.getNextReward = getNextReward;
exports.getUpcomingRewards = getUpcomingRewards;
exports.DEFAULT_UNLOCKS = {
    level: 0,
    colors: ['blue_basic', 'red_basic', 'green_basic', 'gray_basic'],
    borderStyle: 'default',
    tier: 'default',
};
const colorDefinitions = [
    { id: 'blue_basic', title: 'Blue', hex: '#1E90FF' },
    { id: 'red_basic', title: 'Red', hex: '#EF4444' },
    { id: 'green_basic', title: 'Green', hex: '#22C55E' },
    { id: 'gray_basic', title: 'Slate Gray', hex: '#94A3B8' },
    { id: 'custom', title: 'Custom', hex: '#ffffff' },
    { id: 'orange', title: 'Orange', hex: '#F97316' },
    { id: 'yellow', title: 'Yellow', hex: '#EAB308' },
    { id: 'purple', title: 'Purple', hex: '#A855F7' },
    { id: 'pink', title: 'Pink', hex: '#EC4899' },
    { id: 'teal', title: 'Teal', hex: '#14B8A6' },
    { id: 'cyan', title: 'Cyan', hex: '#06B6D4' },
    { id: 'indigo', title: 'Indigo', hex: '#6366F1' },
    { id: 'lime', title: 'Lime', hex: '#84CC16' },
    { id: 'emerald', title: 'Emerald', hex: '#10B981' },
    { id: 'violet_deep', title: 'Deep Violet', hex: '#7C3AED' },
    { id: 'rose', title: 'Rose', hex: '#F43F5E' },
    { id: 'sky', title: 'Sky', hex: '#38BDF8' },
    { id: 'mint', title: 'Mint', hex: '#2DD4BF' },
    { id: 'navy', title: 'Navy', hex: '#1E3A8A' },
    { id: 'crimson', title: 'Crimson', hex: '#DC2626' },
    { id: 'forest', title: 'Forest', hex: '#166534' },
    { id: 'chocolate', title: 'Chocolate', hex: '#7C2D12' },
    { id: 'gold', title: 'Gold', hex: '#D4AF37' },
    { id: 'platinum', title: 'Platinum', hex: '#E5E7EB' },
    { id: 'neon_purple', title: 'Neon Purple', hex: '#C026D3' },
    { id: 'neon_cyan', title: 'Neon Cyan', hex: '#22D3EE' },
    { id: 'neon_lime', title: 'Neon Lime', hex: '#A3E635' },
    { id: 'obsidian', title: 'Obsidian', hex: '#0B0F1A' },
];
const colorLevels = {
    blue_basic: 0,
    red_basic: 0,
    green_basic: 0,
    gray_basic: 0,
    custom: 49,
    orange: 2,
    yellow: 3,
    purple: 4,
    pink: 7,
    teal: 8,
    cyan: 9,
    indigo: 12,
    lime: 13,
    emerald: 14,
    violet_deep: 17,
    rose: 18,
    sky: 19,
    mint: 20,
    navy: 21,
    crimson: 22,
    forest: 23,
    chocolate: 24,
    gold: 26,
    platinum: 27,
    neon_purple: 28,
    neon_cyan: 29,
    neon_lime: 30,
    obsidian: 31,
};
exports.REWARD_SCHEDULE = [
    { level: 1, type: 'borderStyle', id: 'bronze', title: 'Dashed Border', description: 'Unlocks dashed profile border style.', payload: { style: 'bronze' } },
    { level: 2, type: 'color', id: 'orange', title: 'Orange Territory', description: 'Territory color unlocked.', payload: { hex: '#F97316' } },
    { level: 3, type: 'color', id: 'yellow', title: 'Yellow Territory', description: 'Territory color unlocked.', payload: { hex: '#EAB308' } },
    { level: 4, type: 'color', id: 'purple', title: 'Purple Territory', description: 'Territory color unlocked.', payload: { hex: '#A855F7' } },
    { level: 5, type: 'tier', id: 'bronze', title: 'Bronze Tier', description: 'Bronze profile tier unlocked.', payload: { tier: 'bronze' } },
    { level: 6, type: 'borderStyle', id: 'silver', title: 'Dotted Border', description: 'Unlocks dotted profile border style.', payload: { style: 'silver' } },
    { level: 7, type: 'color', id: 'pink', title: 'Pink Territory', description: 'Territory color unlocked.', payload: { hex: '#EC4899' } },
    { level: 8, type: 'color', id: 'teal', title: 'Teal Territory', description: 'Territory color unlocked.', payload: { hex: '#14B8A6' } },
    { level: 9, type: 'color', id: 'cyan', title: 'Cyan Territory', description: 'Territory color unlocked.', payload: { hex: '#06B6D4' } },
    { level: 10, type: 'tier', id: 'silver', title: 'Silver Tier', description: 'Silver profile tier unlocked.', payload: { tier: 'silver' } },
    { level: 11, type: 'borderStyle', id: 'gold', title: 'Zigzag Border', description: 'Unlocks zigzag profile border style.', payload: { style: 'gold' } },
    { level: 12, type: 'color', id: 'indigo', title: 'Indigo Territory', description: 'Territory color unlocked.', payload: { hex: '#6366F1' } },
    { level: 13, type: 'color', id: 'lime', title: 'Lime Territory', description: 'Territory color unlocked.', payload: { hex: '#84CC16' } },
    { level: 14, type: 'color', id: 'emerald', title: 'Emerald Territory', description: 'Territory color unlocked.', payload: { hex: '#10B981' } },
    { level: 15, type: 'tier', id: 'gold', title: 'Gold Tier', description: 'Gold profile tier unlocked.', payload: { tier: 'gold' } },
    { level: 16, type: 'borderStyle', id: 'platinum', title: 'Pulsing Border', description: 'Unlocks pulsing profile border style.', payload: { style: 'platinum' } },
    { level: 17, type: 'color', id: 'violet_deep', title: 'Deep Violet Territory', description: 'Territory color unlocked.', payload: { hex: '#7C3AED' } },
    { level: 18, type: 'color', id: 'rose', title: 'Rose Territory', description: 'Territory color unlocked.', payload: { hex: '#F43F5E' } },
    { level: 19, type: 'color', id: 'sky', title: 'Sky Territory', description: 'Territory color unlocked.', payload: { hex: '#38BDF8' } },
    { level: 20, type: 'color', id: 'mint', title: 'Mint Territory', description: 'Territory color unlocked.', payload: { hex: '#2DD4BF' } },
    { level: 21, type: 'color', id: 'navy', title: 'Navy Territory', description: 'Territory color unlocked.', payload: { hex: '#1E3A8A' } },
    { level: 22, type: 'color', id: 'crimson', title: 'Crimson Territory', description: 'Territory color unlocked.', payload: { hex: '#DC2626' } },
    { level: 23, type: 'color', id: 'forest', title: 'Forest Territory', description: 'Territory color unlocked.', payload: { hex: '#166534' } },
    { level: 24, type: 'color', id: 'chocolate', title: 'Chocolate Territory', description: 'Territory color unlocked.', payload: { hex: '#7C2D12' } },
    { level: 25, type: 'tier', id: 'platinum', title: 'Platinum Tier', description: 'Platinum profile tier unlocked.', payload: { tier: 'platinum' } },
    { level: 26, type: 'color', id: 'gold', title: 'Gold Territory', description: 'Territory color unlocked.', payload: { hex: '#D4AF37' } },
    { level: 27, type: 'color', id: 'platinum', title: 'Platinum Territory', description: 'Territory color unlocked.', payload: { hex: '#E5E7EB' } },
    { level: 28, type: 'color', id: 'neon_purple', title: 'Neon Purple Territory', description: 'Territory color unlocked.', payload: { hex: '#C026D3' } },
    { level: 29, type: 'color', id: 'neon_cyan', title: 'Neon Cyan Territory', description: 'Territory color unlocked.', payload: { hex: '#22D3EE' } },
    { level: 30, type: 'color', id: 'neon_lime', title: 'Neon Lime Territory', description: 'Territory color unlocked.', payload: { hex: '#A3E635' } },
    { level: 31, type: 'color', id: 'obsidian', title: 'Obsidian Territory', description: 'Territory color unlocked.', payload: { hex: '#0B0F1A' } },
    { level: 48, type: 'borderStyle', id: 'animated', title: 'Animated Border', description: 'Animated border style unlocked.', payload: { style: 'animated' } },
    { level: 49, type: 'color', id: 'custom', title: 'Custom Color', description: 'Pick any color via RGB wheel.', payload: { hex: '#ffffff' } },
    { level: 50, type: 'tier', id: 'animated', title: 'Animated Tier', description: 'Animated profile tier unlocked.', payload: { tier: 'animated' } },
];
const scheduleMap = new Map();
exports.REWARD_SCHEDULE.forEach((entry) => {
    const key = `${entry.type}:${entry.id}`;
    scheduleMap.set(key, entry);
});
function levelMapForType(type) {
    return new Map(exports.REWARD_SCHEDULE.filter((e) => e.type === type).map((e) => [e.id, e.level]));
}
const colorLevelMap = levelMapForType('color');
const borderStyleLevelMap = levelMapForType('borderStyle');
const tierLevelMap = levelMapForType('tier');
function getRequiredLevel(type, id) {
    if (type === 'color' && exports.DEFAULT_UNLOCKS.colors.includes(id))
        return 0;
    if (type === 'borderStyle' && id === exports.DEFAULT_UNLOCKS.borderStyle)
        return 0;
    if (type === 'tier' && id === exports.DEFAULT_UNLOCKS.tier)
        return 0;
    const map = type === 'color' ? colorLevelMap : type === 'borderStyle' ? borderStyleLevelMap : tierLevelMap;
    return map.get(id) ?? Number.MAX_SAFE_INTEGER;
}
function isUnlocked(playerLevel, type, id) {
    return playerLevel >= getRequiredLevel(type, id);
}
function getAllColorsWithRequiredLevels() {
    return colorDefinitions
        .map((c) => ({
        ...c,
        requiredLevel: getRequiredLevel('color', c.id),
    }))
        .sort((a, b) => a.requiredLevel - b.requiredLevel || a.title.localeCompare(b.title));
}
function getAllBorderStylesWithRequiredLevels() {
    const ordered = [
        { id: 'default', title: 'Solid' },
        { id: 'bronze', title: 'Dashed' },
        { id: 'silver', title: 'Dotted' },
        { id: 'gold', title: 'Zigzag' },
        { id: 'platinum', title: 'Pulsing' },
        { id: 'animated', title: 'Animated' },
    ];
    return ordered.map((s) => ({
        ...s,
        requiredLevel: getRequiredLevel('borderStyle', s.id),
    }));
}
function getAllTiersWithRequiredLevels() {
    const ordered = [
        { id: 'default', title: 'Default' },
        { id: 'bronze', title: 'Bronze' },
        { id: 'silver', title: 'Silver' },
        { id: 'gold', title: 'Gold' },
        { id: 'platinum', title: 'Platinum' },
        { id: 'animated', title: 'Animated Tier' },
    ];
    return ordered.map((t) => ({
        ...t,
        requiredLevel: getRequiredLevel('tier', t.id),
    }));
}
function getNextReward(playerLevel) {
    const next = exports.REWARD_SCHEDULE.filter((r) => r.level > playerLevel).sort((a, b) => a.level - b.level)[0];
    return next ?? null;
}
function getUpcomingRewards(playerLevel, count = 3) {
    return exports.REWARD_SCHEDULE.filter((r) => r.level > playerLevel)
        .sort((a, b) => a.level - b.level)
        .slice(0, count);
}
// Dev assertion to prevent duplicate levels (except starter level 0 pack).
if (__DEV__) {
    const levelCounts = {};
    exports.REWARD_SCHEDULE.forEach((entry) => {
        levelCounts[entry.level] = levelCounts[entry.level] ? [...levelCounts[entry.level], entry] : [entry];
    });
    Object.entries(levelCounts).forEach(([level, entries]) => {
        if (Number(level) === 0)
            return;
        if (entries.length > 1) {
            console.error('Duplicate reward levels detected', level, entries);
        }
    });
}

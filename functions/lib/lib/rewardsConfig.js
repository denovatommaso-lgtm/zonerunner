"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rewardDefinitionsById = exports.rewardDefinitions = exports.tierUnlockLevels = void 0;
exports.tierUnlockLevels = {
    default: 0,
    bronze: 5,
    silver: 10,
    gold: 15,
    platinum: 25,
    animated: 50,
};
const territoryNameStyleDefinitions = [
    ['default', 'Default name style'],
    ['bronze', 'Bronze glow'],
    ['silver', 'Silver glow'],
    ['gold', 'Gold glow'],
    ['platinum', 'Platinum glow'],
    ['animated', 'Animated shimmer'],
].map(([tier, desc]) => ({
    id: `territoryNameStyle:${tier}`,
    category: 'territoryNameStyle',
    tier: tier,
    unlockLevel: exports.tierUnlockLevels[tier],
    displayName: tier.charAt(0).toUpperCase() + tier.slice(1),
    shortDescription: desc,
}));
const levelBorderDefinitions = [
    ['default', 'Default border'],
    ['bronze', 'Bronze edge'],
    ['silver', 'Silver edge'],
    ['gold', 'Gold edge'],
    ['platinum', 'Platinum edge'],
    ['animated', 'Animated edge'],
].map(([tier, desc]) => ({
    id: `levelBorder:${tier}`,
    category: 'levelBorder',
    tier: tier,
    unlockLevel: exports.tierUnlockLevels[tier],
    displayName: tier.charAt(0).toUpperCase() + tier.slice(1),
    shortDescription: desc,
}));
const levelBorderStyleDefinitions = [
    { id: 'levelBorderStyle:default', category: 'levelBorderStyle', tier: 'default', unlockLevel: 0, displayName: 'Solid', shortDescription: 'Solid' },
    { id: 'levelBorderStyle:bronze', category: 'levelBorderStyle', tier: 'bronze', unlockLevel: 1, displayName: 'Dashed', shortDescription: 'Dashed' },
    { id: 'levelBorderStyle:silver', category: 'levelBorderStyle', tier: 'silver', unlockLevel: 6, displayName: 'Dotted', shortDescription: 'Dotted' },
    { id: 'levelBorderStyle:gold', category: 'levelBorderStyle', tier: 'gold', unlockLevel: 11, displayName: 'Zigzag', shortDescription: 'Zigzag' },
    { id: 'levelBorderStyle:platinum', category: 'levelBorderStyle', tier: 'platinum', unlockLevel: 16, displayName: 'Pulsing', shortDescription: 'Pulsing' },
    { id: 'levelBorderStyle:animated', category: 'levelBorderStyle', tier: 'animated', unlockLevel: 49, displayName: 'Animated', shortDescription: 'Animated' },
];
exports.rewardDefinitions = [
    ...territoryNameStyleDefinitions,
    ...levelBorderDefinitions,
    ...levelBorderStyleDefinitions,
];
exports.rewardDefinitionsById = new Map(exports.rewardDefinitions.map((d) => [d.id, d]));

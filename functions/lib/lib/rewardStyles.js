"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.avatarBorderStyles = exports.territoryLabelStyles = void 0;
exports.territoryLabelStyles = {
    default: { color: '#e5e7eb' },
    bronze: {
        color: '#e0b084',
        textShadowColor: 'rgba(224,176,132,0.35)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 4,
    },
    silver: {
        color: '#dce4ef',
        textShadowColor: 'rgba(220,228,239,0.35)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 4,
    },
    gold: {
        color: '#f5d47a',
        textShadowColor: 'rgba(245,212,122,0.4)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 5,
    },
    platinum: {
        color: '#c9e5ff',
        textShadowColor: 'rgba(201,229,255,0.45)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 6,
    },
    animated: {
        color: '#d6f2ff',
        textShadowColor: 'rgba(214,242,255,0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 7,
    },
};
exports.avatarBorderStyles = {
    default: { borderColor: '#4b5563', borderWidth: 2, borderStyle: 'solid' }, // neutral gray
    bronze: { borderColor: '#e0b084', borderWidth: 2.5, borderStyle: 'dashed' }, // dashed bronze
    silver: { borderColor: '#cbd5e1', borderWidth: 2.5, borderStyle: 'dotted' }, // dotted silver
    gold: { borderColor: '#f5d47a', borderWidth: 3, borderStyle: 'dashed' }, // zigzag-like accent
    platinum: {
        borderColor: '#bcd7ff',
        borderWidth: 3,
        borderStyle: 'solid',
        animatedPulse: true,
        // Mixed gradient hint so the card swatch isn’t plain white.
        overlayGradient: { colors: ['#8be9fd', '#fbbf24', '#a78bfa'] },
    },
    animated: {
        borderColor: '#22d3ee',
        borderWidth: 4,
        overlayGradient: { colors: ['#22d3ee', '#fbbf24', '#22d3ee'] },
        animatedSpin: true,
    },
};

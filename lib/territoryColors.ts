import { getRequiredLevel } from './rewards/rewardSchedule';

export type TerritoryColorId =
  | 'blue_basic'
  | 'red_basic'
  | 'green_basic'
  | 'gray_basic'
  | 'custom'
  | 'orange'
  | 'yellow'
  | 'purple'
  | 'pink'
  | 'teal'
  | 'cyan'
  | 'indigo'
  | 'lime'
  | 'emerald'
  | 'violet_deep'
  | 'rose'
  | 'sky'
  | 'mint'
  | 'navy'
  | 'crimson'
  | 'forest'
  | 'chocolate'
  | 'gold'
  | 'platinum'
  | 'neon_purple'
  | 'neon_cyan'
  | 'neon_lime'
  | 'obsidian';

export type TerritoryColor = {
  id: TerritoryColorId;
  name: string;
  hex: string;
  requiredLevel: number; // <= current level means unlocked
};

export const DEFAULT_TERRITORY_COLOR_ID: TerritoryColorId = 'blue_basic';

const palette: ReadonlyArray<TerritoryColor> = Object.freeze([
  { id: 'blue_basic', name: 'Blue', hex: '#1e90ff', requiredLevel: getRequiredLevel('color', 'blue_basic') },
  { id: 'red_basic', name: 'Red', hex: '#ef4444', requiredLevel: getRequiredLevel('color', 'red_basic') },
  { id: 'green_basic', name: 'Green', hex: '#22c55e', requiredLevel: getRequiredLevel('color', 'green_basic') },
  { id: 'gray_basic', name: 'Slate Gray', hex: '#94a3b8', requiredLevel: getRequiredLevel('color', 'gray_basic') },
  { id: 'custom', name: 'Custom', hex: '#ffffff', requiredLevel: getRequiredLevel('color', 'custom') },
  { id: 'orange', name: 'Orange', hex: '#f97316', requiredLevel: getRequiredLevel('color', 'orange') },
  { id: 'yellow', name: 'Yellow', hex: '#eab308', requiredLevel: getRequiredLevel('color', 'yellow') },
  { id: 'purple', name: 'Purple', hex: '#a855f7', requiredLevel: getRequiredLevel('color', 'purple') },
  { id: 'pink', name: 'Pink', hex: '#ec4899', requiredLevel: getRequiredLevel('color', 'pink') },
  { id: 'teal', name: 'Teal', hex: '#14b8a6', requiredLevel: getRequiredLevel('color', 'teal') },
  { id: 'cyan', name: 'Cyan', hex: '#06b6d4', requiredLevel: getRequiredLevel('color', 'cyan') },
  { id: 'indigo', name: 'Indigo', hex: '#6366f1', requiredLevel: getRequiredLevel('color', 'indigo') },
  { id: 'lime', name: 'Lime', hex: '#84cc16', requiredLevel: getRequiredLevel('color', 'lime') },
  { id: 'emerald', name: 'Emerald', hex: '#10b981', requiredLevel: getRequiredLevel('color', 'emerald') },
  { id: 'violet_deep', name: 'Deep Violet', hex: '#7c3aed', requiredLevel: getRequiredLevel('color', 'violet_deep') },
  { id: 'rose', name: 'Rose', hex: '#f43f5e', requiredLevel: getRequiredLevel('color', 'rose') },
  { id: 'sky', name: 'Sky', hex: '#38bdf8', requiredLevel: getRequiredLevel('color', 'sky') },
  { id: 'mint', name: 'Mint', hex: '#2dd4bf', requiredLevel: getRequiredLevel('color', 'mint') },
  { id: 'navy', name: 'Navy', hex: '#1e3a8a', requiredLevel: getRequiredLevel('color', 'navy') },
  { id: 'crimson', name: 'Crimson', hex: '#dc2626', requiredLevel: getRequiredLevel('color', 'crimson') },
  { id: 'forest', name: 'Forest', hex: '#166534', requiredLevel: getRequiredLevel('color', 'forest') },
  { id: 'chocolate', name: 'Chocolate', hex: '#7c2d12', requiredLevel: getRequiredLevel('color', 'chocolate') },
  { id: 'gold', name: 'Gold', hex: '#d4af37', requiredLevel: getRequiredLevel('color', 'gold') },
  { id: 'platinum', name: 'Platinum', hex: '#e5e7eb', requiredLevel: getRequiredLevel('color', 'platinum') },
  { id: 'neon_purple', name: 'Neon Purple', hex: '#c026d3', requiredLevel: getRequiredLevel('color', 'neon_purple') },
  { id: 'neon_cyan', name: 'Neon Cyan', hex: '#22d3ee', requiredLevel: getRequiredLevel('color', 'neon_cyan') },
  { id: 'neon_lime', name: 'Neon Lime', hex: '#a3e635', requiredLevel: getRequiredLevel('color', 'neon_lime') },
  { id: 'obsidian', name: 'Obsidian', hex: '#0b0f1a', requiredLevel: getRequiredLevel('color', 'obsidian') },
]);

const paletteById = new Map<TerritoryColorId, TerritoryColor>(palette.map((color) => [color.id, color]));
const paletteByHex = new Map<string, TerritoryColor>(palette.map((color) => [color.hex, color]));
const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;

function normalizeHex(hex: string): string | null {
  if (!HEX_COLOR_RE.test(hex)) return null;
  return hex.toLowerCase();
}

// UNUSED (repo-wide): kept for potential future use.
export function getAllColors(): TerritoryColor[] {
  return [...palette];
}

// UNUSED (repo-wide): kept for potential future use.
export function findColorById(id: string | null | undefined): TerritoryColor | undefined {
  if (!id) return undefined;
  return paletteById.get(id as TerritoryColorId);
}

export function findColorByHex(hex: string | null | undefined): TerritoryColor | undefined {
  if (!hex) return undefined;
  const normalized = normalizeHex(hex);
  if (!normalized) return undefined;
  return paletteByHex.get(normalized);
}

// UNUSED (repo-wide): kept for potential future use.
export function isColorUnlocked(colorId: TerritoryColorId, level: number): boolean {
  const color = findColorById(colorId);
  if (!color) return false;
  return level >= color.requiredLevel;
}

// UNUSED (repo-wide): kept for potential future use.
export function getUnlockedColors(level: number): TerritoryColor[] {
  return palette.filter((c) => isColorUnlocked(c.id, level));
}

// UNUSED (repo-wide): kept for potential future use.
export function getNextUnlock(level: number): TerritoryColor | null {
  const locked = palette.filter((c) => !isColorUnlocked(c.id, level));
  if (!locked.length) return null;
  return locked.reduce((next, c) => {
    if (!next) return c;
    return c.requiredLevel < next.requiredLevel ? c : next;
  }, null as TerritoryColor | null);
}

export function validateTerritoryColorSelection(
  colorId: TerritoryColorId | null | undefined,
  level: number,
  customHex?: string | null
): TerritoryColor {
  if (colorId === 'custom') {
    const customEntry = findColorById('custom');
    if (customEntry && isColorUnlocked('custom', level)) {
      const normalizedCustom = customHex ? normalizeHex(customHex) : null;
      return { ...customEntry, hex: normalizedCustom ?? customEntry.hex };
    }
  }
  const target = findColorById(colorId ?? '') ?? findColorByHex(colorId ?? '');
  if (target && isColorUnlocked(target.id, level)) return target;
  // If locked or unknown, fall back to default.
  const fallback = findColorById(DEFAULT_TERRITORY_COLOR_ID)!;
  return fallback;
}

// UNUSED (repo-wide): kept for potential future use.
export function unlockedCount(level: number): number {
  return getUnlockedColors(level).length;
}

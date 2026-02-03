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

const palette: TerritoryColor[] = [
  { id: 'blue_basic', name: 'Blue', hex: '#1E90FF', requiredLevel: getRequiredLevel('color', 'blue_basic') },
  { id: 'red_basic', name: 'Red', hex: '#EF4444', requiredLevel: getRequiredLevel('color', 'red_basic') },
  { id: 'green_basic', name: 'Green', hex: '#22C55E', requiredLevel: getRequiredLevel('color', 'green_basic') },
  { id: 'gray_basic', name: 'Slate Gray', hex: '#94A3B8', requiredLevel: getRequiredLevel('color', 'gray_basic') },
  { id: 'custom', name: 'Custom', hex: '#ffffff', requiredLevel: getRequiredLevel('color', 'custom') },
  { id: 'orange', name: 'Orange', hex: '#F97316', requiredLevel: getRequiredLevel('color', 'orange') },
  { id: 'yellow', name: 'Yellow', hex: '#EAB308', requiredLevel: getRequiredLevel('color', 'yellow') },
  { id: 'purple', name: 'Purple', hex: '#A855F7', requiredLevel: getRequiredLevel('color', 'purple') },
  { id: 'pink', name: 'Pink', hex: '#EC4899', requiredLevel: getRequiredLevel('color', 'pink') },
  { id: 'teal', name: 'Teal', hex: '#14B8A6', requiredLevel: getRequiredLevel('color', 'teal') },
  { id: 'cyan', name: 'Cyan', hex: '#06B6D4', requiredLevel: getRequiredLevel('color', 'cyan') },
  { id: 'indigo', name: 'Indigo', hex: '#6366F1', requiredLevel: getRequiredLevel('color', 'indigo') },
  { id: 'lime', name: 'Lime', hex: '#84CC16', requiredLevel: getRequiredLevel('color', 'lime') },
  { id: 'emerald', name: 'Emerald', hex: '#10B981', requiredLevel: getRequiredLevel('color', 'emerald') },
  { id: 'violet_deep', name: 'Deep Violet', hex: '#7C3AED', requiredLevel: getRequiredLevel('color', 'violet_deep') },
  { id: 'rose', name: 'Rose', hex: '#F43F5E', requiredLevel: getRequiredLevel('color', 'rose') },
  { id: 'sky', name: 'Sky', hex: '#38BDF8', requiredLevel: getRequiredLevel('color', 'sky') },
  { id: 'mint', name: 'Mint', hex: '#2DD4BF', requiredLevel: getRequiredLevel('color', 'mint') },
  { id: 'navy', name: 'Navy', hex: '#1E3A8A', requiredLevel: getRequiredLevel('color', 'navy') },
  { id: 'crimson', name: 'Crimson', hex: '#DC2626', requiredLevel: getRequiredLevel('color', 'crimson') },
  { id: 'forest', name: 'Forest', hex: '#166534', requiredLevel: getRequiredLevel('color', 'forest') },
  { id: 'chocolate', name: 'Chocolate', hex: '#7C2D12', requiredLevel: getRequiredLevel('color', 'chocolate') },
  { id: 'gold', name: 'Gold', hex: '#D4AF37', requiredLevel: getRequiredLevel('color', 'gold') },
  { id: 'platinum', name: 'Platinum', hex: '#E5E7EB', requiredLevel: getRequiredLevel('color', 'platinum') },
  { id: 'neon_purple', name: 'Neon Purple', hex: '#C026D3', requiredLevel: getRequiredLevel('color', 'neon_purple') },
  { id: 'neon_cyan', name: 'Neon Cyan', hex: '#22D3EE', requiredLevel: getRequiredLevel('color', 'neon_cyan') },
  { id: 'neon_lime', name: 'Neon Lime', hex: '#A3E635', requiredLevel: getRequiredLevel('color', 'neon_lime') },
  { id: 'obsidian', name: 'Obsidian', hex: '#0B0F1A', requiredLevel: getRequiredLevel('color', 'obsidian') },
];

export function getAllColors(): TerritoryColor[] {
  return palette;
}

export function findColorById(id: string | null | undefined): TerritoryColor | undefined {
  return palette.find((c) => c.id === id);
}

export function findColorByHex(hex: string | null | undefined): TerritoryColor | undefined {
  if (!hex) return undefined;
  return palette.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
}

export function isColorUnlocked(colorId: TerritoryColorId, level: number): boolean {
  const color = findColorById(colorId);
  if (!color) return false;
  return level >= color.requiredLevel;
}

export function getUnlockedColors(level: number): TerritoryColor[] {
  return palette.filter((c) => isColorUnlocked(c.id, level));
}

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
      return { ...customEntry, hex: customHex ?? customEntry.hex };
    }
  }
  const target = findColorById(colorId ?? '') ?? findColorByHex(colorId as string);
  if (target && isColorUnlocked(target.id, level)) return target;
  // If locked or unknown, fall back to default.
  const fallback = findColorById(DEFAULT_TERRITORY_COLOR_ID)!;
  return fallback;
}

export function unlockedCount(level: number): number {
  return getUnlockedColors(level).length;
}

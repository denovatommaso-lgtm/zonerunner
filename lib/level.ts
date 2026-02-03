import { defaultXPConfig, levelFromTotalXp, type XPConfig } from './xpProgression';

const palette: string[] = [
  '#22c55e', '#1e90ff', '#f97316', '#ef4444', '#a855f7',
  '#14b8a6', '#0ea5e9', '#6366f1', '#fbbf24', '#10b981',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#fde047',
  '#84cc16', '#06b6d4', '#ff6b6b', '#22c1c3', '#7dd3fc',
  '#d946ef', '#94a3b8', '#64748b', '#ffb347',
];

export function getAvailableColors(level: number) {
  if (level >= 7) return palette;
  if (level >= 5) return palette.slice(0, 16);
  if (level >= 3) return palette.slice(0, 10);
  return palette.slice(0, 5);
}

// Legacy wrapper kept for compatibility. Delegates to the centralized XP progression curve
// in lib/xpProgression so level math stays consistent across the app.
export function computeLevel(xp: number, cfg: XPConfig = defaultXPConfig) {
  const state = levelFromTotalXp(xp, cfg);
  return {
    level: state.level,
    xp,
    xpIntoLevel: state.xpIntoLevel,
    xpForNext: state.xpForNext,
    progressPct: state.progressPct,
  };
}

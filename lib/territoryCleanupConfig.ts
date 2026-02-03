/**
 * Territory cleanup config (tunable).
 *
 * Goal: remove tiny disconnected fragments ("slivers") produced by polygon boolean ops,
 * and optionally smooth jagged edges a bit for rendering.
 *
 * Units:
 * - Areas are in square meters (m²).
 * - Simplification tolerance is in meters.
 */
export const territoryCleanupConfig = {
  // Optional dev-only logging for cleanup steps.
  debugLogs: false,
  // Remove disconnected polygon parts smaller than this (m²).
  // Recommended defaults: 50–200 m² (higher = more aggressive sliver removal).
  minFragmentAreaM2: 150,

  // Remove tiny holes inside polygons smaller than this (m²).
  // These holes look like visual noise on the map.
  minHoleAreaM2: 100,

  // Safety: if a territory has only one polygon part and it is below the threshold,
  // keep it to avoid deleting someone's legitimate (but small) territory.
  keepSinglePartBelowThreshold: true,

  // Thin sliver removal (road-edge ribbon killer):
  // Remove parts that are extremely skinny and long (road-edge ribbons), even when
  // their area is above `minFragmentAreaM2`.
  thinSliver: {
    enabled: true,
    // Delete parts where thickness (approx width) is under this many meters.
    // Recommended: 6–12m depending on road width/zoom.
    minThicknessM: 8,
    // Guard to avoid deleting legitimate narrow-ish shapes: only delete if long+thin.
    // aspectRatio = length / width
    minAspectRatio: 12,
    // Safety for users with only one territory part: require an even higher aspect ratio
    // before deleting their only polygon.
    singlePartAspectRatioMultiplier: 1.5,
  },

  // Optional smoothing: drop consecutive points that are closer than this many meters.
  // Keep this small; set to 0 to disable.
  simplifyToleranceMeters: 0,
} as const;

// Shared helpers for displaying run-related metrics.
// Keep these pure and UI-agnostic so screens can reuse them consistently.

// Format elapsed time as hh:mm:ss or mm:ss if under an hour.
export function formatElapsed(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m
      .toString()
      .padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Format pace as mm:ss per km. Returns placeholder when inputs are invalid.
export function formatPace(distanceMeters: number, elapsedSeconds: number): string {
  if (distanceMeters <= 0 || elapsedSeconds <= 0) return '--:-- /km';
  const km = distanceMeters / 1000;
  if (km <= 0) return '--:-- /km';

  const secPerKm = elapsedSeconds / km;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.floor(secPerKm % 60);

  return `${min.toString().padStart(2, '0')}:${sec
    .toString()
    .padStart(2, '0')} /km`;
}

// Format speed as km/h with one decimal.
export function formatSpeed(distanceMeters: number, elapsedSeconds: number): string {
  if (distanceMeters <= 0 || elapsedSeconds <= 0) return '-- km/h';
  const hours = elapsedSeconds / 3600;
  if (hours <= 0) return '-- km/h';
  const kmh = (distanceMeters / 1000) / hours;
  return `${kmh.toFixed(1)} km/h`;
}

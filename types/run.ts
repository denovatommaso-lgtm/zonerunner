export type RunPoint = {
  latitude: number;
  longitude: number;
  ts?: number; // ms epoch
  altitudeM?: number; // meters (optional; may be missing on some devices/runs)
  altitudeAccuracyM?: number; // meters (optional)
};


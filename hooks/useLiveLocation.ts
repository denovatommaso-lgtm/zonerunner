import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { perfLog } from '../lib/perfLogger';

type LiveLocation = {
  coords: { latitude: number; longitude: number } | null;
  heading: number;
};

export function useLiveLocation(options?: {
  enabled?: boolean;
  accuracy?: Location.Accuracy;
  timeInterval?: number;
  distanceInterval?: number;
}) {
  const enabled = options?.enabled ?? true;
  const accuracy = options?.accuracy ?? Location.Accuracy.BestForNavigation;
  const timeInterval = options?.timeInterval ?? 1000;
  const distanceInterval = options?.distanceInterval ?? 1;
  const [state, setState] = useState<LiveLocation>({ coords: null, heading: 0 });
  const positionSub = useRef<Location.LocationSubscription | null>(null);
  const headingSub = useRef<Location.LocationSubscription | null>(null);
  const headingRef = useRef(0);
  const appliedHeadingRef = useRef(0);
  const lastUpdateRef = useRef<number>(0);
  const lastCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const positionCountRef = useRef(0);
  const headingCountRef = useRef(0);

  // Low-pass filter helper to smooth heading jitter while handling wrap-around at 360°
  const smoothHeading = (prev: number, next: number, alpha = 0.12) => {
    const delta = (((next - prev + 540) % 360) - 180) || 0; // shortest turn
    return (prev + delta * alpha + 360) % 360;
  };

  useEffect(() => {
    if (!enabled) {
      if (positionSub.current) {
        positionSub.current.remove();
        positionSub.current = null;
      }
      if (headingSub.current) {
        headingSub.current.remove();
        headingSub.current = null;
      }
      return;
    }

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        // Ask platform to use the most accurate providers available.
        try {
          if (Location.enableNetworkProviderAsync) {
            await Location.enableNetworkProviderAsync();
          }
        } catch {
          // ignore if not supported
        }

        positionSub.current = await Location.watchPositionAsync(
          {
            accuracy,
            timeInterval,
            distanceInterval,
            mayShowUserSettingsDialog: true,
          },
          (loc) => {
            positionCountRef.current += 1;
            // Drop very inaccurate points
            if (loc.coords.accuracy && loc.coords.accuracy > 40) return;
            const prev = lastCoordRef.current;
            const next = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            // Light smoothing to reduce jitter/offset
            const smoothed = prev
              ? {
                  latitude: prev.latitude + (next.latitude - prev.latitude) * 0.25,
                  longitude: prev.longitude + (next.longitude - prev.longitude) * 0.25,
                }
              : next;
            lastCoordRef.current = smoothed;
            setState((prev) => ({
              ...prev,
              coords: smoothed,
            }));
          }
        );

        if (typeof Location.watchHeadingAsync === 'function') {
          headingSub.current = await Location.watchHeadingAsync((event) => {
            headingCountRef.current += 1;
            const rawHeading = Number.isFinite(event.trueHeading)
              ? event.trueHeading
              : Number.isFinite(event.magHeading)
              ? event.magHeading
              : null;
            if (rawHeading === null || rawHeading < 0) return;

            const prev = headingRef.current;
            const smoothed = smoothHeading(prev, rawHeading, 0.15); // stronger smoothing for less shake
            headingRef.current = smoothed;

            const now = Date.now();
            const applied = appliedHeadingRef.current;
            const appliedDelta = Math.abs(((smoothed - applied + 540) % 360) - 180);

            // Drop tiny jitters and rate-limit updates to avoid visual shake
            if (appliedDelta < 2.5 && now - lastUpdateRef.current < 650) {
              return;
            }

            lastUpdateRef.current = now;
            appliedHeadingRef.current = smoothed;
            setState((p) => ({ ...p, heading: smoothed }));
          });
        }
      } catch (e) {
        console.log('Live location failed to initialize', e);
      }
    })();

    return () => {
      if (positionSub.current) {
        positionSub.current.remove();
        positionSub.current = null;
      }
      if (headingSub.current) {
        headingSub.current.remove();
        headingSub.current = null;
      }
    };
  }, [accuracy, distanceInterval, enabled, timeInterval]);

  useEffect(() => {
    if (!enabled) return;
    perfLog({
      screen: 'LiveLocation',
      phase: 'MAP',
      label: 'subscribe',
      durationMs: 0,
      meta: { accuracy, timeInterval, distanceInterval },
    });
    const interval = setInterval(() => {
      const positionCount = positionCountRef.current;
      const headingCount = headingCountRef.current;
      positionCountRef.current = 0;
      headingCountRef.current = 0;
      perfLog({
        screen: 'LiveLocation',
        phase: 'MAP',
        label: 'update-rate',
        durationMs: 0,
        meta: { positionCount, headingCount },
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [accuracy, distanceInterval, enabled, timeInterval]);

  return state;
}

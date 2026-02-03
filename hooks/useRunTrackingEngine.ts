import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineMeters } from '../lib/geo/geoMetrics';
import type { RunPoint } from '../types/run';

export type RunCoord = RunPoint;

type Options = {
  timeIntervalMs?: number;
  distanceIntervalM?: number;
  maxGpsAccuracyM?: number;
  uiUpdateIntervalMs?: number;
  routeUpdateIntervalMs?: number;
  debugLabel?: string;
  onRawLocation?: (coord: RunCoord, accuracyM: number) => void;
  onAcceptedPoint?: (coord: RunCoord) => void;
};

type StopOptions = {
  reset?: boolean;
};

export function useRunTrackingEngine(options?: Options) {
  const timeIntervalMs = options?.timeIntervalMs ?? 1000;
  const distanceIntervalM = options?.distanceIntervalM ?? 5;
  const maxGpsAccuracyM = options?.maxGpsAccuracyM ?? 200;
  const uiUpdateIntervalMs = options?.uiUpdateIntervalMs ?? 1000;
  const routeUpdateIntervalMs = options?.routeUpdateIntervalMs ?? 2000;
  const debugLabel = options?.debugLabel;

  const onRawLocationRef = useRef<Options['onRawLocation']>(options?.onRawLocation);
  const onAcceptedPointRef = useRef<Options['onAcceptedPoint']>(options?.onAcceptedPoint);
  useEffect(() => {
    onRawLocationRef.current = options?.onRawLocation;
    onAcceptedPointRef.current = options?.onAcceptedPoint;
  }, [options?.onRawLocation, options?.onAcceptedPoint]);

  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [route, setRoute] = useState<RunCoord[]>([]);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const isTrackingRef = useRef(false);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<any>(null);
  const pausedRef = useRef(false);

  const lastTrackedCoordRef = useRef<RunCoord | null>(null);
  const routeRef = useRef<RunCoord[]>([]);
  const distanceMetersRef = useRef(0);
  const startEpochMsRef = useRef<number | null>(null);
  const pausedAccumMsRef = useRef(0);
  const pauseStartedAtMsRef = useRef<number | null>(null);
  const lastUiUpdateAtRef = useRef(0);
  const lastRouteUpdateAtRef = useRef(0);
  const lastDebugAtRef = useRef(0);
  const rawCountRef = useRef(0);
  const acceptedCountRef = useRef(0);
  const rawLogCountRef = useRef(0);

  // Timer driven off wall-clock time so it can't get "stuck" due to delayed ticks.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!tracking || paused) return;
    if (!startEpochMsRef.current) startEpochMsRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const startMs = startEpochMsRef.current;
      if (!startMs) return;
      const elapsedMs = Date.now() - startMs - pausedAccumMsRef.current;
      const nextSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      setElapsedSeconds((prev) => (prev === nextSeconds ? prev : nextSeconds));
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [tracking, paused]);

  // Foreground GPS watcher: attach once per tracking session and keep alive.
  useEffect(() => {
    if (!tracking) return;
    if (watchSubRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: timeIntervalMs,
            distanceInterval: distanceIntervalM,
            mayShowUserSettingsDialog: true,
          },
          (loc) => {
            if (pausedRef.current) return;
            const coord: RunCoord = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              ts: Date.now(),
              altitudeM: typeof loc.coords.altitude === 'number' ? loc.coords.altitude : undefined,
              altitudeAccuracyM:
                typeof (loc.coords as any).altitudeAccuracy === 'number'
                  ? (loc.coords as any).altitudeAccuracy
                  : undefined,
            };

            const accuracy = loc.coords.accuracy ?? 999;
            if (!Number.isFinite(coord.latitude) || !Number.isFinite(coord.longitude)) return;
            onRawLocationRef.current?.(coord, accuracy);
            rawCountRef.current += 1;
            rawLogCountRef.current += 1;
            if (__DEV__ && debugLabel && rawLogCountRef.current >= 5) {
              rawLogCountRef.current = 0;
              console.log(
                `[RunTracking:${debugLabel}] lat=${coord.latitude.toFixed(5)} lng=${coord.longitude.toFixed(5)} acc=${Math.round(accuracy)}m points=${routeRef.current.length}`
              );
            }

            const last = lastTrackedCoordRef.current;
            if (!last) {
              lastTrackedCoordRef.current = coord;
              routeRef.current = [coord];
              setRoute((prev) => (prev.length ? prev : [coord]));
              onAcceptedPointRef.current?.(coord);
              acceptedCountRef.current += 1;
              return;
            }

            const delta = haversineMeters(last, coord);
            if (!isFinite(delta) || delta <= 0) return;

            if (accuracy > maxGpsAccuracyM) return;
            const minDelta = accuracy > 100 ? 10 : 3;
            if (delta < minDelta) return;

            lastTrackedCoordRef.current = coord;
            distanceMetersRef.current += delta;
            routeRef.current = [...routeRef.current, coord];
            acceptedCountRef.current += 1;
            const now = Date.now();
            if (now - lastUiUpdateAtRef.current >= uiUpdateIntervalMs) {
              lastUiUpdateAtRef.current = now;
              setDistanceMeters(distanceMetersRef.current);
            }
            if (now - lastRouteUpdateAtRef.current >= routeUpdateIntervalMs) {
              lastRouteUpdateAtRef.current = now;
              setRoute([...routeRef.current]);
            }
            if (__DEV__ && debugLabel) {
              const lastDebug = lastDebugAtRef.current;
              if (!lastDebug || now - lastDebug >= 5000) {
                lastDebugAtRef.current = now;
                console.log(
                  `[RunTracking:${debugLabel}] raw=${rawCountRef.current} accepted=${acceptedCountRef.current} points=${routeRef.current.length}`
                );
                rawCountRef.current = 0;
                acceptedCountRef.current = 0;
              }
            }
            onAcceptedPointRef.current?.(coord);
          }
        );

        if (cancelled) {
          sub.remove();
          return;
        }
        watchSubRef.current = sub;
      } catch (e) {
        console.log('Failed to attach location watcher', e);
      }
    })();

    return () => {
      cancelled = true;
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
        if (__DEV__ && debugLabel) {
          console.log(`[RunTracking:${debugLabel}] watcher cleaned up`);
        }
      }
    };
  }, [distanceIntervalM, debugLabel, timeIntervalMs, tracking]);

  const start = useCallback(() => {
    if (isTrackingRef.current) return;
    isTrackingRef.current = true;

    setTracking(true);
    setPaused(false);
    setRoute([]);
    setDistanceMeters(0);
    setElapsedSeconds(0);

    lastTrackedCoordRef.current = null;
    routeRef.current = [];
    distanceMetersRef.current = 0;
    startEpochMsRef.current = Date.now();
    pausedAccumMsRef.current = 0;
    pauseStartedAtMsRef.current = null;
    lastUiUpdateAtRef.current = 0;
    lastRouteUpdateAtRef.current = 0;
    lastDebugAtRef.current = 0;
    rawCountRef.current = 0;
    acceptedCountRef.current = 0;
  }, []);

  const stop = useCallback((opts?: StopOptions) => {
    isTrackingRef.current = false;
    setTracking(false);
    setPaused(false);

    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
      if (__DEV__ && debugLabel) {
        console.log(`[RunTracking:${debugLabel}] watcher stopped`);
      }
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!opts?.reset) {
      setDistanceMeters(distanceMetersRef.current);
      setRoute([...routeRef.current]);
    }

    if (opts?.reset) {
      setRoute([]);
      setDistanceMeters(0);
      setElapsedSeconds(0);
      lastTrackedCoordRef.current = null;
      routeRef.current = [];
      distanceMetersRef.current = 0;
      startEpochMsRef.current = null;
      pausedAccumMsRef.current = 0;
      pauseStartedAtMsRef.current = null;
    }
  }, []);

  const togglePause = useCallback(() => {
    if (!isTrackingRef.current) return;

    setPaused((prev) => {
      const next = !prev;
      if (next) {
        // Pausing now
        if (!pauseStartedAtMsRef.current) pauseStartedAtMsRef.current = Date.now();
      } else {
        // Resuming now
        if (pauseStartedAtMsRef.current) {
          pausedAccumMsRef.current += Date.now() - pauseStartedAtMsRef.current;
          pauseStartedAtMsRef.current = null;
        }
      }
      return next;
    });
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    tracking,
    paused,
    route,
    distanceMeters,
    elapsedSeconds,
    setRoute,
    routeRef,
    distanceMetersRef,
    isTrackingRef,
    start,
    stop,
    togglePause,
  };
}

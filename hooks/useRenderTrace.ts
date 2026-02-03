import { useEffect, useRef } from 'react';
import { perfLog } from '../lib/perfLogger';

type RenderTraceParams = {
  screen: string;
  label: string;
  props?: Record<string, unknown>;
  enabled?: boolean;
  throttleMs?: number;
};

function shallowDiffKeys(prev: Record<string, unknown> | null, next: Record<string, unknown> | undefined) {
  if (!prev || !next) return [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (prev[key] !== next[key]) changed.push(key);
  }
  return changed;
}

export function useRenderTrace(params: RenderTraceParams) {
  const { screen, label, props, enabled = __DEV__, throttleMs = 2000 } = params;
  const renderStartRef = useRef(0);
  const renderCountRef = useRef(0);
  const lastLogAtRef = useRef(0);
  const prevPropsRef = useRef<Record<string, unknown> | null>(props ?? null);

  renderStartRef.current = Date.now();
  renderCountRef.current += 1;

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    if (now - lastLogAtRef.current < throttleMs) return;
    lastLogAtRef.current = now;
    const duration = now - renderStartRef.current;
    const changed = shallowDiffKeys(prevPropsRef.current, props);
    prevPropsRef.current = props ?? null;
    perfLog({
      screen,
      phase: 'RENDER',
      label: `${label} render`,
      durationMs: duration,
      meta: {
        renders: renderCountRef.current,
        changedProps: changed,
      },
    });
    renderCountRef.current = 0;
  }, [enabled, label, props, screen, throttleMs]);
}

import { loadAllRuns } from './runService';

let cachedRuns: any[] | null = null;
let inflight: Promise<void> | null = null;

export function getPrefetchedTerritory() {
  return { runs: cachedRuns, cells: null };
}

export async function preloadTerritoryData(options?: { force?: boolean }) {
  if (inflight) return inflight;
  if (cachedRuns && !options?.force) return;
  inflight = (async () => {
    try {
      if (__DEV__) {
        console.log(`[RUNS_CALLSITE] file=lib/territoryPrefetch.ts fn=preloadTerritoryData reason=preloadTerritoryData ts=${Date.now()}`);
      }
      const runs = await loadAllRuns();
      cachedRuns = runs as any[];
    } catch (e) {
      console.log('Prefetch territory data failed', e);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function setPrefetchedTerritoryRuns(runs: any[] | null) {
  cachedRuns = runs;
}

export function upsertPrefetchedTerritoryRun(run: any) {
  if (!run) return;
  if (!cachedRuns) cachedRuns = [];
  const id = (run.id ?? '').toString();
  if (!id) return;
  cachedRuns = [run, ...cachedRuns.filter((r) => (r?.id ?? '').toString() !== id)];
}

export function clearPrefetchedTerritory() {
  cachedRuns = null;
  inflight = null;
}

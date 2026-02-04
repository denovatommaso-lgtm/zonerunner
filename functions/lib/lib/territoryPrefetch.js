"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrefetchedTerritory = getPrefetchedTerritory;
exports.preloadTerritoryData = preloadTerritoryData;
exports.setPrefetchedTerritoryRuns = setPrefetchedTerritoryRuns;
exports.upsertPrefetchedTerritoryRun = upsertPrefetchedTerritoryRun;
exports.clearPrefetchedTerritory = clearPrefetchedTerritory;
const runService_1 = require("./runService");
let cachedRuns = null;
let inflight = null;
function getPrefetchedTerritory() {
    return { runs: cachedRuns, cells: null };
}
async function preloadTerritoryData(options) {
    if (inflight)
        return inflight;
    if (cachedRuns && !options?.force)
        return;
    inflight = (async () => {
        try {
            if (__DEV__) {
                console.log(`[RUNS_CALLSITE] file=lib/territoryPrefetch.ts fn=preloadTerritoryData reason=preloadTerritoryData ts=${Date.now()}`);
            }
            const runs = await (0, runService_1.loadAllRuns)();
            cachedRuns = runs;
        }
        catch (e) {
            console.log('Prefetch territory data failed', e);
        }
        finally {
            inflight = null;
        }
    })();
    return inflight;
}
function setPrefetchedTerritoryRuns(runs) {
    cachedRuns = runs;
}
function upsertPrefetchedTerritoryRun(run) {
    if (!run)
        return;
    if (!cachedRuns)
        cachedRuns = [];
    const id = (run.id ?? '').toString();
    if (!id)
        return;
    cachedRuns = [run, ...cachedRuns.filter((r) => (r?.id ?? '').toString() !== id)];
}
function clearPrefetchedTerritory() {
    cachedRuns = null;
    inflight = null;
}

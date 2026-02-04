"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perfLog = perfLog;
exports.perfStart = perfStart;
exports.perfBytes = perfBytes;
const PERF_LOG_CONFIG = {
    enabled: true,
    logAll: false,
    minDurationMs: 50,
    includeLabelSubstrings: ['rebuildTerritoriesFromRuns'],
    includePhases: [],
    includeScreens: [],
};
function byteSize(value) {
    try {
        if (value === null || value === undefined)
            return null;
        const json = JSON.stringify(value);
        return typeof json === 'string' ? json.length : null;
    }
    catch {
        return null;
    }
}
function formatMeta(meta) {
    if (!meta || Object.keys(meta).length === 0)
        return '';
    try {
        return ` meta=${JSON.stringify(meta)}`;
    }
    catch {
        return ' meta=[unserializable]';
    }
}
function shouldLog(params) {
    if (!PERF_LOG_CONFIG.enabled)
        return false;
    if (PERF_LOG_CONFIG.includePhases.length && !PERF_LOG_CONFIG.includePhases.includes(params.phase)) {
        return false;
    }
    if (PERF_LOG_CONFIG.includeScreens.length && !PERF_LOG_CONFIG.includeScreens.includes(params.screen)) {
        return false;
    }
    if (PERF_LOG_CONFIG.logAll)
        return true;
    const labelMatch = PERF_LOG_CONFIG.includeLabelSubstrings.some((token) => params.label.includes(token));
    if (labelMatch)
        return true;
    const dur = typeof params.durationMs === 'number' ? params.durationMs : 0;
    return dur >= PERF_LOG_CONFIG.minDurationMs;
}
function perfLog(params) {
    if (!__DEV__)
        return;
    if (!shouldLog(params))
        return;
    const ts = Date.now();
    const dur = typeof params.durationMs === 'number' ? ` dur=${Math.round(params.durationMs)}ms` : '';
    console.log(`[PERF] ts=${ts} screen=${params.screen} phase=${params.phase}${dur} label=${params.label}${formatMeta(params.meta)}`);
}
function perfStart(params) {
    const start = Date.now();
    perfLog({ ...params, durationMs: 0 });
    return (meta) => {
        perfLog({
            ...params,
            durationMs: Date.now() - start,
            meta: meta ?? params.meta,
        });
    };
}
function perfBytes(value) {
    return byteSize(value);
}

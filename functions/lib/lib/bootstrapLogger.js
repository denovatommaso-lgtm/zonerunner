"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logStart = logStart;
exports.logSuccess = logSuccess;
exports.logFailure = logFailure;
exports.logSummary = logSummary;
const steps = new Map();
function serializePayload(payload) {
    if (!payload || Object.keys(payload).length === 0)
        return '';
    try {
        return JSON.stringify(payload);
    }
    catch {
        return '[unserializable]';
    }
}
function formatError(err) {
    if (err instanceof Error) {
        return { message: err.message, stack: err.stack };
    }
    return { message: typeof err === 'string' ? err : 'Unknown error' };
}
function logStart(tag, payload) {
    if (!__DEV__)
        return;
    steps.set(tag, { status: 'started', startedAt: Date.now(), payload });
    const serialized = serializePayload(payload);
    console.log(`[BOOT] start tag=${tag}${serialized ? ` payload=${serialized}` : ''}`);
}
function logSuccess(tag, payload) {
    if (!__DEV__)
        return;
    const existing = steps.get(tag);
    steps.set(tag, {
        status: 'succeeded',
        startedAt: existing?.startedAt ?? Date.now(),
        finishedAt: Date.now(),
        payload,
    });
    const serialized = serializePayload(payload);
    console.log(`[BOOT] success tag=${tag}${serialized ? ` payload=${serialized}` : ''}`);
}
function logFailure(tag, error, payload) {
    if (!__DEV__)
        return;
    const existing = steps.get(tag);
    const err = formatError(error);
    steps.set(tag, {
        status: 'failed',
        startedAt: existing?.startedAt ?? Date.now(),
        finishedAt: Date.now(),
        payload,
        error: err,
    });
    const serialized = serializePayload(payload);
    console.log(`[BOOT] failure tag=${tag} error=${err.message ?? 'Unknown error'}${err.stack ? ` stack=${err.stack}` : ''}${serialized ? ` payload=${serialized}` : ''}`);
}
function logSummary() {
    if (!__DEV__)
        return;
    const parts = Array.from(steps.entries()).map(([tag, info]) => {
        const payload = serializePayload(info.payload);
        const err = info.error?.message ? ` error=${info.error.message}` : '';
        return `${tag}:${info.status}${payload ? ` payload=${payload}` : ''}${err}`;
    });
    console.log(`[BOOTSTRAP_SUMMARY] ${parts.join(' | ')}`);
}

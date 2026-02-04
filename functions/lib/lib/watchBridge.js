"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeWatchRuns = subscribeWatchRuns;
exports.persistWatchRun = persistWatchRun;
const react_native_1 = require("react-native");
const runService_1 = require("./runService");
const firebaseConfig_1 = require("./firebaseConfig");
const monthlyChallengesService_1 = require("./monthlyChallengesService");
const nativeModule = react_native_1.NativeModules.WatchBridge;
const emitter = react_native_1.Platform.OS === 'ios' && nativeModule?.addListener
    ? new react_native_1.NativeEventEmitter(nativeModule)
    : null;
function subscribeWatchRuns(handler) {
    if (!emitter)
        return { remove: () => { } };
    const sub = emitter.addListener('watch_run', handler);
    return { remove: () => sub.remove() };
}
async function persistWatchRun(payload) {
    const userId = payload.userId ?? firebaseConfig_1.auth.currentUser?.uid;
    if (!userId) {
        throw new Error('Cannot save watch run without a user id');
    }
    const route = (payload.route || []).map((p) => ({
        latitude: p.lat,
        longitude: p.lon,
    }));
    const run = {
        userId,
        mode: payload.mode ?? 'personal',
        scope: payload.mode ?? 'personal',
        groupId: payload.groupId,
        distance: payload.distanceMeters,
        elapsedSeconds: payload.elapsedSeconds,
        startedAt: payload.startedAt,
        route,
        areaKm2: payload.areaKm2,
        createdAt: payload.endedAt
            ? Date.parse(payload.endedAt)
            : Date.parse(payload.startedAt) || Date.now(),
    };
    const runId = payload.runId;
    await (0, runService_1.upsertRun)(runId, run);
    try {
        await monthlyChallengesService_1.MonthlyChallengesService.ingestRun({
            userId,
            runId,
            run: run,
        });
    }
    catch (e) {
        console.log('Failed to ingest watch run into monthly challenges', e);
    }
}

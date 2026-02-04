"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchRunsForContext = fetchRunsForContext;
const groupService_1 = require("./groupService");
const bootstrapLogger_1 = require("./bootstrapLogger");
const runService_1 = require("./runService");
// Per-key dedupe/cache so alternating keys don't spam fetches.
const inFlightByKey = new Map();
const resolvedByKey = new Map();
function buildRequestKey(params) {
    const mode = params.mode ?? 'personal';
    const groupId = params.groupId ?? '';
    const userId = params.userId ?? '';
    const global = params.global === true ? '1' : '0';
    return `mode=${mode}|groupId=${groupId}|userId=${userId}|global=${global}`;
}
/**
 * Fetch runs for the current mode/group.
 * - personal + userId -> user runs
 * - group + groupId   -> runs for that group
 * - otherwise         -> all runs (for leaderboard/global)
 */
async function fetchRunsForContext(params) {
    const requestKey = buildRequestKey(params);
    const force = params.force === true;
    if (!force) {
        const inFlight = inFlightByKey.get(requestKey);
        if (inFlight) {
            if (__DEV__) {
                console.log(`[RUNS_GUARD] reuse in-flight fetchRunsForContext key=${requestKey}`);
            }
            return inFlight;
        }
        const resolved = resolvedByKey.get(requestKey);
        if (resolved) {
            if (__DEV__) {
                console.log(`[RUNS_GUARD] reuse resolved fetchRunsForContext key=${requestKey}`);
            }
            return resolved;
        }
    }
    const mode = params.mode ?? 'personal';
    const execute = async () => {
        // Explicit global/leaderboard fetch
        if (params.global === true) {
            const tag = 'fetchRunsForContext:global';
            if (__DEV__) {
                console.log(`[RUNS_CALLSITE] file=lib/runContext.ts fn=fetchRunsForContext reason=globalAllRuns ts=${Date.now()}`);
            }
            (0, bootstrapLogger_1.logStart)(tag, {});
            try {
                const runs = await (0, runService_1.loadAllRuns)(force);
                (0, bootstrapLogger_1.logSuccess)(tag, { count: runs.length });
                return runs;
            }
            catch (e) {
                (0, bootstrapLogger_1.logFailure)(tag, e, {});
                throw e;
            }
        }
        if (mode === 'group' && params.groupId) {
            const tag = `fetchRunsForContext:group:${params.groupId}`;
            (0, bootstrapLogger_1.logStart)(tag, { groupId: params.groupId });
            try {
                const runs = await (0, groupService_1.listGroupRuns)(params.groupId);
                (0, bootstrapLogger_1.logSuccess)(tag, { count: runs.length });
                return runs;
            }
            catch (e) {
                (0, bootstrapLogger_1.logFailure)(tag, e, { groupId: params.groupId });
                throw e;
            }
        }
        if (mode === 'group' && !params.groupId) {
            const tag = 'fetchRunsForContext:group:all';
            (0, bootstrapLogger_1.logStart)(tag, {});
            try {
                const runs = await (0, runService_1.loadAllGroupRuns)();
                (0, bootstrapLogger_1.logSuccess)(tag, { count: runs.length });
                return runs;
            }
            catch (e) {
                (0, bootstrapLogger_1.logFailure)(tag, e, {});
                throw e;
            }
        }
        if (mode === 'personal') {
            if (params.userId) {
                const tag = `fetchRunsForContext:personal:${params.userId}`;
                if (__DEV__) {
                    console.log(`[RUNS_CALLSITE] file=lib/runContext.ts fn=fetchRunsForContext reason=mode=personal userId ts=${Date.now()}`);
                }
                (0, bootstrapLogger_1.logStart)(tag, { userId: params.userId });
                try {
                    const runs = await (0, runService_1.loadRunsForUser)(params.userId, force);
                    (0, bootstrapLogger_1.logSuccess)(tag, { count: runs.length });
                    return runs;
                }
                catch (e) {
                    (0, bootstrapLogger_1.logFailure)(tag, e, { userId: params.userId });
                    throw e;
                }
            }
            // IMPORTANT: Don't fallback to global runs when userId isn't known yet.
            if (__DEV__) {
                console.log(`[RUNS_GUARD] personal mode but missing userId -> returning empty/cached key=${requestKey}`);
            }
            return resolvedByKey.get(requestKey) ?? [];
        }
        if (__DEV__) {
            console.log(`[RUNS_CALLSITE] file=lib/runContext.ts fn=fetchRunsForContext reason=fallbackAllRuns ts=${Date.now()}`);
        }
        return (0, runService_1.loadAllRuns)();
    };
    const promise = execute()
        .then((runs) => {
        resolvedByKey.set(requestKey, runs);
        return runs;
    })
        .finally(() => {
        inFlightByKey.delete(requestKey);
    });
    inFlightByKey.set(requestKey, promise);
    return await promise;
}
exports.default = fetchRunsForContext;

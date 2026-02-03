import { listGroupRuns } from './groupService';
import { logFailure, logStart, logSuccess } from './bootstrapLogger';
import { loadAllGroupRuns, loadAllRuns, loadRunsForUser, type RunDoc } from './runService';

type Mode = 'personal' | 'group';

type RunWithId = RunDoc & { id?: string };

// Per-key dedupe/cache so alternating keys don't spam fetches.
const inFlightByKey = new Map<string, Promise<RunWithId[]>>();
const resolvedByKey = new Map<string, RunWithId[]>();

function buildRequestKey(params: { mode?: Mode; groupId?: string; userId?: string; global?: boolean }) {
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
export async function fetchRunsForContext(params: {
  mode?: Mode;
  groupId?: string;
  userId?: string;
  global?: boolean;
  force?: boolean;
}): Promise<RunWithId[]> {
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

  const execute = async (): Promise<RunWithId[]> => {
    // Explicit global/leaderboard fetch
    if (params.global === true) {
      const tag = 'fetchRunsForContext:global';
      if (__DEV__) {
        console.log(`[RUNS_CALLSITE] file=lib/runContext.ts fn=fetchRunsForContext reason=globalAllRuns ts=${Date.now()}`);
      }
      logStart(tag, {});
      try {
        const runs = await loadAllRuns(force);
        logSuccess(tag, { count: runs.length });
        return runs;
      } catch (e) {
        logFailure(tag, e, {});
        throw e;
      }
    }

    if (mode === 'group' && params.groupId) {
      const tag = `fetchRunsForContext:group:${params.groupId}`;
      logStart(tag, { groupId: params.groupId });
      try {
        const runs = await listGroupRuns(params.groupId);
        logSuccess(tag, { count: runs.length });
        return runs;
      } catch (e) {
        logFailure(tag, e, { groupId: params.groupId });
        throw e;
      }
    }

    if (mode === 'group' && !params.groupId) {
      const tag = 'fetchRunsForContext:group:all';
      logStart(tag, {});
      try {
        const runs = await loadAllGroupRuns();
        logSuccess(tag, { count: runs.length });
        return runs;
      } catch (e) {
        logFailure(tag, e, {});
        throw e;
      }
    }

    if (mode === 'personal') {
      if (params.userId) {
        const tag = `fetchRunsForContext:personal:${params.userId}`;
        if (__DEV__) {
          console.log(`[RUNS_CALLSITE] file=lib/runContext.ts fn=fetchRunsForContext reason=mode=personal userId ts=${Date.now()}`);
        }
        logStart(tag, { userId: params.userId });
        try {
          const runs = await loadRunsForUser(params.userId, force);
          logSuccess(tag, { count: runs.length });
          return runs;
        } catch (e) {
          logFailure(tag, e, { userId: params.userId });
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
    return loadAllRuns();
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

export default fetchRunsForContext;

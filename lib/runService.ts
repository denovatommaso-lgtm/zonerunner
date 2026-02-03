// lib/runService.ts
import {
  addDoc,
  collection,
  doc as firestoreDoc,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { PendingRunsStore } from "./pendingRunsStore";
import { DeletedRunsStore } from "./deletedRunsStore";
import type { RunPoint } from "../types/run";
import { perfBytes, perfStart } from "./perfLogger";

// This is the shape of a run document in Firestore
export type RunDoc = {
  id?: string;
  userId: string;
  mode?: 'personal' | 'group'; // legacy
  scope?: 'personal' | 'group';
  groupId?: string;
  groupRunType?: 'casual' | 'official';
  distance: number;        // meters
  elapsedSeconds: number;  // seconds
  startedAt: string;       // ISO date string
  countryCode?: string;    // ISO country code (2-letter)
  stateCode?: string;      // subdivision code from rankings location dataset
  stateName?: string;      // optional human-readable region/state name
  route: RunPoint[];
  areaKm2?: number;        // km²
  elevationGainM?: number; // meters (sum of positive altitude deltas; best-effort)
  elevationLossM?: number; // meters (sum of negative altitude deltas; best-effort)
  createdAt: number;       // timestamp (ms)
  seq?: number;            // optional sequential number per user
};

export type RunWithId = RunDoc & { id: string };

// Firestore collection reference
const runsCol = collection(db, "runs");
const countersCol = collection(db, "counters"); // per-user counters

let allRunsInFlight: Promise<RunWithId[]> | null = null;
let allRunsSessionCache: RunWithId[] | null = null;

const runsForUserInFlight = new Map<string, Promise<RunWithId[]>>();
const runsForUserSessionCache = new Map<string, RunWithId[]>();

function devLog(message: string, meta?: Record<string, unknown>) {
  if (!__DEV__) return;
  try {
    console.log(`[RunService] ${message} ${meta ? JSON.stringify(meta) : ''}`.trim());
  } catch {
    console.log(`[RunService] ${message}`);
  }
}

/**
 * Idempotently write a run document at a known id.
 * This is the preferred API for reliable saves (supports retry without duplicates).
 */
export async function upsertRun(runId: string, payload: RunDoc) {
  const ref = doc(db, "runs", runId);
  await setDoc(ref, payload, { merge: true });
  return runId;
}

/**
 * Save a run to Firestore.
 * Returns the created document id.
 */
export async function saveRun(
  run: Omit<RunDoc, "createdAt"> & { createdAt?: number }
) {
  const createdAt = run.createdAt ?? Date.now();
  let seq: number | undefined = undefined;

  // Allocate a per-user sequential number using a transaction
  if (run.userId) {
    try {
      const counterRef = firestoreDoc(countersCol, `runs_${run.userId}`);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const current = (snap.exists() ? (snap.data().value as number) : 0) || 0;
        const next = current + 1;
        tx.set(counterRef, { value: next }, { merge: true });
        seq = next;
      });
    } catch (e) {
      // Never let an optional counter write block saving the actual run.
      console.log('Failed to allocate run seq counter; saving run without seq', e);
      seq = undefined;
    }
  }

  const payload: RunDoc = {
    ...run,
    createdAt,
    seq,
    mode: run.mode || run.scope || 'personal',
    scope: run.scope || run.mode || 'personal',
    groupRunType: run.groupRunType || (run.groupId ? 'official' : undefined),
  };

  const docRef = await addDoc(runsCol, payload);
  return docRef.id;
}

function parseGroupRunType(value: unknown): RunDoc['groupRunType'] {
  if (value === 'casual' || value === 'official') return value;
  return undefined;
}

function normalizeRunDoc(data: unknown, id: string): RunWithId {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const rawMode = raw.mode;
  const mode: RunDoc['mode'] =
    rawMode === 'personal' || rawMode === 'group'
      ? rawMode
      : raw.groupId
        ? 'group'
        : raw.userId
          ? 'personal'
          : undefined;
  if (__DEV__ && rawMode !== undefined && rawMode !== 'personal' && rawMode !== 'group') {
    throw new Error(`[RunService] Invalid mode value for run ${id}: ${String(rawMode)}`);
  }
  const groupRunType =
    parseGroupRunType(raw.groupRunType) ?? (raw.groupId ? 'official' : undefined);
  const base = raw as Record<string, unknown>;
  return {
    ...(base as any),
    id,
    mode,
    scope: mode,
    groupRunType,
  };
}

/**
 * Load all runs for a specific user, newest first.
 */
export async function loadRunsForUser(userId: string, force = false): Promise<RunWithId[]> {
  if (!force) {
    const cached = runsForUserSessionCache.get(userId);
    if (cached) {
      devLog('loadRunsForUser session cache hit', { userId, count: cached.length });
      return cached;
    }
  }

  const inflight = runsForUserInFlight.get(userId);
  if (inflight) {
    devLog('loadRunsForUser reuse inFlight', { userId });
    return inflight;
  }

  const endPerf = perfStart({
    screen: "RunService",
    phase: "DATA",
    label: "loadRunsForUser",
    meta: { userId },
  });
  // Use a simple equality query and sort on the client to avoid needing a composite index.
  const q = query(runsCol, where("userId", "==", userId));

  const promise = (async (): Promise<RunWithId[]> => {
    const snap = await getDocs(q);
    const runs = snap.docs.map((doc) => normalizeRunDoc(doc.data(), doc.id));

    const pending = await PendingRunsStore.listRunDocs(userId);
    const deleted = await DeletedRunsStore.getSet();
    const merged = [...pending, ...runs];

    // Deduplicate by id (server wins over pending).
    const seen = new Set<string>();
    const deduped = merged.filter((r) => {
      const id = (r.id ?? '').toString();
      if (!id) return false;
      if (deleted.has(id)) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const sorted = deduped.sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
    );
    endPerf({ count: sorted.length, bytes: perfBytes(sorted) });
    runsForUserSessionCache.set(userId, sorted);
    return sorted;
  })();

  runsForUserInFlight.set(userId, promise);
  try {
    return await promise;
  } finally {
    runsForUserInFlight.delete(userId);
  }
}

/**
 * Load all runs (for leaderboard / global map).
 */
export async function loadAllRuns(force = false): Promise<RunWithId[]> {
  if (!force && allRunsSessionCache) {
    devLog('loadAllRuns session cache hit', { count: allRunsSessionCache.length });
    return allRunsSessionCache;
  }
  if (allRunsInFlight) {
    devLog('loadAllRuns reuse inFlight');
    return allRunsInFlight;
  }
  const endPerf = perfStart({
    screen: "RunService",
    phase: "DATA",
    label: "loadAllRuns",
  });
  const promise = (async (): Promise<RunWithId[]> => {
    const snap = await getDocs(query(runsCol, orderBy("createdAt", "desc")));

    const runs = snap.docs.map((doc) => normalizeRunDoc(doc.data(), doc.id));
    endPerf({ count: runs.length, bytes: perfBytes(runs) });
    allRunsSessionCache = runs;
    return runs;
  })();

  allRunsInFlight = promise;
  try {
    return await promise;
  } finally {
    allRunsInFlight = null;
  }
}

export async function loadAllGroupRuns(): Promise<RunWithId[]> {
  const endPerf = perfStart({
    screen: "RunService",
    phase: "DATA",
    label: "loadAllGroupRuns",
  });
  const snap = await getDocs(
    query(
      runsCol,
      where("mode", "==", "group")
    )
  );
  const runs = snap.docs
    .map((doc) => normalizeRunDoc(doc.data(), doc.id))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  endPerf({ count: runs.length, bytes: perfBytes(runs) });
  return runs;
}

/**
 * Load a single run by id.
 */
export async function loadRunById(id: string) {
  const endPerf = perfStart({
    screen: "RunService",
    phase: "DATA",
    label: "loadRunById",
    meta: { id },
  });
  if (await DeletedRunsStore.has(id)) {
    endPerf({ cached: true });
    return null;
  }

  const ref = doc(db, "runs", id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const run = normalizeRunDoc(snap.data(), snap.id);
    endPerf({ bytes: perfBytes(run) });
    return run;
  }

  // Fallback for locally queued runs (offline or backend failure).
  const pending = await PendingRunsStore.getById(id);
  if (pending?.payload) {
    const run = normalizeRunDoc(pending.payload, id);
    endPerf({ bytes: perfBytes(run) });
    return run;
  }
  endPerf();
  return null;
}

export async function deleteRun(runId: string) {
  // Immediately hide locally (even if backend delete fails).
  await DeletedRunsStore.add(runId);

  // If the run is still pending locally, remove it so it doesn't show up / sync later.
  const pending = await PendingRunsStore.getById(runId);
  if (pending?.userId) {
    await PendingRunsStore.remove(pending.userId, runId).catch(() => {});
  }

  // Best-effort backend delete.
  try {
    const ref = doc(db, "runs", runId);
    await deleteDoc(ref);
  } catch (e) {
    console.log('Failed to delete run from backend (kept deleted locally)', e);
  }
}

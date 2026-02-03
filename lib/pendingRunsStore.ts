import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RunDoc } from './runService';
import { perfBytes, perfStart } from './perfLogger';

export type PendingRunRecord = {
  runId: string;
  userId: string;
  payload: RunDoc;
  createdAt: number;
  attempts: number;
  lastError?: { code?: string; message: string };
};

const LIST_KEY_PREFIX = 'zonerunner:pendingRuns:v3:'; // per-user list
const BY_ID_KEY_PREFIX = 'zonerunner:pendingRunById:v3:'; // global lookup

function listKey(userId: string) {
  return `${LIST_KEY_PREFIX}${userId}`;
}

function byIdKey(runId: string) {
  return `${BY_ID_KEY_PREFIX}${runId}`;
}

async function readList(userId: string): Promise<PendingRunRecord[]> {
  const endPerf = perfStart({
    screen: 'PendingRunsStore',
    phase: 'DATA',
    label: 'readList',
    meta: { userId },
  });
  const raw = await AsyncStorage.getItem(listKey(userId));
  if (!raw) {
    endPerf({ count: 0 });
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? (parsed as PendingRunRecord[]) : [];
    endPerf({ count: items.length, bytes: perfBytes(items) });
    return items;
  } catch {
    endPerf({ parseError: true });
    return [];
  }
}

async function writeList(userId: string, items: PendingRunRecord[]) {
  const endPerf = perfStart({
    screen: 'PendingRunsStore',
    phase: 'DATA',
    label: 'writeList',
    meta: { userId, count: items.length },
  });
  await AsyncStorage.setItem(listKey(userId), JSON.stringify(items));
  endPerf({ bytes: perfBytes(items) });
}

export const PendingRunsStore = {
  async upsert(userId: string, record: PendingRunRecord) {
    const endPerf = perfStart({
      screen: 'PendingRunsStore',
      phase: 'DATA',
      label: 'upsert',
      meta: { userId, runId: record.runId },
    });
    const existing = await readList(userId);
    const next = [record, ...existing.filter((r) => r.runId !== record.runId)].slice(0, 100);
    await AsyncStorage.multiSet([
      [listKey(userId), JSON.stringify(next)],
      [byIdKey(record.runId), JSON.stringify(record)],
    ]);
    endPerf({ count: next.length });
  },

  async remove(userId: string, runId: string) {
    const endPerf = perfStart({
      screen: 'PendingRunsStore',
      phase: 'DATA',
      label: 'remove',
      meta: { userId, runId },
    });
    const existing = await readList(userId);
    const next = existing.filter((r) => r.runId !== runId);
    await AsyncStorage.multiRemove([byIdKey(runId)]);
    await writeList(userId, next);
    endPerf({ count: next.length });
  },

  async list(userId: string) {
    const endPerf = perfStart({
      screen: 'PendingRunsStore',
      phase: 'DATA',
      label: 'list',
      meta: { userId },
    });
    const items = await readList(userId);
    endPerf({ count: items.length });
    return items;
  },

  async getById(runId: string): Promise<PendingRunRecord | null> {
    const endPerf = perfStart({
      screen: 'PendingRunsStore',
      phase: 'DATA',
      label: 'getById',
      meta: { runId },
    });
    const raw = await AsyncStorage.getItem(byIdKey(runId));
    if (!raw) {
      endPerf({ hit: false });
      return null;
    }
    try {
      const item = JSON.parse(raw) as PendingRunRecord;
      endPerf({ hit: true, bytes: perfBytes(item) });
      return item;
    } catch {
      endPerf({ parseError: true });
      return null;
    }
  },

  async listRunDocs(userId: string): Promise<(RunDoc & { id: string; pending?: boolean })[]> {
    const endPerf = perfStart({
      screen: 'PendingRunsStore',
      phase: 'DATA',
      label: 'listRunDocs',
      meta: { userId },
    });
    const items = await readList(userId);
    const docs = items.map((r) => ({
      ...(r.payload as RunDoc),
      id: r.runId,
      pending: true,
    }));
    endPerf({ count: docs.length, bytes: perfBytes(docs) });
    return docs;
  },
};

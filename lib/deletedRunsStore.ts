import AsyncStorage from '@react-native-async-storage/async-storage';
import { perfBytes, perfStart } from './perfLogger';

const KEY = 'zonerunner:deletedRuns:v1';
const MAX = 500;

async function read(): Promise<string[]> {
  const endPerf = perfStart({
    screen: 'DeletedRunsStore',
    phase: 'DATA',
    label: 'read',
  });
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    endPerf({ count: 0 });
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? (parsed.filter((x) => typeof x === 'string') as string[]) : [];
    endPerf({ count: ids.length, bytes: perfBytes(ids) });
    return ids;
  } catch {
    endPerf({ parseError: true });
    return [];
  }
}

async function write(ids: string[]) {
  const endPerf = perfStart({
    screen: 'DeletedRunsStore',
    phase: 'DATA',
    label: 'write',
    meta: { count: ids.length },
  });
  await AsyncStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  endPerf({ bytes: perfBytes(ids) });
}

export const DeletedRunsStore = {
  async add(runId: string) {
    const endPerf = perfStart({
      screen: 'DeletedRunsStore',
      phase: 'DATA',
      label: 'add',
      meta: { runId },
    });
    const existing = await read();
    if (existing.includes(runId)) {
      endPerf({ skipped: true });
      return;
    }
    await write([runId, ...existing]);
    endPerf({ count: existing.length + 1 });
  },

  async has(runId: string): Promise<boolean> {
    const endPerf = perfStart({
      screen: 'DeletedRunsStore',
      phase: 'DATA',
      label: 'has',
      meta: { runId },
    });
    const existing = await read();
    const hit = existing.includes(runId);
    endPerf({ hit });
    return hit;
  },

  async getSet(): Promise<Set<string>> {
    const endPerf = perfStart({
      screen: 'DeletedRunsStore',
      phase: 'DATA',
      label: 'getSet',
    });
    const items = await read();
    endPerf({ count: items.length });
    return new Set(items);
  },
};

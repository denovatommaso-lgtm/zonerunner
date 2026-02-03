import { Platform } from 'react-native';

const STORE_NAME = 'zonerunner-offline';
const QUEUE_KEY = 'pending-events';

let lfPromise: Promise<any> | null = null;

async function getStore() {
  if (Platform.OS !== 'web') return null;
  if (!lfPromise) {
    lfPromise = import('localforage').then((lf) =>
      lf.createInstance({ name: STORE_NAME })
    );
  }
  return lfPromise;
}

export type OfflineEvent = {
  id: string;
  type: string;
  createdAt: number;
  payload: Record<string, unknown>;
};

export async function enqueueEvent(evt: OfflineEvent) {
  const store = await getStore();
  if (!store) return;
  const list = ((await store.getItem(QUEUE_KEY)) as OfflineEvent[]) ?? [];
  list.push(evt);
  await store.setItem(QUEUE_KEY, list);
}

export async function loadQueue(): Promise<OfflineEvent[]> {
  const store = await getStore();
  if (!store) return [];
  return ((await store.getItem(QUEUE_KEY)) as OfflineEvent[]) ?? [];
}

export async function replaceQueue(next: OfflineEvent[]) {
  const store = await getStore();
  if (!store) return;
  await store.setItem(QUEUE_KEY, next);
}

export async function flushQueueWhenOnline(handler: (evt: OfflineEvent) => Promise<boolean>) {
  if (Platform.OS !== 'web') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const queue = await loadQueue();
  if (!queue.length) return;
  const remaining: OfflineEvent[] = [];
  for (const evt of queue) {
    try {
      const ok = await handler(evt);
      if (!ok) remaining.push(evt);
    } catch {
      remaining.push(evt);
    }
  }
  await replaceQueue(remaining);
}

import { Platform } from 'react-native';
import type { TerritoryFeature } from './territoryEngine';

const STORE_NAME = 'zonerunner-offline';
const TERRITORY_KEY_PREFIX = 'territories:';
const LAST_STATE_KEY = 'last-session';

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

function territoryKey(params: { mode: string; userId?: string; groupId?: string }) {
  const scope = params.mode;
  const user = params.userId ?? 'none';
  const group = params.groupId ?? 'none';
  return `${TERRITORY_KEY_PREFIX}${scope}:${user}:${group}`;
}

export async function saveTerritories(params: {
  mode: 'personal' | 'group' | 'community';
  userId?: string;
  groupId?: string;
  territories: Map<string, TerritoryFeature | null>;
}) {
  const store = await getStore();
  if (!store) return;
  const entries = Array.from(params.territories.entries()).map(([ownerId, feature]) => [ownerId, feature]);
  await store.setItem(territoryKey(params), entries);
  await store.setItem(LAST_STATE_KEY, {
    savedAt: Date.now(),
    mode: params.mode,
    userId: params.userId ?? null,
    groupId: params.groupId ?? null,
  });
}

export async function loadTerritories(params: {
  mode: 'personal' | 'group' | 'community';
  userId?: string;
  groupId?: string;
}): Promise<Map<string, TerritoryFeature | null> | null> {
  const store = await getStore();
  if (!store) return null;
  const raw = await store.getItem(territoryKey(params));
  if (!raw || !Array.isArray(raw)) return null;
  return new Map(raw as Array<[string, TerritoryFeature | null]>);
}

export async function saveLastSession(data: Record<string, unknown>) {
  const store = await getStore();
  if (!store) return;
  await store.setItem(LAST_STATE_KEY, { ...data, savedAt: Date.now() });
}

export async function loadLastSession(): Promise<Record<string, unknown> | null> {
  const store = await getStore();
  if (!store) return null;
  return (await store.getItem(LAST_STATE_KEY)) as Record<string, unknown> | null;
}

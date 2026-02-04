import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { auth } from '../firebaseConfig';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
const FUNCTIONS_BASE_URL =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
  'https://us-central1-zonerunner-e6cd8.cloudfunctions.net';

export const LAST_TERRITORY_AREA_KEY = 'zonerunner:notify:lastTerritoryAreaKm2';
export const LAST_TERRITORY_NOTIFY_AT_KEY = 'zonerunner:notify:lastTerritoryNotifyAtMs';

export type LocalNotificationPayload = {
  title: string;
  body?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

export function isWebNotificationSupported() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;
}

export function isWebPushSupported() {
  return (
    isWebNotificationSupported() &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isWebNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export function showLocalNotification(payload: LocalNotificationPayload) {
  if (!isWebNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  const title = payload.title || 'ZoneRunner';
  try {
    // eslint-disable-next-line no-new
    new Notification(title, {
      body: payload.body,
      tag: payload.tag,
      data: payload.data,
      icon: '/icons/icon-192.png',
    });
  } catch {
    // ignore
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function callFunction(path: string, body: Record<string, unknown>) {
  if (!auth.currentUser) throw new Error('Sign in required');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

export async function registerPushSubscription(): Promise<PushSubscription> {
  if (!isWebPushSupported()) throw new Error('Push not supported on this device');
  if (!VAPID_PUBLIC_KEY) throw new Error('Missing VAPID public key');
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') throw new Error('Notifications permission denied');

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  await callFunction('registerPushSubscription', {
    subscription: subscription.toJSON(),
    client: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      platform: Platform.OS,
    },
  });

  return subscription;
}

export async function unregisterPushSubscription() {
  if (!isWebPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await callFunction('unregisterPushSubscription', {
      endpoint: subscription.endpoint,
    });
  } catch {
    // ignore
  }
  await subscription.unsubscribe();
}

export async function sendTestPushNotification() {
  await callFunction('sendTestPush', {});
}

export async function loadLastTerritoryAreaKm2(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_TERRITORY_AREA_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

export async function saveLastTerritoryAreaKm2(value: number) {
  try {
    await AsyncStorage.setItem(LAST_TERRITORY_AREA_KEY, String(value));
  } catch {
    // ignore
  }
}

export async function loadLastTerritoryNotifyAtMs(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_TERRITORY_NOTIFY_AT_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

export async function saveLastTerritoryNotifyAtMs(value: number) {
  try {
    await AsyncStorage.setItem(LAST_TERRITORY_NOTIFY_AT_KEY, String(value));
  } catch {
    // ignore
  }
}

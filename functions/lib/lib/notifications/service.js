"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAST_TERRITORY_NOTIFY_AT_KEY = exports.LAST_TERRITORY_AREA_KEY = void 0;
exports.isWebNotificationSupported = isWebNotificationSupported;
exports.isWebPushSupported = isWebPushSupported;
exports.requestNotificationPermission = requestNotificationPermission;
exports.showLocalNotification = showLocalNotification;
exports.registerPushSubscription = registerPushSubscription;
exports.unregisterPushSubscription = unregisterPushSubscription;
exports.sendTestPushNotification = sendTestPushNotification;
exports.loadLastTerritoryAreaKm2 = loadLastTerritoryAreaKm2;
exports.saveLastTerritoryAreaKm2 = saveLastTerritoryAreaKm2;
exports.loadLastTerritoryNotifyAtMs = loadLastTerritoryNotifyAtMs;
exports.saveLastTerritoryNotifyAtMs = saveLastTerritoryNotifyAtMs;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const react_native_1 = require("react-native");
const firebaseConfig_1 = require("../firebaseConfig");
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
const FUNCTIONS_BASE_URL = process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
    'https://us-central1-zonerunner-e6cd8.cloudfunctions.net';
exports.LAST_TERRITORY_AREA_KEY = 'zonerunner:notify:lastTerritoryAreaKm2';
exports.LAST_TERRITORY_NOTIFY_AT_KEY = 'zonerunner:notify:lastTerritoryNotifyAtMs';
function isWebNotificationSupported() {
    return react_native_1.Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;
}
function isWebPushSupported() {
    return (isWebNotificationSupported() &&
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window);
}
async function requestNotificationPermission() {
    if (!isWebNotificationSupported())
        return 'denied';
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
        return Notification.permission;
    }
    return Notification.requestPermission();
}
function showLocalNotification(payload) {
    if (!isWebNotificationSupported())
        return;
    if (Notification.permission !== 'granted')
        return;
    const title = payload.title || 'ZoneRunner';
    try {
        // eslint-disable-next-line no-new
        new Notification(title, {
            body: payload.body,
            tag: payload.tag,
            data: payload.data,
            icon: '/icons/icon-192.png',
        });
    }
    catch {
        // ignore
    }
}
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
async function callFunction(path, body) {
    if (!firebaseConfig_1.auth.currentUser)
        throw new Error('Sign in required');
    const token = await firebaseConfig_1.auth.currentUser.getIdToken();
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
async function registerPushSubscription() {
    if (!isWebPushSupported())
        throw new Error('Push not supported on this device');
    if (!VAPID_PUBLIC_KEY)
        throw new Error('Missing VAPID public key');
    const permission = await requestNotificationPermission();
    if (permission !== 'granted')
        throw new Error('Notifications permission denied');
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ??
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
    await callFunction('registerPushSubscription', {
        subscription: subscription.toJSON(),
        client: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            platform: react_native_1.Platform.OS,
        },
    });
    return subscription;
}
async function unregisterPushSubscription() {
    if (!isWebPushSupported())
        return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription)
        return;
    try {
        await callFunction('unregisterPushSubscription', {
            endpoint: subscription.endpoint,
        });
    }
    catch {
        // ignore
    }
    await subscription.unsubscribe();
}
async function sendTestPushNotification() {
    await callFunction('sendTestPush', {});
}
async function loadLastTerritoryAreaKm2() {
    try {
        const raw = await async_storage_1.default.getItem(exports.LAST_TERRITORY_AREA_KEY);
        if (!raw)
            return null;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
    }
    catch {
        return null;
    }
}
async function saveLastTerritoryAreaKm2(value) {
    try {
        await async_storage_1.default.setItem(exports.LAST_TERRITORY_AREA_KEY, String(value));
    }
    catch {
        // ignore
    }
}
async function loadLastTerritoryNotifyAtMs() {
    try {
        const raw = await async_storage_1.default.getItem(exports.LAST_TERRITORY_NOTIFY_AT_KEY);
        if (!raw)
            return null;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
    }
    catch {
        return null;
    }
}
async function saveLastTerritoryNotifyAtMs(value) {
    try {
        await async_storage_1.default.setItem(exports.LAST_TERRITORY_NOTIFY_AT_KEY, String(value));
    }
    catch {
        // ignore
    }
}

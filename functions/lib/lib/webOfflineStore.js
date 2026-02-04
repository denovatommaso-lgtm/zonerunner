"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveTerritories = saveTerritories;
exports.loadTerritories = loadTerritories;
exports.saveLastSession = saveLastSession;
exports.loadLastSession = loadLastSession;
const react_native_1 = require("react-native");
const STORE_NAME = 'zonerunner-offline';
const TERRITORY_KEY_PREFIX = 'territories:';
const LAST_STATE_KEY = 'last-session';
let lfPromise = null;
async function getStore() {
    if (react_native_1.Platform.OS !== 'web')
        return null;
    if (!lfPromise) {
        lfPromise = Promise.resolve().then(() => __importStar(require('localforage'))).then((lf) => lf.createInstance({ name: STORE_NAME }));
    }
    return lfPromise;
}
function territoryKey(params) {
    const scope = params.mode;
    const user = params.userId ?? 'none';
    const group = params.groupId ?? 'none';
    return `${TERRITORY_KEY_PREFIX}${scope}:${user}:${group}`;
}
async function saveTerritories(params) {
    const store = await getStore();
    if (!store)
        return;
    const entries = Array.from(params.territories.entries()).map(([ownerId, feature]) => [ownerId, feature]);
    await store.setItem(territoryKey(params), entries);
    await store.setItem(LAST_STATE_KEY, {
        savedAt: Date.now(),
        mode: params.mode,
        userId: params.userId ?? null,
        groupId: params.groupId ?? null,
    });
}
async function loadTerritories(params) {
    const store = await getStore();
    if (!store)
        return null;
    const raw = await store.getItem(territoryKey(params));
    if (!raw || !Array.isArray(raw))
        return null;
    return new Map(raw);
}
async function saveLastSession(data) {
    const store = await getStore();
    if (!store)
        return;
    await store.setItem(LAST_STATE_KEY, { ...data, savedAt: Date.now() });
}
async function loadLastSession() {
    const store = await getStore();
    if (!store)
        return null;
    return (await store.getItem(LAST_STATE_KEY));
}

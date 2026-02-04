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
exports.enqueueEvent = enqueueEvent;
exports.loadQueue = loadQueue;
exports.replaceQueue = replaceQueue;
exports.flushQueueWhenOnline = flushQueueWhenOnline;
const react_native_1 = require("react-native");
const STORE_NAME = 'zonerunner-offline';
const QUEUE_KEY = 'pending-events';
let lfPromise = null;
async function getStore() {
    if (react_native_1.Platform.OS !== 'web')
        return null;
    if (!lfPromise) {
        lfPromise = Promise.resolve().then(() => __importStar(require('localforage'))).then((lf) => lf.createInstance({ name: STORE_NAME }));
    }
    return lfPromise;
}
async function enqueueEvent(evt) {
    const store = await getStore();
    if (!store)
        return;
    const list = (await store.getItem(QUEUE_KEY)) ?? [];
    list.push(evt);
    await store.setItem(QUEUE_KEY, list);
}
async function loadQueue() {
    const store = await getStore();
    if (!store)
        return [];
    return (await store.getItem(QUEUE_KEY)) ?? [];
}
async function replaceQueue(next) {
    const store = await getStore();
    if (!store)
        return;
    await store.setItem(QUEUE_KEY, next);
}
async function flushQueueWhenOnline(handler) {
    if (react_native_1.Platform.OS !== 'web')
        return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
        return;
    const queue = await loadQueue();
    if (!queue.length)
        return;
    const remaining = [];
    for (const evt of queue) {
        try {
            const ok = await handler(evt);
            if (!ok)
                remaining.push(evt);
        }
        catch {
            remaining.push(evt);
        }
    }
    await replaceQueue(remaining);
}

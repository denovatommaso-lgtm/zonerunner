"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeletedRunsStore = void 0;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const perfLogger_1 = require("./perfLogger");
const KEY = 'zonerunner:deletedRuns:v1';
const MAX = 500;
async function read() {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: 'DeletedRunsStore',
        phase: 'DATA',
        label: 'read',
    });
    const raw = await async_storage_1.default.getItem(KEY);
    if (!raw) {
        endPerf({ count: 0 });
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        const ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
        endPerf({ count: ids.length, bytes: (0, perfLogger_1.perfBytes)(ids) });
        return ids;
    }
    catch {
        endPerf({ parseError: true });
        return [];
    }
}
async function write(ids) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: 'DeletedRunsStore',
        phase: 'DATA',
        label: 'write',
        meta: { count: ids.length },
    });
    await async_storage_1.default.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
    endPerf({ bytes: (0, perfLogger_1.perfBytes)(ids) });
}
exports.DeletedRunsStore = {
    async add(runId) {
        const endPerf = (0, perfLogger_1.perfStart)({
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
    async has(runId) {
        const endPerf = (0, perfLogger_1.perfStart)({
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
    async getSet() {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'DeletedRunsStore',
            phase: 'DATA',
            label: 'getSet',
        });
        const items = await read();
        endPerf({ count: items.length });
        return new Set(items);
    },
};

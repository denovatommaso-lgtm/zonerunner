"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingRunsStore = void 0;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const perfLogger_1 = require("./perfLogger");
const LIST_KEY_PREFIX = 'zonerunner:pendingRuns:v3:'; // per-user list
const BY_ID_KEY_PREFIX = 'zonerunner:pendingRunById:v3:'; // global lookup
function listKey(userId) {
    return `${LIST_KEY_PREFIX}${userId}`;
}
function byIdKey(runId) {
    return `${BY_ID_KEY_PREFIX}${runId}`;
}
async function readList(userId) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: 'PendingRunsStore',
        phase: 'DATA',
        label: 'readList',
        meta: { userId },
    });
    const raw = await async_storage_1.default.getItem(listKey(userId));
    if (!raw) {
        endPerf({ count: 0 });
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : [];
        endPerf({ count: items.length, bytes: (0, perfLogger_1.perfBytes)(items) });
        return items;
    }
    catch {
        endPerf({ parseError: true });
        return [];
    }
}
async function writeList(userId, items) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: 'PendingRunsStore',
        phase: 'DATA',
        label: 'writeList',
        meta: { userId, count: items.length },
    });
    await async_storage_1.default.setItem(listKey(userId), JSON.stringify(items));
    endPerf({ bytes: (0, perfLogger_1.perfBytes)(items) });
}
exports.PendingRunsStore = {
    async upsert(userId, record) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'PendingRunsStore',
            phase: 'DATA',
            label: 'upsert',
            meta: { userId, runId: record.runId },
        });
        const existing = await readList(userId);
        const next = [record, ...existing.filter((r) => r.runId !== record.runId)].slice(0, 100);
        await async_storage_1.default.multiSet([
            [listKey(userId), JSON.stringify(next)],
            [byIdKey(record.runId), JSON.stringify(record)],
        ]);
        endPerf({ count: next.length });
    },
    async remove(userId, runId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'PendingRunsStore',
            phase: 'DATA',
            label: 'remove',
            meta: { userId, runId },
        });
        const existing = await readList(userId);
        const next = existing.filter((r) => r.runId !== runId);
        await async_storage_1.default.multiRemove([byIdKey(runId)]);
        await writeList(userId, next);
        endPerf({ count: next.length });
    },
    async list(userId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'PendingRunsStore',
            phase: 'DATA',
            label: 'list',
            meta: { userId },
        });
        const items = await readList(userId);
        endPerf({ count: items.length });
        return items;
    },
    async getById(runId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'PendingRunsStore',
            phase: 'DATA',
            label: 'getById',
            meta: { runId },
        });
        const raw = await async_storage_1.default.getItem(byIdKey(runId));
        if (!raw) {
            endPerf({ hit: false });
            return null;
        }
        try {
            const item = JSON.parse(raw);
            endPerf({ hit: true, bytes: (0, perfLogger_1.perfBytes)(item) });
            return item;
        }
        catch {
            endPerf({ parseError: true });
            return null;
        }
    },
    async listRunDocs(userId) {
        const endPerf = (0, perfLogger_1.perfStart)({
            screen: 'PendingRunsStore',
            phase: 'DATA',
            label: 'listRunDocs',
            meta: { userId },
        });
        const items = await readList(userId);
        const docs = items.map((r) => ({
            ...r.payload,
            id: r.runId,
            pending: true,
        }));
        endPerf({ count: docs.length, bytes: (0, perfLogger_1.perfBytes)(docs) });
        return docs;
    },
};

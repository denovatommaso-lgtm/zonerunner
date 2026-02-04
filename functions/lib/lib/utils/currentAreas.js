"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCurrentAreasFromRuns = computeCurrentAreasFromRuns;
const territoryEngine_1 = require("../territoryEngine");
function computeCurrentAreasFromRuns(runs, opts) {
    const territoryRuns = [];
    const seen = new Set();
    const filtered = opts.mode === 'group'
        ? runs.filter((r) => !!r.groupId &&
            (r.groupRunType ?? r.mode) === 'official' &&
            (!opts.activeGroupId || r.groupId === opts.activeGroupId))
        : runs.filter((r) => !!r.userId && !r.groupId && r.mode !== 'group');
    for (const run of filtered) {
        const id = (run.id ?? '').toString();
        if (id && seen.has(id))
            continue;
        if (id)
            seen.add(id);
        const ownerId = opts.mode === 'group' ? run.groupId : run.userId;
        if (!ownerId)
            continue;
        if (!Array.isArray(run.route) || run.route.length < 3)
            continue;
        territoryRuns.push({
            userId: ownerId,
            route: run.route,
            startedAt: run.startedAt,
            createdAt: run.createdAt,
        });
    }
    const territories = (0, territoryEngine_1.rebuildTerritoriesFromRuns)(territoryRuns);
    const areaByOwner = new Map();
    territories.forEach((terr, ownerId) => {
        areaByOwner.set(ownerId, (0, territoryEngine_1.territoryAreaKm2)(terr));
    });
    return areaByOwner;
}

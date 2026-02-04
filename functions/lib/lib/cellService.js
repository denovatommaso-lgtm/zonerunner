"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimCellsForRun = claimCellsForRun;
exports.loadAllCells = loadAllCells;
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const territoryGrid_1 = require("./territoryGrid");
const perfLogger_1 = require("./perfLogger");
const cellsCol = (0, firestore_1.collection)(firebaseConfig_1.db, "cells");
function cellId(latIndex, lonIndex) {
    return `${latIndex}_${lonIndex}`;
}
async function claimCellsForRun(route, ownerId, timestamp) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "CellService",
        phase: "DATA",
        label: "claimCellsForRun",
        meta: { ownerId, points: route?.length ?? 0 },
    });
    if (!ownerId || !route || route.length < 3) {
        endPerf({ skipped: true });
        return;
    }
    const cells = (0, territoryGrid_1.rasterizePolygonToCells)(route);
    const chunks = 400; // keep under Firestore batch limit
    for (let i = 0; i < cells.length; i += chunks) {
        const batch = (0, firestore_1.writeBatch)(firebaseConfig_1.db);
        const slice = cells.slice(i, i + chunks);
        slice.forEach(({ cellX, cellY }) => {
            const ref = (0, firestore_1.doc)(cellsCol, cellId(cellY, cellX)); // latIndex_lonIndex
            batch.set(ref, {
                ownerId,
                updatedAt: timestamp,
                cellSizeMeters: territoryGrid_1.CELL_SIZE_METERS,
                latIndex: cellY,
                lonIndex: cellX,
            });
        });
        await batch.commit();
    }
    endPerf({ cells: cells.length });
}
async function loadAllCells() {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "CellService",
        phase: "DATA",
        label: "loadAllCells",
    });
    const snap = await (0, firestore_1.getDocs)(cellsCol);
    const cells = snap.docs.map((d) => {
        const data = d.data();
        // Reverse latIndex/lonIndex to cell center
        const center = (0, territoryGrid_1.cellCenter)(data.lonIndex, data.latIndex);
        return { id: d.id, ...data, center };
    });
    endPerf({ count: cells.length, bytes: (0, perfLogger_1.perfBytes)(cells) });
    return cells;
}

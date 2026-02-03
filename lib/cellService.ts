import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import {
  CELL_SIZE_METERS,
  Coord,
  rasterizePolygonToCells,
  cellCenter,
} from "./territoryGrid";
import { perfBytes, perfStart } from "./perfLogger";

const cellsCol = collection(db, "cells");

export type CellDoc = {
  ownerId: string;
  updatedAt: number;
  cellSizeMeters: number;
  latIndex: number;
  lonIndex: number;
};

function cellId(latIndex: number, lonIndex: number) {
  return `${latIndex}_${lonIndex}`;
}

export async function claimCellsForRun(
  route: Coord[],
  ownerId: string,
  timestamp: number
) {
  const endPerf = perfStart({
    screen: "CellService",
    phase: "DATA",
    label: "claimCellsForRun",
    meta: { ownerId, points: route?.length ?? 0 },
  });
  if (!ownerId || !route || route.length < 3) {
    endPerf({ skipped: true });
    return;
  }

  const cells = rasterizePolygonToCells(route);
  const chunks = 400; // keep under Firestore batch limit
  for (let i = 0; i < cells.length; i += chunks) {
    const batch = writeBatch(db);
    const slice = cells.slice(i, i + chunks);
    slice.forEach(({ cellX, cellY }) => {
      const ref = doc(cellsCol, cellId(cellY, cellX)); // latIndex_lonIndex
      batch.set(ref, {
        ownerId,
        updatedAt: timestamp,
        cellSizeMeters: CELL_SIZE_METERS,
        latIndex: cellY,
        lonIndex: cellX,
      } as CellDoc);
    });
    await batch.commit();
  }
  endPerf({ cells: cells.length });
}

export async function loadAllCells(): Promise<
  (CellDoc & { id: string; center: Coord })[]
> {
  const endPerf = perfStart({
    screen: "CellService",
    phase: "DATA",
    label: "loadAllCells",
  });
  const snap = await getDocs(cellsCol);
  const cells = snap.docs.map((d) => {
    const data = d.data() as CellDoc;
    // Reverse latIndex/lonIndex to cell center
    const center = cellCenter(data.lonIndex, data.latIndex);
    return { id: d.id, ...data, center };
  });
  endPerf({ count: cells.length, bytes: perfBytes(cells) });
  return cells;
}

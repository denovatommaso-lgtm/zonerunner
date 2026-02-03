// Helper utilities for snapping lat/lon to a square grid and rasterizing polygons.
// Uses a simple equirectangular approximation which is fine for small areas (city scale).

export type Coord = { latitude: number; longitude: number };

// Base cell size. Bigger = fewer cells (faster), smaller = smoother shape (slower).
export const CELL_SIZE_METERS = 24;
// Coarse cells cover the interior; edge cells are refined using the fine size above.
const COARSE_MULTIPLIER = 4;
const COARSE_CELL_METERS = CELL_SIZE_METERS * COARSE_MULTIPLIER;

const METERS_PER_DEG_LAT = 111_111; // meters per degree latitude

function metersPerDegLon(lat: number) {
  const latRad = (lat * Math.PI) / 180;
  return METERS_PER_DEG_LAT * Math.cos(latRad);
}

export function coordToCell(lat: number, lon: number, cellSizeMeters = CELL_SIZE_METERS) {
  const mPerDegLon = metersPerDegLon(lat);
  const xMeters = lon * mPerDegLon;
  const yMeters = lat * METERS_PER_DEG_LAT;
  const cellX = Math.floor(xMeters / cellSizeMeters);
  const cellY = Math.floor(yMeters / cellSizeMeters);
  return { cellX, cellY };
}

export function cellCenter(cellX: number, cellY: number, cellSizeMeters = CELL_SIZE_METERS): Coord {
  const yMeters = (cellY + 0.5) * cellSizeMeters;
  const xMeters = (cellX + 0.5) * cellSizeMeters;
  const lat = yMeters / METERS_PER_DEG_LAT;
  const lon = xMeters / metersPerDegLon(lat);
  return { latitude: lat, longitude: lon };
}

export function cellPolygon(cellX: number, cellY: number, cellSizeMeters = CELL_SIZE_METERS): Coord[] {
  const half = cellSizeMeters / 2;
  const center = cellCenter(cellX, cellY, cellSizeMeters);
  const mPerDegLon = metersPerDegLon(center.latitude);

  const dLat = half / METERS_PER_DEG_LAT;
  const dLon = half / mPerDegLon;

  return [
    { latitude: center.latitude - dLat, longitude: center.longitude - dLon },
    { latitude: center.latitude - dLat, longitude: center.longitude + dLon },
    { latitude: center.latitude + dLat, longitude: center.longitude + dLon },
    { latitude: center.latitude + dLat, longitude: center.longitude - dLon },
  ];
}

// Point-in-polygon (ray casting) for small polygons
export function pointInPolygon(point: Coord, polygon: Coord[]): boolean {
  if (polygon.length < 3) return false;
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect =
      yi > y !== yj > y &&
      x <
        ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) +
          xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Rasterize a polygon into grid cells by sampling each cell center in the bounding box:
// 1) Build a bounding box around the polygon (with a 1-cell padding to avoid edge gaps).
// 2) Walk every grid cell that intersects that padded box.
// 3) Test if the cell center is inside the polygon (ray casting).
// 4) Keep only inside cells. These cells drive both rendering and area math.
export function rasterizePolygonToCells(
  route: Coord[],
  opts?: {
    maxCells?: number; // cap to avoid heavy computation; larger polygons will auto-increase cell size.
  }
): { cellX: number; cellY: number; cellSizeMeters: number }[] {
  if (!route || route.length < 3) return [];

  const lats = route.map((p) => p.latitude);
  const lons = route.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Approximate bounding box size in meters to estimate how many cells we'd generate.
  const midLat = (minLat + maxLat) / 2;
  const widthMeters = (maxLon - minLon) * metersPerDegLon(midLat);
  const heightMeters = (maxLat - minLat) * METERS_PER_DEG_LAT;

  // Choose a dynamic cell size to keep computation reasonable on huge polygons.
  let cellSizeMeters = CELL_SIZE_METERS;
  const maxCells = opts?.maxCells && opts.maxCells > 0 ? opts.maxCells : undefined;
  if (opts?.maxCells && opts.maxCells > 0) {
    const estCells = (widthMeters / cellSizeMeters) * (heightMeters / cellSizeMeters);
    if (estCells > opts.maxCells) {
      const adjusted = Math.sqrt((widthMeters * heightMeters) / opts.maxCells);
      // Never go smaller than base, only larger when needed for perf.
      cellSizeMeters = Math.max(CELL_SIZE_METERS, adjusted);
    }
  }

  // Determine cell bounds for the bounding box (with a 1-cell padding to overshoot borders).
  const cornerCells = [
    coordToCell(minLat, minLon, COARSE_CELL_METERS),
    coordToCell(minLat, maxLon, COARSE_CELL_METERS),
    coordToCell(maxLat, minLon, COARSE_CELL_METERS),
    coordToCell(maxLat, maxLon, COARSE_CELL_METERS),
  ];
  const cellXs = cornerCells.map((c) => c.cellX);
  const cellYs = cornerCells.map((c) => c.cellY);
  const minCellX = Math.min(...cellXs) - 1;
  const maxCellX = Math.max(...cellXs) + 1;
  const minCellY = Math.min(...cellYs) - 1;
  const maxCellY = Math.max(...cellYs) + 1;

  const cells: { cellX: number; cellY: number; cellSizeMeters: number }[] = [];

  // Helper to add fine cells inside a coarse cell
  const addFineCells = (baseX: number, baseY: number) => {
    const finePerCoarse = COARSE_MULTIPLIER;
    for (let fy = 0; fy < finePerCoarse; fy++) {
      for (let fx = 0; fx < finePerCoarse; fx++) {
        const fineX = baseX * finePerCoarse + fx;
        const fineY = baseY * finePerCoarse + fy;
        const center = cellCenter(fineX, fineY, CELL_SIZE_METERS);
        if (pointInPolygon(center, route)) {
          cells.push({ cellX: fineX, cellY: fineY, cellSizeMeters: CELL_SIZE_METERS });
        }
      }
    }
  };

  // Coarse scan for interior; refine along edges by subdividing coarse cells that touch the boundary.
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const center = cellCenter(cx, cy, COARSE_CELL_METERS);
      const corners = cellPolygon(cx, cy, COARSE_CELL_METERS);

      // All corners inside => treat as solid interior coarse cell
      const allInside = corners.every((p) => pointInPolygon(p, route));

      if (allInside && pointInPolygon(center, route)) {
        cells.push({ cellX: cx, cellY: cy, cellSizeMeters: COARSE_CELL_METERS });
      } else {
        // Edge zone: subdivide to fine cells
        addFineCells(cx, cy);
      }
    }
  }

  return cells;
}

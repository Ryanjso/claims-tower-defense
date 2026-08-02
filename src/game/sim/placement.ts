import { TERRAIN_CELL, TERRAIN_COLS, TERRAIN_ROWS, TERRAIN_MASK } from '../data/terrain.generated';
import { ZONES, zoneAt } from '../data/zones';
import type { TowerId } from '../types';
import { PATH } from './Path';

/** Radius a tower occupies on the map, in pixels. */
export const TOWER_RADIUS = 24;

/**
 * Footprint used for the terrain test. Deliberately smaller than the drawn tower
 * so a sprite may overhang a rock or a tree edge by a few pixels — checking the
 * full visual radius makes placement feel fussy without making it any clearer.
 */
export const FOOTPRINT_RADIUS = 17;

export type PlacementResult =
  | { ok: true; zone: string | null }
  | { ok: false; reason: string };

const cellOpen = (cx: number, cy: number) =>
  cx >= 0 && cx < TERRAIN_COLS && cy >= 0 && cy < TERRAIN_ROWS && TERRAIN_MASK[cy][cx] === '1';

/**
 * Coarse distance-to-path field, built once by stamping a disc around every path
 * sample. Placement previews run this on every pointer move and the balance
 * harness runs it tens of thousands of times, so the exact O(samples) scan in
 * PathLookup.nearest is far too slow for the hot path.
 */
const DF_CELL = 8;
const DF_MAX = 96;
const DF_COLS = Math.ceil((TERRAIN_COLS * TERRAIN_CELL) / DF_CELL);
const DF_ROWS = Math.ceil((TERRAIN_ROWS * TERRAIN_CELL) / DF_CELL);

const pathDistance = (() => {
  const field = new Float32Array(DF_COLS * DF_ROWS).fill(DF_MAX);
  const reach = Math.ceil(DF_MAX / DF_CELL);
  for (let a = 0; a <= PATH.length; a += 4) {
    const px = PATH.posX(a);
    const py = PATH.posY(a);
    const cx = Math.round(px / DF_CELL);
    const cy = Math.round(py / DF_CELL);
    for (let gy = cy - reach; gy <= cy + reach; gy++) {
      if (gy < 0 || gy >= DF_ROWS) continue;
      for (let gx = cx - reach; gx <= cx + reach; gx++) {
        if (gx < 0 || gx >= DF_COLS) continue;
        const d = Math.hypot(gx * DF_CELL - px, gy * DF_CELL - py);
        const i = gy * DF_COLS + gx;
        if (d < field[i]) field[i] = d;
      }
    }
  }
  return field;
})();

/** Approximate distance from (x, y) to the path centreline, capped at 96px. */
export function distanceToPath(x: number, y: number): number {
  const gx = Math.round(x / DF_CELL);
  const gy = Math.round(y / DF_CELL);
  if (gx < 0 || gx >= DF_COLS || gy < 0 || gy >= DF_ROWS) return DF_MAX;
  return pathDistance[gy * DF_COLS + gx];
}

/** True when every terrain cell the tower footprint touches is open grass. */
export function terrainClear(x: number, y: number, radius = FOOTPRINT_RADIUS): boolean {
  const minX = Math.floor((x - radius) / TERRAIN_CELL);
  const maxX = Math.floor((x + radius) / TERRAIN_CELL);
  const minY = Math.floor((y - radius) / TERRAIN_CELL);
  const maxY = Math.floor((y + radius) / TERRAIN_CELL);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      // Only test cells the circle actually overlaps, not the whole bounding box.
      const nx = Math.max(cx * TERRAIN_CELL, Math.min(x, (cx + 1) * TERRAIN_CELL));
      const ny = Math.max(cy * TERRAIN_CELL, Math.min(y, (cy + 1) * TERRAIN_CELL));
      if ((nx - x) ** 2 + (ny - y) ** 2 > radius * radius) continue;
      if (!cellOpen(cx, cy)) return false;
    }
  }
  return true;
}

/** Minimum distance from the centreline before a tower stops crowding the path. */
export const PATH_CLEARANCE = PATH.halfWidth + TOWER_RADIUS * 0.55;

/** Terrain and path test only — the part that does not depend on tower type. */
export function groundClear(x: number, y: number): boolean {
  return distanceToPath(x, y) >= PATH_CLEARANCE && terrainClear(x, y);
}

export function canPlace(
  type: TowerId,
  x: number,
  y: number,
  existing: ReadonlyArray<{ x: number; y: number }>
): PlacementResult {
  if (distanceToPath(x, y) < PATH_CLEARANCE) {
    return { ok: false, reason: 'Too close to the claim path' };
  }
  if (!terrainClear(x, y)) return { ok: false, reason: 'No clear ground here' };

  for (const t of existing) {
    if ((t.x - x) ** 2 + (t.y - y) ** 2 < (TOWER_RADIUS * 1.85) ** 2) {
      return { ok: false, reason: 'Overlaps another tower' };
    }
  }

  const zone = zoneAt(x, y);
  if (zone && !zone.allow.includes(type)) {
    const names = zone.allow.length;
    return { ok: false, reason: `${zone.name} takes ${names === 1 ? 'a different tower' : 'only certain towers'}` };
  }

  return { ok: true, zone: zone?.id ?? null };
}

export { ZONES, zoneAt };

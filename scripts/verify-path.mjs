// Renders the generated waypoints over the map so the trace can be eyeballed.
// Usage: node scripts/verify-path.mjs [outfile]

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { PATH_POINTS, MAP_WIDTH, MAP_HEIGHT } from '../src/game/data/path.generated.ts';

const src = PNG.sync.read(fs.readFileSync(path.resolve('public/assets/map/field.png')));
const { width: W, height: H, data } = src;
const out = process.argv[2] ?? '/tmp/path-check.png';

const put = (x, y, r, g, b) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b;
};
const disc = (cx, cy, rad, r, g, b) => {
  for (let dy = -rad; dy <= rad; dy++)
    for (let dx = -rad; dx <= rad; dx++)
      if (dx * dx + dy * dy <= rad * rad) put(cx + dx, cy + dy, r, g, b);
};

// Centreline in magenta, waypoint nodes in yellow.
for (let i = 1; i < PATH_POINTS.length; i++) {
  const [ax, ay] = PATH_POINTS[i - 1];
  const [bx, by] = PATH_POINTS[i];
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    disc(ax + (bx - ax) * t, ay + (by - ay) * t, 3, 255, 0, 200);
  }
}
for (const [x, y] of PATH_POINTS) disc(x, y, 5, 255, 230, 0);

const [sx, sy] = PATH_POINTS[0];
const [ex, ey] = PATH_POINTS[PATH_POINTS.length - 1];
disc(sx, sy, 18, 0, 255, 80);   // spawn
disc(ex, ey, 18, 255, 40, 40);  // exit

// Downsample 2x for a readable screenshot.
const SW = W >> 1, SH = H >> 1;
const small = new PNG({ width: SW, height: SH });
for (let y = 0; y < SH; y++) {
  for (let x = 0; x < SW; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const i = ((y * 2 + dy) * W + (x * 2 + dx)) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
    const o = (y * SW + x) * 4;
    small.data[o] = r >> 2; small.data[o + 1] = g >> 2; small.data[o + 2] = b >> 2; small.data[o + 3] = 255;
  }
}
fs.writeFileSync(out, PNG.sync.write(small));
console.error(`wrote ${out}  (${SW}x${SH}, ${PATH_POINTS.length} waypoints, map ${MAP_WIDTH}x${MAP_HEIGHT})`);

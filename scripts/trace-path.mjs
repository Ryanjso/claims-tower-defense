// Extracts the stone-path centreline from the map PNG and emits waypoints.
//
// The path is the only large low-saturation, bright region in the image: grass is
// heavily saturated green, the hospital access road is dark asphalt, and the
// scattered rocks/flowers are too small to survive connected-component filtering.
//
// Centreline extraction is a Dijkstra shortest path from spawn to exit where the
// per-pixel cost is weighted by distance-to-edge, so the cheapest route runs down
// the middle of the corridor instead of cutting corners.
//
// Usage:
//   node scripts/trace-path.mjs --ascii   # coarse topology map
//   node scripts/trace-path.mjs --emit    # write src/game/data/path.generated.ts

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const SRC = path.resolve('public/assets/map/field.png');
const OUT = path.resolve('src/game/data/path.generated.ts');

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = png;
const idx = (x, y) => y * W + x;

// ---------------------------------------------------------------- classify

const raw = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  const bright = (r + g + b) / 3;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 42 && bright > 138 && bright < 248) raw[i] = 1;
}

const box = (src, radius, mode) => {
  const want = mode === 'dilate' ? 1 : 0;
  const out = new Uint8Array(W * H);
  const tmp = new Uint8Array(W * H);
  // separable: horizontal then vertical
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let d = -radius; d <= radius; d++) {
        const nx = x + d;
        const v = nx < 0 || nx >= W ? 0 : src[idx(nx, y)];
        if (v === want) { hit = 1; break; }
      }
      tmp[idx(x, y)] = mode === 'dilate' ? hit : hit ? 0 : 1;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let d = -radius; d <= radius; d++) {
        const ny = y + d;
        const v = ny < 0 || ny >= H ? 0 : tmp[idx(x, ny)];
        if (v === want) { hit = 1; break; }
      }
      out[idx(x, y)] = mode === 'dilate' ? hit : hit ? 0 : 1;
    }
  }
  return out;
};

const closed = box(box(raw, 3, 'dilate'), 3, 'erode');

// ------------------------------------------------- largest connected component

const label = new Int32Array(W * H).fill(-1);
const sizes = [];
const stack = new Int32Array(W * H);
for (let start = 0; start < W * H; start++) {
  if (!closed[start] || label[start] !== -1) continue;
  const id = sizes.length;
  let count = 0, sp = 0;
  stack[sp++] = start;
  label[start] = id;
  while (sp > 0) {
    const p = stack[--sp];
    count++;
    const px = p % W, py = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const np = idx(nx, ny);
        if (closed[np] && label[np] === -1) { label[np] = id; stack[sp++] = np; }
      }
    }
  }
  sizes.push(count);
}
let best = 0;
for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
const road = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) road[i] = label[i] === best ? 1 : 0;
console.error(`components=${sizes.length} largest=${sizes[best]}px`);

// ------------------------------------------------------------------- ascii

if (process.argv.includes('--ascii')) {
  const COLS = 110, cell = Math.ceil(W / COLS);
  for (let ry = 0; ry * cell < H; ry++) {
    let line = '';
    for (let rx = 0; rx < COLS; rx++) {
      let hit = 0, tot = 0;
      for (let y = ry * cell; y < Math.min(H, (ry + 1) * cell); y++)
        for (let x = rx * cell; x < Math.min(W, (rx + 1) * cell); x++) { tot++; if (road[idx(x, y)]) hit++; }
      line += tot && hit / tot > 0.4 ? '#' : tot && hit / tot > 0.12 ? '+' : '.';
    }
    console.log(String(ry).padStart(3) + ' ' + line);
  }
  console.log(`cell=${cell}px`);
}

// ------------------------------------------------- distance transform (chamfer)

const INF = 1e9;
const dist = new Float64Array(W * H);
for (let i = 0; i < W * H; i++) dist[i] = road[i] ? INF : 0;
const D1 = 1, D2 = Math.SQRT2;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = idx(x, y);
    if (dist[p] === 0) continue;
    let m = dist[p];
    if (x > 0) m = Math.min(m, dist[p - 1] + D1);
    if (y > 0) m = Math.min(m, dist[p - W] + D1);
    if (x > 0 && y > 0) m = Math.min(m, dist[p - W - 1] + D2);
    if (x < W - 1 && y > 0) m = Math.min(m, dist[p - W + 1] + D2);
    dist[p] = m;
  }
}
for (let y = H - 1; y >= 0; y--) {
  for (let x = W - 1; x >= 0; x--) {
    const p = idx(x, y);
    if (dist[p] === 0) continue;
    let m = dist[p];
    if (x < W - 1) m = Math.min(m, dist[p + 1] + D1);
    if (y < H - 1) m = Math.min(m, dist[p + W] + D1);
    if (x < W - 1 && y < H - 1) m = Math.min(m, dist[p + W + 1] + D2);
    if (x > 0 && y < H - 1) m = Math.min(m, dist[p + W - 1] + D2);
    dist[p] = m;
  }
}

let maxD = 0;
for (let i = 0; i < W * H; i++) if (road[i] && dist[i] > maxD) maxD = dist[i];
console.error(`max distance-to-edge = ${maxD.toFixed(1)}px (path half-width)`);

// ------------------------------------------------------------- endpoints

// Spawn: the road pixel with the smallest x among the upper-left run (the driveway
// leaving the hospital cluster). Exit: the road pixel with the largest y.
function pick(cmp) {
  let bestP = -1;
  for (let i = 0; i < W * H; i++) if (road[i] && (bestP < 0 || cmp(i, bestP))) bestP = i;
  return bestP;
}
const spawnP = pick((a, b) => {
  const ay = (a / W) | 0, by = (b / W) | 0;
  if (ay > 420 || by > 420) return ay <= 420 && by > 420; // restrict to the top-left arm
  return (a % W) < (b % W);
});
const exitP = pick((a, b) => ((a / W) | 0) > ((b / W) | 0));
const toXY = (p) => [p % W, (p / W) | 0];
console.error(`spawn=${toXY(spawnP)}  exit=${toXY(exitP)}`);

// --------------------------------------------- centre-biased Dijkstra

const R = Math.min(24, maxD);
const weight = new Float64Array(W * H);
for (let i = 0; i < W * H; i++) {
  if (!road[i]) { weight[i] = INF; continue; }
  const off = Math.max(0, R - dist[i]) / R;
  weight[i] = 1 + 60 * off * off;
}

class Heap {
  constructor() { this.k = [0]; this.v = [0]; this.n = 0; }
  push(key, val) {
    let i = ++this.n; this.k[i] = key; this.v[i] = val;
    while (i > 1) { const p = i >> 1; if (this.k[p] <= this.k[i]) break; this.swap(p, i); i = p; }
  }
  pop() {
    const top = this.v[1];
    this.k[1] = this.k[this.n]; this.v[1] = this.v[this.n]; this.n--;
    let i = 1;
    for (;;) {
      const l = i << 1, r = l | 1; let s = i;
      if (l <= this.n && this.k[l] < this.k[s]) s = l;
      if (r <= this.n && this.k[r] < this.k[s]) s = r;
      if (s === i) break;
      this.swap(s, i); i = s;
    }
    return top;
  }
  swap(a, b) {
    const tk = this.k[a]; this.k[a] = this.k[b]; this.k[b] = tk;
    const tv = this.v[a]; this.v[a] = this.v[b]; this.v[b] = tv;
  }
}

const cost = new Float64Array(W * H).fill(INF);
const prev = new Int32Array(W * H).fill(-1);
const done = new Uint8Array(W * H);
const heap = new Heap();
cost[spawnP] = 0;
heap.push(0, spawnP);
while (heap.n > 0) {
  const p = heap.pop();
  if (done[p]) continue;
  done[p] = 1;
  if (p === exitP) break;
  const px = p % W, py = (p / W) | 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const np = idx(nx, ny);
      if (!road[np] || done[np]) continue;
      const step = dx && dy ? D2 : D1;
      const c = cost[p] + step * 0.5 * (weight[p] + weight[np]);
      if (c < cost[np]) { cost[np] = c; prev[np] = p; heap.push(c, np); }
    }
  }
}
if (cost[exitP] >= INF) throw new Error('no route from spawn to exit');

const dense = [];
for (let p = exitP; p !== -1; p = prev[p]) dense.push(toXY(p));
dense.reverse();
console.error(`dense centreline = ${dense.length} px`);

// ------------------------------------------------ smooth, resample, simplify

// Chaikin-style smoothing pass removes the 8-connected staircase.
let pts = dense.map(([x, y]) => ({ x, y }));
for (let pass = 0; pass < 4; pass++) {
  const sm = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    sm.push({ x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 });
  }
  sm.push(pts[pts.length - 1]);
  pts = sm;
}

// Resample at uniform arc length.
const STEP = 6;
const resampled = [pts[0]];
let acc = 0;
for (let i = 1; i < pts.length; i++) {
  const a = resampled[resampled.length - 1], b = pts[i];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  acc += d;
  if (acc >= STEP) { resampled.push(b); acc = 0; }
}
if (resampled[resampled.length - 1] !== pts[pts.length - 1]) resampled.push(pts[pts.length - 1]);

// Douglas-Peucker down to a compact waypoint list.
function rdp(list, eps) {
  if (list.length < 3) return list;
  const a = list[0], b = list[list.length - 1];
  let far = 0, fi = 0;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < list.length - 1; i++) {
    const d = Math.abs(dy * list[i].x - dx * list[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > far) { far = d; fi = i; }
  }
  if (far <= eps) return [a, b];
  return [...rdp(list.slice(0, fi + 1), eps).slice(0, -1), ...rdp(list.slice(fi), eps)];
}
const simplified = rdp(resampled, 1.6);

const totalLen = simplified.reduce((s, p, i) => (i ? s + Math.hypot(p.x - simplified[i - 1].x, p.y - simplified[i - 1].y) : 0), 0);
console.error(`resampled=${resampled.length}  waypoints=${simplified.length}  length=${Math.round(totalLen)}px`);

// Measure corridor half-width along the route so placement can use a real radius.
const widths = resampled.map((p) => dist[idx(Math.round(p.x), Math.round(p.y))]);
widths.sort((a, b) => a - b);
const medianHalfWidth = widths[widths.length >> 1];
console.error(`median half-width = ${medianHalfWidth.toFixed(1)}px`);

if (process.argv.includes('--emit')) {
  const body = simplified.map((p) => `  [${Math.round(p.x)}, ${Math.round(p.y)}],`).join('\n');
  fs.writeFileSync(
    OUT,
    `// GENERATED by scripts/trace-path.mjs — do not edit by hand.\n` +
      `// Centreline of the stone path in public/assets/map/field.png, in image pixels.\n\n` +
      `export const MAP_WIDTH = ${W};\n` +
      `export const MAP_HEIGHT = ${H};\n` +
      `/** Median distance from the centreline to the edge of the stone path, in px. */\n` +
      `export const PATH_HALF_WIDTH = ${medianHalfWidth.toFixed(1)};\n` +
      `/** Total centreline length in px. */\n` +
      `export const PATH_LENGTH = ${Math.round(totalLen)};\n\n` +
      `export const PATH_POINTS: ReadonlyArray<readonly [number, number]> = [\n${body}\n];\n`,
    'utf8'
  );
  console.error(`wrote ${path.relative(process.cwd(), OUT)}`);
}

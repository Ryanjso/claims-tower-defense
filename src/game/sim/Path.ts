import { PATH_POINTS, PATH_HALF_WIDTH } from '../data/path.generated';

/**
 * Arc-length parameterisation of the traced centreline. Claims store a single
 * scalar distance along the path; everything positional derives from that, which
 * keeps movement exact and makes the whole sim trivially serialisable.
 */
export class PathLookup {
  readonly length: number;
  readonly halfWidth = PATH_HALF_WIDTH;
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly step: number;

  constructor(step = 4) {
    this.step = step;
    const src = PATH_POINTS;

    // Cumulative length of the polyline so we can walk it at uniform spacing.
    const cum: number[] = [0];
    for (let i = 1; i < src.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
    }
    this.length = cum[cum.length - 1];

    const n = Math.ceil(this.length / step) + 1;
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);

    let seg = 1;
    for (let i = 0; i < n; i++) {
      const d = Math.min(i * step, this.length);
      while (seg < cum.length - 1 && cum[seg] < d) seg++;
      const a = src[seg - 1];
      const b = src[seg];
      const segLen = cum[seg] - cum[seg - 1] || 1;
      const t = (d - cum[seg - 1]) / segLen;
      this.xs[i] = a[0] + (b[0] - a[0]) * t;
      this.ys[i] = a[1] + (b[1] - a[1]) * t;
    }
  }

  get sampleCount() {
    return this.xs.length;
  }

  posX(dist: number): number {
    const i = dist / this.step;
    const i0 = Math.max(0, Math.min(this.xs.length - 1, Math.floor(i)));
    const i1 = Math.min(this.xs.length - 1, i0 + 1);
    const f = i - i0;
    return this.xs[i0] + (this.xs[i1] - this.xs[i0]) * f;
  }

  posY(dist: number): number {
    const i = dist / this.step;
    const i0 = Math.max(0, Math.min(this.ys.length - 1, Math.floor(i)));
    const i1 = Math.min(this.ys.length - 1, i0 + 1);
    const f = i - i0;
    return this.ys[i0] + (this.ys[i1] - this.ys[i0]) * f;
  }

  /** Heading in radians at a given arc length. */
  angle(dist: number): number {
    const a = Math.max(0, dist - 6);
    const b = Math.min(this.length, dist + 6);
    return Math.atan2(this.posY(b) - this.posY(a), this.posX(b) - this.posX(a));
  }

  /** Closest point on the centreline to (x, y): its distance and its arc length. */
  nearest(x: number, y: number): { dist: number; arc: number } {
    let bestD2 = Infinity;
    let bestI = 0;
    for (let i = 0; i < this.xs.length; i++) {
      const dx = this.xs[i] - x;
      const dy = this.ys[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestI = i;
      }
    }
    return { dist: Math.sqrt(bestD2), arc: bestI * this.step };
  }
}

export const PATH = new PathLookup();

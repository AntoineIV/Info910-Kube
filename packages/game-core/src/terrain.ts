import type { GameConfig } from "./config";
import { Rng } from "./rng";

export interface Pickup {
  kind: "coin" | "fuel";
  x: number;
  y: number;
  value: number;
}

export interface TerrainSample {
  h: number;
  slope: number;
}

export class Terrain {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  readonly ms: number[] = [];
  readonly pickups: Pickup[] = [];
  private readonly rng: Rng;
  private readonly itemRng: Rng;
  private nextFuel: number;
  private hintIndex = 0;

  constructor(seed: number, private readonly config: GameConfig) {
    this.rng = new Rng(seed);
    this.itemRng = new Rng(seed ^ 0x5bd1e995);
    const flat = config.terrain.flatStart;
    for (let x = -60; x <= flat; x += 15) {
      this.xs.push(x);
      this.ys.push(0);
    }
    this.nextFuel = config.fuel.canSpacing;
  }

  private difficulty(x: number): number {
    let k = x / this.config.terrain.rampDistance;
    k = k > 1 ? 1 : k < 0 ? 0 : k;
    const r = 1 - k;
    return 1 - r * r;
  }

  private generateNext(): void {
    const t = this.config.terrain;
    const n = this.xs.length;
    const x0 = this.xs[n - 1];
    const y0 = this.ys[n - 1];
    const k = this.difficulty(x0);
    const length = (t.segmentMax + (t.segmentMin - t.segmentMax) * k) * (0.75 + 0.5 * this.rng.next());
    const amplitude = t.amplitudeMin + (t.amplitudeMax - t.amplitudeMin) * k;
    const slopeCap = ((t.slopeMin + (t.slopeMax - t.slopeMin) * k) * length) / 1.6;
    let dy = (this.rng.next() * 2 - 1) * amplitude - y0 * 0.08;
    if (dy > slopeCap) dy = slopeCap;
    if (dy < -slopeCap) dy = -slopeCap;
    const x1 = x0 + length;
    const y1 = y0 + dy;
    this.xs.push(x1);
    this.ys.push(y1);
    this.placeItems(x0, x1);
  }

  private placeItems(x0: number, x1: number): void {
    if (x0 < this.config.terrain.flatStart) return;
    const c = this.config.coins;
    if (this.itemRng.next() < c.rowChance) {
      const value = 1 + Math.floor(x0 / c.valueStep);
      const start = x0 + (x1 - x0) * 0.3;
      for (let i = 0; i < c.rowLength; i++) {
        this.pickups.push({ kind: "coin", x: start + i * 1.6, y: 0, value });
      }
    }
    while (this.nextFuel < x1) {
      this.pickups.push({ kind: "fuel", x: this.nextFuel, y: 0, value: 1 });
      const f = this.config.fuel;
      this.nextFuel += f.canSpacing * (1 + f.canSpacingGrowth * (this.nextFuel / 100));
    }
  }

  ensure(x: number): void {
    while (this.xs[this.xs.length - 2] === undefined || this.xs[this.xs.length - 2] < x + 2) {
      this.generateNext();
    }
    this.resolvePickupHeights();
  }

  resolvedPickups = 0;
  private resolvePickupHeights(): void {
    while (this.resolvedPickups < this.pickups.length) {
      const p = this.pickups[this.resolvedPickups];
      if (p.x > this.xs[this.xs.length - 2]) break;
      p.y = this.sample(p.x).h + (p.kind === "coin" ? 1.1 : 0.9);
      this.resolvedPickups++;
    }
  }

  private tangent(i: number): number {
    const n = this.xs.length;
    if (i <= 0 || i >= n - 1) return 0;
    return (this.ys[i + 1] - this.ys[i - 1]) / (this.xs[i + 1] - this.xs[i - 1]);
  }

  private segmentIndex(x: number): number {
    let i = this.hintIndex;
    if (i >= this.xs.length - 1) i = this.xs.length - 2;
    while (i > 0 && this.xs[i] > x) i--;
    while (i < this.xs.length - 2 && this.xs[i + 1] <= x) i++;
    this.hintIndex = i;
    return i;
  }

  sample(x: number): TerrainSample {
    if (x < this.xs[0]) return { h: 0, slope: 0 };
    this.ensureRaw(x);
    const i = this.segmentIndex(x);
    const xa = this.xs[i];
    const length = this.xs[i + 1] - xa;
    const t = (x - xa) / length;
    const ya = this.ys[i];
    const yb = this.ys[i + 1];
    const ma = this.tangent(i) * length;
    const mb = this.tangent(i + 1) * length;
    const t2 = t * t;
    const t3 = t2 * t;
    const h = (2 * t3 - 3 * t2 + 1) * ya + (t3 - 2 * t2 + t) * ma + (-2 * t3 + 3 * t2) * yb + (t3 - t2) * mb;
    const d = (6 * t2 - 6 * t) * ya + (3 * t2 - 4 * t + 1) * ma + (-6 * t2 + 6 * t) * yb + (3 * t2 - 2 * t) * mb;
    return { h, slope: d / length };
  }

  private ensureRaw(x: number): void {
    while (this.xs[this.xs.length - 2] === undefined || this.xs[this.xs.length - 2] < x + 2) {
      this.generateNext();
    }
  }
}

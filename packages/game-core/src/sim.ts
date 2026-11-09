import { biomeAt, upgradeFactor, type GameConfig, type UpgradeLevels } from "./config";
import { Terrain } from "./terrain";

export const TICK_RATE = 120;
export const INPUT_GAS = 1;
export const INPUT_BRAKE = 2;
export const MAX_TICKS = TICK_RATE * 60 * 30;

const SUBSTEPS = 4;
const DT = 1 / TICK_RATE / SUBSTEPS;

const CHASSIS_MASS = 120;
const CHASSIS_INERTIA = 85;
const WHEEL_MASS = 16;
export const WHEEL_RADIUS = 0.48;
const WHEEL_INERTIA = 0.6 * WHEEL_MASS * WHEEL_RADIUS * WHEEL_RADIUS;
const WHEEL_EFF_MASS = 1 / (1 / WHEEL_MASS + (WHEEL_RADIUS * WHEEL_RADIUS) / WHEEL_INERTIA);
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [-0.95, -0.58],
  [1.0, -0.58],
];
export const HULL: ReadonlyArray<readonly [number, number]> = [
  [-1.3, -0.2],
  [1.4, -0.2],
  [1.45, 0.15],
  [0.75, 0.3],
  [-0.55, 0.3],
  [-1.3, 0.35],
];
export const HEAD: readonly [number, number] = [-0.1, 0.95];
export const HEAD_RADIUS = 0.27;
const K_GROUND = 90000;
const C_GROUND = 1400;
const K_HULL = 60000;
const C_HULL = 3000;
const K_LATERAL = 60000;
const C_LATERAL = 1800;
const BUMP_LIMIT = 0.22;
const MAX_SPIN = 9;
const REACTION_SHARE = 0.55;
const PICKUP_RADIUS_SQ = 1.5 * 1.5;

export interface Wheel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  angle: number;
  fn: number;
  tx: number;
  ty: number;
}

export interface Chassis {
  x: number;
  y: number;
  vx: number;
  vy: number;
  c: number;
  s: number;
  w: number;
}

export type EndReason = "crash" | "fuel" | "timeout";

export class Sim {
  readonly terrain: Terrain;
  readonly chassis: Chassis;
  readonly wheels: Wheel[];
  readonly collected: Set<number> = new Set();
  tick = 0;
  maxX = 0;
  coins = 0;
  fuel: number;
  readonly fuelCapacity: number;
  finished = false;
  reason: EndReason | null = null;
  private stillTicks = 0;
  private emptyTicks = 0;
  private pickupLo = 0;
  private readonly torque: number;
  private readonly grip: number;
  private readonly kSusp: number;
  private readonly cSusp: number;

  constructor(
    readonly seed: number,
    readonly config: GameConfig,
    readonly upgrades: UpgradeLevels,
  ) {
    this.terrain = new Terrain(seed, config);
    this.terrain.ensure(80);
    const p = config.physics;
    this.torque = p.engineTorque * upgradeFactor(config, upgrades, "engine");
    this.grip = p.grip * upgradeFactor(config, upgrades, "tires");
    const susp = upgradeFactor(config, upgrades, "suspension");
    this.kSusp = p.suspensionStiffness * susp;
    this.cSusp = p.suspensionDamping * susp;
    this.fuelCapacity = config.fuel.capacity * upgradeFactor(config, upgrades, "tank");
    this.fuel = this.fuelCapacity;
    this.chassis = { x: 0, y: 1.12, vx: 0, vy: 0, c: 1, s: 0, w: 0 };
    this.wheels = ANCHORS.map(([ax, ay]) => ({
      x: ax,
      y: 1.12 + ay,
      vx: 0,
      vy: 0,
      w: 0,
      angle: 0,
      fn: 0,
      tx: 1,
      ty: 0,
    }));
  }

  get distance(): number {
    return Math.floor(this.maxX);
  }

  step(input: number): void {
    if (this.finished) return;
    const gas = (input & INPUT_GAS) !== 0 && this.fuel > 0;
    const brake = (input & INPUT_BRAKE) !== 0;
    const ch = this.chassis;
    this.terrain.ensure(ch.x + 60);
    const biomeGrip = biomeAt(this.config, ch.x).grip;
    const air = (input & INPUT_GAS ? 1 : 0) - (input & INPUT_BRAKE ? 1 : 0);
    for (let i = 0; i < SUBSTEPS; i++) this.substep(gas, brake, air, biomeGrip);
    if (this.finished) return;
    this.tick++;
    if (ch.x > this.maxX) this.maxX = ch.x;
    const burn = this.config.fuel.burnPerSecond + (gas ? this.config.fuel.burnGasPerSecond : 0);
    this.fuel -= burn / TICK_RATE;
    if (this.fuel < 0) this.fuel = 0;
    this.collect();
    if (this.fuel <= 0) {
      const speedSq = ch.vx * ch.vx + ch.vy * ch.vy;
      this.emptyTicks++;
      if (speedSq < 0.09) this.stillTicks++;
      if (this.stillTicks > TICK_RATE * 2 || this.emptyTicks > TICK_RATE * 8) this.end("fuel");
    } else {
      this.emptyTicks = 0;
      this.stillTicks = 0;
    }
    if (this.tick >= MAX_TICKS) this.end("timeout");
  }

  private end(reason: EndReason): void {
    this.finished = true;
    this.reason = reason;
  }

  private collect(): void {
    const t = this.terrain;
    const ch = this.chassis;
    while (this.pickupLo < t.resolvedPickups && t.pickups[this.pickupLo].x < this.maxX - 50) this.pickupLo++;
    for (let i = this.pickupLo; i < t.resolvedPickups; i++) {
      const p = t.pickups[i];
      if (p.x > ch.x + 4) continue;
      if (this.collected.has(i)) continue;
      if (this.near(p.x, p.y, ch.x, ch.y) || this.near(p.x, p.y, this.wheels[0].x, this.wheels[0].y) || this.near(p.x, p.y, this.wheels[1].x, this.wheels[1].y)) {
        this.collected.add(i);
        if (p.kind === "coin") this.coins += p.value;
        else this.fuel = this.fuelCapacity;
      }
    }
  }

  private near(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy < PICKUP_RADIUS_SQ;
  }

  private substep(gas: boolean, brake: boolean, air: number, biomeGrip: number): void {
    const ch = this.chassis;
    const p = this.config.physics;
    const g = p.gravity;
    let cfx = 0;
    let cfy = -g * CHASSIS_MASS;
    let ctq = 0;
    const exx = ch.c;
    const exy = ch.s;
    const eyx = -ch.s;
    const eyy = ch.c;
    let grounded = false;

    for (let i = 0; i < 2; i++) {
      const wh = this.wheels[i];
      const [lx, ly] = ANCHORS[i];
      const rx = lx * exx + ly * eyx;
      const ry = lx * exy + ly * eyy;
      const ax = ch.x + rx;
      const ay = ch.y + ry;
      const dx = wh.x - ax;
      const dy = wh.y - ay;
      const avx = ch.vx - ch.w * ry;
      const avy = ch.vy + ch.w * rx;
      const rvx = wh.vx - avx;
      const rvy = wh.vy - avy;
      const f = dx * exx + dy * exy;
      const u = dx * eyx + dy * eyy;
      const vf = rvx * exx + rvy * exy;
      const vu = rvx * eyx + rvy * eyy;
      let fu = -this.kSusp * u - this.cSusp * vu;
      if (u > BUMP_LIMIT) fu -= K_LATERAL * (u - BUMP_LIMIT);
      if (u < -BUMP_LIMIT) fu -= K_LATERAL * (u + BUMP_LIMIT);
      const ff = -K_LATERAL * f - C_LATERAL * vf;
      const fx = ff * exx + fu * eyx;
      const fy = ff * exy + fu * eyy;
      let wfx = fx;
      let wfy = fy - g * WHEEL_MASS;
      cfx -= fx;
      cfy -= fy;
      ctq += rx * -fy - ry * -fx;

      const s = this.terrain.sample(wh.x);
      const inv = 1 / Math.sqrt(1 + s.slope * s.slope);
      const nx = -s.slope * inv;
      const ny = inv;
      const pen = WHEEL_RADIUS - (wh.y - s.h) * ny;
      wh.fn = 0;
      wh.tx = ny;
      wh.ty = -nx;
      if (pen > 0) {
        const vn = wh.vx * nx + wh.vy * ny;
        let fn = K_GROUND * pen - C_GROUND * vn;
        if (fn < 0) fn = 0;
        wfx += fn * nx;
        wfy += fn * ny;
        wh.fn = fn;
        grounded = true;
      }
      wh.vx += (wfx / WHEEL_MASS) * DT;
      wh.vy += (wfy / WHEEL_MASS) * DT;

      let tau = 0;
      if (gas) {
        let k = 1 - wh.w / p.maxWheelSpeed;
        if (k < 0) k = 0;
        if (k > 1) k = 1;
        tau = this.torque * k;
      } else if (brake) {
        if (wh.w > 0.5) {
          tau = -p.brakeTorque;
        } else {
          let k = 1 + wh.w / (p.maxWheelSpeed * 0.35);
          if (k < 0) k = 0;
          tau = -p.reverseTorque * k;
        }
      }
      wh.w += (tau / WHEEL_INERTIA) * DT;
      wh.w -= wh.w * 0.25 * DT;
      ctq += tau * REACTION_SHARE;

      if (wh.fn > 0) {
        const vt = wh.vx * wh.tx + wh.vy * wh.ty;
        const slip = vt - wh.w * WHEEL_RADIUS;
        const jMax = this.grip * biomeGrip * wh.fn * DT;
        let j = -slip * WHEEL_EFF_MASS;
        if (j > jMax) j = jMax;
        if (j < -jMax) j = -jMax;
        wh.vx += (j * wh.tx) / WHEEL_MASS;
        wh.vy += (j * wh.ty) / WHEEL_MASS;
        wh.w -= (j * WHEEL_RADIUS) / WHEEL_INERTIA;
      }
    }

    for (let i = 0; i < HULL.length; i++) {
      const [lx, ly] = HULL[i];
      const rx = lx * exx + ly * eyx;
      const ry = lx * exy + ly * eyy;
      const px = ch.x + rx;
      const py = ch.y + ry;
      const s = this.terrain.sample(px);
      const inv = 1 / Math.sqrt(1 + s.slope * s.slope);
      const nx = -s.slope * inv;
      const ny = inv;
      const pen = 0.05 - (py - s.h) * ny;
      if (pen <= 0) continue;
      const pvx = ch.vx - ch.w * ry;
      const pvy = ch.vy + ch.w * rx;
      const vn = pvx * nx + pvy * ny;
      let fn = K_HULL * pen - C_HULL * vn;
      if (fn < 0) fn = 0;
      const tx = ny;
      const ty = -nx;
      const vt = pvx * tx + pvy * ty;
      let ft = -vt * C_HULL;
      const ftMax = 0.6 * fn;
      if (ft > ftMax) ft = ftMax;
      if (ft < -ftMax) ft = -ftMax;
      const fx = fn * nx + ft * tx;
      const fy = fn * ny + ft * ty;
      cfx += fx;
      cfy += fy;
      ctq += rx * fy - ry * fx;
    }

    ch.vx += (cfx / CHASSIS_MASS) * DT;
    ch.vy += (cfy / CHASSIS_MASS) * DT;
    ch.w += (ctq / CHASSIS_INERTIA) * DT;
    ch.w -= ch.w * 0.4 * DT;
    if (!grounded) {
      const target = air * p.airSpinSpeed;
      const rate = air === 0 ? p.airDamping : p.airResponse;
      ch.w += (target - ch.w) * rate * DT;
    }
    if (ch.w > MAX_SPIN) ch.w = MAX_SPIN;
    if (ch.w < -MAX_SPIN) ch.w = -MAX_SPIN;

    ch.x += ch.vx * DT;
    ch.y += ch.vy * DT;
    const dth = ch.w * DT;
    const nc = ch.c - ch.s * dth;
    const ns = ch.s + ch.c * dth;
    const norm = 1 / Math.sqrt(nc * nc + ns * ns);
    ch.c = nc * norm;
    ch.s = ns * norm;
    for (const wh of this.wheels) {
      wh.x += wh.vx * DT;
      wh.y += wh.vy * DT;
      wh.angle -= wh.w * DT;
    }

    const hx = ch.x + HEAD[0] * ch.c - HEAD[1] * ch.s;
    const hy = ch.y + HEAD[0] * ch.s + HEAD[1] * ch.c;
    const hs = this.terrain.sample(hx);
    const hinv = 1 / Math.sqrt(1 + hs.slope * hs.slope);
    if ((hy - hs.h) * hinv < HEAD_RADIUS) this.end("crash");
  }
}

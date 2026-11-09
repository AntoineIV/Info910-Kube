import { HEAD, HEAD_RADIUS, HULL, WHEEL_RADIUS, type Biome, type Sim } from "@talus/game-core";
import { biomeOf, drawClouds, drawFar, drawHills, drawProp, drawSky, drawWeather, hash, luminance, palette, Particles, shade } from "./scenery";

export interface Snapshot {
  x: number;
  y: number;
  c: number;
  s: number;
  vx: number;
  wheels: { x: number; y: number; angle: number }[];
}

export function snapshot(sim: Sim): Snapshot {
  const ch = sim.chassis;
  return { x: ch.x, y: ch.y, c: ch.c, s: ch.s, vx: ch.vx, wheels: sim.wheels.map((w) => ({ x: w.x, y: w.y, angle: w.angle })) };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interpolate(a: Snapshot, b: Snapshot, t: number): Snapshot {
  const c = lerp(a.c, b.c, t);
  const s = lerp(a.s, b.s, t);
  const n = Math.hypot(c, s) || 1;
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    c: c / n,
    s: s / n,
    vx: lerp(a.vx, b.vx, t),
    wheels: a.wheels.map((w, i) => ({ x: lerp(w.x, b.wheels[i].x, t), y: lerp(w.y, b.wheels[i].y, t), angle: lerp(w.angle, b.wheels[i].angle, t) })),
  };
}

const PROP_SPACING = 5;
const CRASH_WORDS = ["BONK!", "OUCH!", "OOF!", "CRUNCH!", "YIKES!"];

interface Crash {
  t0: number;
  x: number;
  y: number;
  word: string;
  helmet: { x: number; y: number; vx: number; vy: number; a: number; va: number };
}

function headOf(ch: Snapshot): [number, number] {
  return [ch.x + HEAD[0] * ch.c - HEAD[1] * ch.s, ch.y + HEAD[0] * ch.s + HEAD[1] * ch.c];
}
const DUST: Record<Biome["detail"], string> = { grass: "#8a6a45", sand: "#f3d9a4", snow: "#ffffff", ash: "#6b5a55", moss: "#b89be0" };

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private camX = 0;
  private camY = 0;
  private camVx = 0;
  private readonly particles = new Particles();
  private lastSim: Sim | null = null;
  private crash: Crash | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  onCrash(sim: Sim, time: number) {
    const ch = snapshot(sim);
    const [hx, hy] = headOf(ch);
    const biome = biomeOf(sim.config.biomes, ch.x);
    this.crash = {
      t0: time,
      x: hx,
      y: hy,
      word: CRASH_WORDS[Math.floor(Math.random() * CRASH_WORDS.length)],
      helmet: { x: hx, y: hy + 0.1, vx: sim.chassis.vx * 0.5 + 2 + Math.random() * 2, vy: 6 + Math.random() * 2, a: 0, va: 8 + Math.random() * 6 },
    };
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI;
      const v = 2 + Math.random() * 5;
      this.particles.emit({ x: hx, y: hy - 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.8, size: 0.1 + Math.random() * 0.18, color: DUST[biome.detail] });
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 6;
      this.particles.emit({ x: hx, y: hy, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, life: 0, max: 0.35 + Math.random() * 0.35, size: 0.06 + Math.random() * 0.06, color: "#fff3a0" });
    }
  }

  timeScale(time: number): number {
    if (!this.crash) return 1;
    const age = time - this.crash.t0;
    return age < 0.9 ? 0.3 : age < 1.5 ? 0.3 + (age - 0.9) / 0.6 * 0.7 : 1;
  }

  draw(sim: Sim, prev: Snapshot, alpha: number, time: number, dt: number) {
    this.resize();
    if (this.lastSim !== sim) {
      this.particles.clear();
      this.crash = null;
      this.lastSim = sim;
    }
    const crashAge = this.crash ? time - this.crash.t0 : -1;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const zoom = crashAge >= 0 ? 1 + 0.22 * Math.min(1, crashAge / 0.7) * (2 - Math.min(1, crashAge / 0.7)) : 1;
    const scale = (H / 15) * zoom;
    const ch = interpolate(prev, snapshot(sim), alpha);
    const shake = crashAge >= 0 && crashAge < 0.6 ? (0.6 - crashAge) * H * 0.04 : 0;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const reset = sim.tick < 2 || dt === 0;
    this.camVx = reset ? ch.vx : this.camVx + (ch.vx - this.camVx) * (1 - Math.exp(-dt * 1.5));
    const targetX = ch.x + 5 + Math.max(-3, Math.min(6, this.camVx * 0.25));
    const targetY = ch.y + 1.2;
    if (reset) {
      this.camX = targetX;
      this.camY = targetY;
    }
    this.camX = targetX + (this.camX - targetX) * Math.exp(-dt * 8);
    this.camY = targetY + (this.camY - targetY) * Math.exp(-dt * 3);
    const left = this.camX - W / 2 / scale;
    const right = this.camX + W / 2 / scale;
    const sx = (x: number) => (x - this.camX) * scale + W / 2;
    const sy = (y: number) => H * 0.55 - (y - this.camY) * scale;
    const biomes = sim.config.biomes;
    const { pal, cur, next, blend } = palette(biomes, ch.x);

    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.8);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    drawSky(ctx, W, H, pal, cur, this.camX, time, 1 - blend);
    if (next && blend > 0) drawSky(ctx, W, H, pal, next, this.camX, time, blend);
    const backdrop = blend > 0.5 && next ? next : cur;
    drawClouds(ctx, W, H, pal.cloud, this.camX, time, backdrop.landmark === "volcano");
    drawFar(ctx, W, H, pal, backdrop, this.camX, time);
    const silhouette = backdrop.props.includes("pine") ? "pine" : backdrop.props.includes("cactus") ? "cactus" : backdrop.props.includes("tree") ? "tree" : null;
    drawHills(ctx, W, H, pal.hills, this.camX, silhouette);

    const terrain = sim.terrain;
    const startSlot = Math.floor((left - 4) / PROP_SPACING);
    const endSlot = Math.ceil((right + 4) / PROP_SPACING);
    for (let k = startSlot; k <= endSlot; k++) {
      if (k * PROP_SPACING < 8) continue;
      const x = k * PROP_SPACING + hash(k * 0.73) * PROP_SPACING;
      const b = biomeOf(biomes, x);
      if (b.props.length === 0 || hash(k * 1.91 + 7) > b.propDensity) continue;
      const kind = b.props[Math.floor(hash(k * 3.17) * b.props.length)];
      const h = terrain.sample(x).h;
      ctx.globalAlpha = 0.95;
      drawProp(ctx, kind, sx(x), sy(h - 0.15), scale, hash(k * 5.3), time);
    }
    ctx.globalAlpha = 1;

    const step = Math.max(0.25, 4 / scale);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = left - 1; x <= right + 1; x += step) {
      xs.push(sx(x));
      ys.push(sy(terrain.sample(x).h));
    }
    let minY = H;
    for (const y of ys) minY = Math.min(minY, y);
    const ground = ctx.createLinearGradient(0, minY, 0, H);
    ground.addColorStop(0, pal.ground);
    ground.addColorStop(1, shade(pal.ground, -0.45));
    ctx.beginPath();
    ctx.moveTo(xs[0], H + 10);
    for (let i = 0; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.lineTo(xs[xs.length - 1], H + 10);
    ctx.closePath();
    ctx.fillStyle = ground;
    ctx.fill();

    ctx.fillStyle = shade(pal.ground, -0.2);
    for (let k = Math.floor(left / 2.2); k <= Math.ceil(right / 2.2); k++) {
      const x = k * 2.2 + hash(k * 9.1) * 2;
      const depth = 0.9 + hash(k * 4.4) * 4;
      const h = terrain.sample(x).h - depth;
      const r = 0.12 + hash(k * 2.2) * 0.22;
      ctx.beginPath();
      ctx.ellipse(sx(x), sy(h), r * scale * 1.4, r * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i === 0) ctx.moveTo(xs[i], ys[i] + scale * 0.12);
      else ctx.lineTo(xs[i], ys[i] + scale * 0.12);
    }
    ctx.lineWidth = scale * 0.3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = shade(pal.surface, -0.25);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i === 0) ctx.moveTo(xs[i], ys[i]);
      else ctx.lineTo(xs[i], ys[i]);
    }
    ctx.lineWidth = scale * 0.26;
    ctx.strokeStyle = pal.surface;
    ctx.stroke();

    this.drawSurfaceDetail(sim, left, right, sx, sy, scale, time);
    this.drawMarkers(sim, left, right, sx, sy, scale);
    this.drawPickups(sim, left, right, sx, sy, scale, time);

    this.emitDust(sim, cur, dt);
    this.particles.update(dt, 4);
    this.particles.draw(ctx, sx, sy, scale);

    const dark = luminance(pal.skyTop) < 0.25;
    if (dark) this.drawHeadlight(ch, sx, sy, scale);
    this.drawVehicle(ch, sx, sy, scale, this.crash !== null);
    if (this.crash) this.drawCrash(sim, ch, sx, sy, scale, time, dt);

    drawWeather(ctx, W, H, cur.weather, this.camX, this.camY, time, 1 - blend);
    if (next && blend > 0) drawWeather(ctx, W, H, next.weather, this.camX, this.camY, time, blend);

    ctx.restore();
    if (crashAge >= 0 && crashAge < 0.25) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - crashAge / 0.25)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (crashAge >= 0) {
      const k = Math.min(1, crashAge / 0.5) * 0.35;
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, `rgba(60,0,0,${k})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    if (dark) {
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(5,0,20,0.45)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawCrash(sim: Sim, ch: Snapshot, sx: (x: number) => number, sy: (y: number) => number, m: number, time: number, dt: number) {
    const { ctx } = this;
    const crash = this.crash!;
    const age = time - crash.t0;
    const slow = this.timeScale(time);

    const hm = crash.helmet;
    const step = dt * slow;
    hm.vy -= 9.81 * step;
    hm.x += hm.vx * step;
    hm.y += hm.vy * step;
    hm.a += hm.va * step;
    const ground = sim.terrain.sample(hm.x).h + 0.22;
    if (hm.y < ground) {
      hm.y = ground;
      hm.vy = Math.abs(hm.vy) > 1 ? -hm.vy * 0.45 : 0;
      hm.vx *= 0.7;
      hm.va *= 0.6;
    }
    ctx.save();
    ctx.translate(sx(hm.x), sy(hm.y));
    ctx.rotate(-hm.a);
    ctx.fillStyle = "#1d3557";
    ctx.beginPath();
    ctx.arc(0, 0, HEAD_RADIUS * m * 1.08, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.85)";
    ctx.fillRect(0, -0.03 * m, HEAD_RADIUS * m * 1.08, 0.1 * m);
    ctx.restore();

    if (age < 1.4) {
      const pop = Math.min(1, age / 0.15);
      const fade = age > 1 ? 1 - (age - 1) / 0.4 : 1;
      const size = m * (0.9 + 0.5 * pop - 0.25 * Math.max(0, pop - 0.8));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(sx(crash.x), sy(crash.y + 1.6 + age * 0.6));
      ctx.rotate(-0.12);
      ctx.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = m * 0.18;
      ctx.strokeStyle = "#1d2a3a";
      ctx.strokeText(crash.word, 0, 0);
      ctx.fillStyle = "#ffd166";
      ctx.fillText(crash.word, 0, 0);
      ctx.restore();
    }

    if (age > 0.5) {
      const [hx, hy] = headOf(ch);
      const show = Math.min(1, (age - 0.5) / 0.3);
      for (let i = 0; i < 3; i++) {
        const a = time * 4 + (i * Math.PI * 2) / 3;
        const px = sx(hx + Math.cos(a) * 0.45);
        const py = sy(hy + 0.35 + Math.sin(a) * 0.15);
        this.star(px, py, m * 0.13 * show, a);
      }
    }
  }

  private star(x: number, y: number, r: number, rot: number) {
    const { ctx } = this;
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 === 0 ? r : r * 0.45;
      const a = rot + (k * Math.PI) / 5;
      if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawSurfaceDetail(sim: Sim, left: number, right: number, sx: (x: number) => number, sy: (y: number) => number, m: number, time: number) {
    const { ctx } = this;
    const biomes = sim.config.biomes;
    for (let k = Math.floor(left / 0.9); k <= Math.ceil(right / 0.9); k++) {
      const x = k * 0.9 + hash(k * 1.3) * 0.6;
      const b = biomeOf(biomes, x);
      const r = hash(k * 7.7);
      const h = sim.terrain.sample(x).h;
      const px = sx(x);
      const py = sy(h) - m * 0.1;
      switch (b.detail) {
        case "grass": {
          if (r > 0.75) break;
          const sway = Math.sin(time * 2.2 + x * 0.6) * m * 0.05;
          ctx.strokeStyle = r > 0.4 ? "#3f9a35" : "#6fd45a";
          ctx.lineWidth = Math.max(1, m * 0.05);
          ctx.beginPath();
          ctx.moveTo(px - m * 0.1, py);
          ctx.lineTo(px - m * 0.16 + sway, py - m * 0.3);
          ctx.moveTo(px, py);
          ctx.lineTo(px + sway, py - m * 0.4);
          ctx.moveTo(px + m * 0.1, py);
          ctx.lineTo(px + m * 0.18 + sway, py - m * 0.28);
          ctx.stroke();
          break;
        }
        case "sand": {
          if (r > 0.35) break;
          ctx.fillStyle = "rgba(160,100,40,0.35)";
          ctx.fillRect(px, py + m * 0.25, m * 0.35, Math.max(1, m * 0.04));
          break;
        }
        case "snow": {
          if (r > 0.3) break;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.ellipse(px, py + m * 0.02, m * (0.2 + r * 0.6), m * 0.12, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "ash": {
          if (r > 0.25) break;
          const pulse = 0.5 + 0.5 * Math.sin(time * 2 + x);
          ctx.strokeStyle = `rgba(255,${Math.round(90 + 80 * pulse)},30,${0.5 + 0.4 * pulse})`;
          ctx.lineWidth = Math.max(1, m * 0.05);
          ctx.beginPath();
          ctx.moveTo(px, py + m * 0.3);
          ctx.lineTo(px + m * 0.2, py + m * 0.55);
          ctx.lineTo(px + m * 0.1, py + m * 0.8);
          ctx.stroke();
          break;
        }
        case "moss": {
          if (r > 0.3) break;
          ctx.fillStyle = `rgba(150,255,220,${0.4 + 0.4 * Math.sin(time * 1.5 + x)})`;
          ctx.beginPath();
          ctx.arc(px, py - m * 0.05, m * 0.06, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
  }

  private drawMarkers(sim: Sim, left: number, right: number, sx: (x: number) => number, sy: (y: number) => number, m: number) {
    const { ctx } = this;
    ctx.font = `bold ${Math.round(m * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    for (let d = Math.ceil(left / 100) * 100; d <= right; d += 100) {
      if (d <= 0) continue;
      const base = sim.terrain.sample(d).h;
      const px = sx(d);
      ctx.fillStyle = "#5b4033";
      ctx.fillRect(px - m * 0.05, sy(base + 2.6), m * 0.1, m * 2.6);
      ctx.fillStyle = d % 500 === 0 ? "#ffd166" : "#ffffff";
      ctx.beginPath();
      ctx.moveTo(px + m * 0.05, sy(base + 2.6));
      ctx.lineTo(px + m * 1.5, sy(base + 2.3));
      ctx.lineTo(px + m * 0.05, sy(base + 2.0));
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = m * 0.08;
      ctx.strokeText(`${d} m`, px, sy(base + 2.9));
      ctx.fillText(`${d} m`, px, sy(base + 2.9));
    }
  }

  private drawPickups(sim: Sim, left: number, right: number, sx: (x: number) => number, sy: (y: number) => number, m: number, time: number) {
    const { ctx } = this;
    const t = sim.terrain;
    for (let i = 0; i < t.resolvedPickups; i++) {
      const p = t.pickups[i];
      if (p.x < left - 2 || p.x > right + 2 || sim.collected.has(i)) continue;
      const bob = Math.sin(time * 3 + p.x) * 0.08;
      const px = sx(p.x);
      const py = sy(p.y + bob);
      if (p.kind === "coin") {
        const squeeze = 0.35 + 0.65 * Math.abs(Math.cos(time * 2.5 + p.x * 0.7));
        ctx.fillStyle = "rgba(255,220,100,0.25)";
        ctx.beginPath();
        ctx.arc(px, py, m * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#d99a00";
        ctx.beginPath();
        ctx.ellipse(px, py, m * 0.32 * squeeze, m * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.ellipse(px, py, m * 0.22 * squeeze, m * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(px - m * 0.05 * squeeze, py - m * 0.14, m * 0.06 * squeeze, m * 0.12);
      } else {
        const w = m * 0.62;
        const h = m * 0.78;
        ctx.fillStyle = "rgba(255,80,80,0.25)";
        ctx.beginPath();
        ctx.arc(px, py, m * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c81d25";
        ctx.beginPath();
        ctx.roundRect(px - w / 2, py - h / 2, w, h, m * 0.1);
        ctx.fill();
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(px - w * 0.15, py - h / 2 - m * 0.14, w * 0.3, m * 0.16);
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(m * 0.42)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("F", px, py + m * 0.15);
      }
    }
  }

  private emitDust(sim: Sim, biome: Biome, dt: number) {
    if (dt === 0 || sim.finished) return;
    const color = DUST[biome.detail];
    for (const wh of sim.wheels) {
      if (wh.fn <= 0) continue;
      const slip = Math.abs(wh.w * WHEEL_RADIUS - (wh.vx * wh.tx + wh.vy * wh.ty));
      const speed = Math.abs(wh.vx);
      const rate = Math.min(1, slip * 0.25 + speed * 0.03);
      if (Math.random() > rate * dt * 60) continue;
      this.particles.emit({
        x: wh.x - WHEEL_RADIUS * 0.6,
        y: wh.y - WHEEL_RADIUS * 0.8,
        vx: -1.5 - Math.random() * 2 - slip * 0.3,
        vy: 1 + Math.random() * 2,
        life: 0,
        max: 0.5 + Math.random() * 0.5,
        size: 0.12 + Math.random() * 0.15,
        color,
      });
    }
  }

  private drawHeadlight(ch: Snapshot, sx: (x: number) => number, sy: (y: number) => number, m: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(sx(ch.x), sy(ch.y));
    ctx.rotate(-Math.atan2(ch.s, ch.c));
    const beam = ctx.createLinearGradient(1.4 * m, 0, 9 * m, 0);
    beam.addColorStop(0, "rgba(255,250,200,0.45)");
    beam.addColorStop(1, "rgba(255,250,200,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(1.4 * m, -0.05 * m);
    ctx.lineTo(9 * m, -1.6 * m);
    ctx.lineTo(9 * m, 1.6 * m);
    ctx.lineTo(1.4 * m, 0.15 * m);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawVehicle(ch: Snapshot, sx: (x: number) => number, sy: (y: number) => number, m: number, crashed: boolean) {
    const { ctx } = this;
    const angle = Math.atan2(ch.s, ch.c);

    for (const wh of ch.wheels) {
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = m * 0.1;
      ctx.beginPath();
      ctx.moveTo(sx(wh.x), sy(wh.y));
      ctx.lineTo(sx(ch.x + (wh.x - ch.x) * 0.55), sy(ch.y + (wh.y - ch.y) * 0.4));
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(sx(ch.x), sy(ch.y));
    ctx.rotate(-angle);
    ctx.fillStyle = "#e4572e";
    ctx.strokeStyle = "#7a2410";
    ctx.lineWidth = m * 0.06;
    ctx.beginPath();
    HULL.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * m, -y * m) : ctx.lineTo(x * m, -y * m)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f07a52";
    ctx.fillRect(-1.2 * m, -0.28 * m, 2.5 * m, 0.1 * m);
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(1.3 * m, -0.12 * m, 0.14 * m, 0.16 * m);
    ctx.fillStyle = "#2b2d42";
    ctx.fillRect(-0.35 * m, -0.75 * m, 0.5 * m, 0.5 * m);
    ctx.strokeStyle = "#2b2d42";
    ctx.lineWidth = m * 0.12;
    ctx.beginPath();
    ctx.moveTo(0.1 * m, -0.6 * m);
    ctx.lineTo(0.55 * m, -0.45 * m);
    ctx.stroke();
    ctx.strokeStyle = "#e9c46a";
    ctx.lineWidth = m * 0.09;
    ctx.beginPath();
    ctx.moveTo(-0.15 * m, -0.78 * m);
    ctx.quadraticCurveTo(-0.6 * m, -0.85 * m, -0.85 * m, -0.6 * m);
    ctx.stroke();
    ctx.fillStyle = "#ffd6a5";
    ctx.beginPath();
    ctx.arc(HEAD[0] * m, -HEAD[1] * m, HEAD_RADIUS * m, 0, Math.PI * 2);
    ctx.fill();
    if (crashed) {
      ctx.fillStyle = "#6b3e26";
      ctx.beginPath();
      ctx.arc(HEAD[0] * m, -HEAD[1] * m - HEAD_RADIUS * m * 0.35, HEAD_RADIUS * m * 0.75, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.strokeStyle = "#1d2a3a";
      ctx.lineWidth = m * 0.04;
      const ex = HEAD[0] * m + HEAD_RADIUS * m * 0.4;
      const ey = -HEAD[1] * m - HEAD_RADIUS * m * 0.1;
      const e = HEAD_RADIUS * m * 0.18;
      ctx.beginPath();
      ctx.moveTo(ex - e, ey - e);
      ctx.lineTo(ex + e, ey + e);
      ctx.moveTo(ex + e, ey - e);
      ctx.lineTo(ex - e, ey + e);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#1d3557";
      ctx.beginPath();
      ctx.arc(HEAD[0] * m, -HEAD[1] * m, HEAD_RADIUS * m * 1.05, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(180,220,255,0.85)";
      ctx.fillRect(HEAD[0] * m, -HEAD[1] * m - 0.02 * m, HEAD_RADIUS * m * 1.05, 0.1 * m);
    }
    ctx.restore();

    for (const wh of ch.wheels) {
      const px = sx(wh.x);
      const py = sy(wh.y);
      const r = WHEEL_RADIUS * m;
      ctx.fillStyle = "#1f1f1f";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = r * 0.12;
      for (let k = 0; k < 10; k++) {
        const a = -wh.angle + (k * Math.PI) / 5;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a) * r * 0.82, py + Math.sin(a) * r * 0.82);
        ctx.lineTo(px + Math.cos(a) * r * 0.98, py + Math.sin(a) * r * 0.98);
        ctx.stroke();
      }
      ctx.fillStyle = "#9aa5b1";
      ctx.beginPath();
      ctx.arc(px, py, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1f1f1f";
      ctx.lineWidth = r * 0.14;
      for (let k = 0; k < 3; k++) {
        const a = -wh.angle + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * r * 0.55, py + Math.sin(a) * r * 0.55);
        ctx.stroke();
      }
      ctx.fillStyle = "#e4572e";
      ctx.beginPath();
      ctx.arc(px, py, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

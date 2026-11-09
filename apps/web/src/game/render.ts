import { HEAD, HEAD_RADIUS, HULL, WHEEL_RADIUS, type GameConfig, type Sim } from "@talus/game-core";

type Rgb = [number, number, number];

function hex(c: string): Rgb {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const r = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${r[0]},${r[1]},${r[2]})`;
}

function palette(config: GameConfig, x: number) {
  const biomes = config.biomes;
  let i = 0;
  while (i + 1 < biomes.length && x >= biomes[i + 1].from) i++;
  const cur = biomes[i];
  const next = biomes[i + 1];
  const blend = next ? Math.max(0, Math.min(1, (x - (next.from - 120)) / 120)) : 0;
  const pick = (k: "hills" | "ground" | "surface") => (next ? mix(cur[k], next[k], blend) : mix(cur[k], cur[k], 0));
  return {
    skyTop: next ? mix(cur.sky[0], next.sky[0], blend) : cur.sky[0],
    skyBottom: next ? mix(cur.sky[1], next.sky[1], blend) : cur.sky[1],
    hills: pick("hills"),
    ground: pick("ground"),
    surface: pick("surface"),
  };
}

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

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private camX = 0;
  private camY = 0;

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

  private camVx = 0;

  draw(sim: Sim, prev: Snapshot, alpha: number, time: number, dt: number) {
    this.resize();
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const scale = H / 15;
    const ch = interpolate(prev, snapshot(sim), alpha);
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
    const pal = palette(sim.config, ch.x);

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    this.drawHills(W, H, 0.15, 0.42, pal.hills, 0.45);
    this.drawHills(W, H, 0.35, 0.55, pal.hills, 0.8);

    const step = Math.max(0.25, 4 / scale);
    ctx.beginPath();
    ctx.moveTo(sx(left - 1), H + 10);
    for (let x = left - 1; x <= right + 1; x += step) ctx.lineTo(sx(x), sy(sim.terrain.sample(x).h));
    ctx.lineTo(sx(right + 1), H + 10);
    ctx.closePath();
    ctx.fillStyle = pal.ground;
    ctx.fill();
    ctx.beginPath();
    for (let x = left - 1; x <= right + 1; x += step) {
      const px = sx(x);
      const py = sy(sim.terrain.sample(x).h);
      if (x === left - 1) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineWidth = scale * 0.28;
    ctx.lineJoin = "round";
    ctx.strokeStyle = pal.surface;
    ctx.stroke();

    ctx.font = `bold ${Math.round(scale * 0.45)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    for (let m = Math.ceil(left / 100) * 100; m <= right; m += 100) {
      if (m <= 0) continue;
      const base = sim.terrain.sample(m).h;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(sx(m) - scale * 0.04, sy(base + 2.2), scale * 0.08, scale * 2.2);
      ctx.fillStyle = "#fff";
      ctx.fillText(`${m} m`, sx(m), sy(base + 2.4));
    }

    const t = sim.terrain;
    for (let i = 0; i < t.resolvedPickups; i++) {
      const p = t.pickups[i];
      if (p.x < left - 2 || p.x > right + 2 || sim.collected.has(i)) continue;
      const bob = Math.sin(time * 3 + p.x) * 0.08;
      const px = sx(p.x);
      const py = sy(p.y + bob);
      if (p.kind === "coin") {
        const squeeze = Math.abs(Math.cos(time * 2.5 + p.x * 0.7));
        ctx.fillStyle = "#e0a100";
        ctx.beginPath();
        ctx.ellipse(px, py, scale * 0.32 * (0.35 + 0.65 * squeeze), scale * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.ellipse(px, py, scale * 0.22 * (0.35 + 0.65 * squeeze), scale * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const w = scale * 0.6;
        const h = scale * 0.75;
        ctx.fillStyle = "#d62828";
        ctx.beginPath();
        ctx.roundRect(px - w / 2, py - h / 2, w, h, scale * 0.1);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(scale * 0.42)}px system-ui, sans-serif`;
        ctx.fillText("F", px, py + scale * 0.15);
      }
    }

    this.drawVehicle(ch, sx, sy, scale);
  }

  private drawHills(W: number, H: number, parallax: number, height: number, color: string, alpha: number) {
    const { ctx } = this;
    const offset = this.camX * parallax * 20;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let px = 0; px <= W + 8; px += 8) {
      const u = (px + offset) / W;
      const y = H * height + Math.sin(u * 5.1) * H * 0.06 + Math.sin(u * 11.7 + 1.3) * H * 0.025;
      ctx.lineTo(px, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawVehicle(ch: Snapshot, sx: (x: number) => number, sy: (y: number) => number, scale: number) {
    const { ctx } = this;
    const angle = Math.atan2(ch.s, ch.c);

    for (const wh of ch.wheels) {
      const anchorX = sx(wh.x);
      const anchorY = sy(wh.y);
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = scale * 0.1;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY);
      const bx = ch.x + (wh.x - ch.x) * 0.55;
      const by = ch.y + (wh.y - ch.y) * 0.4;
      ctx.lineTo(sx(bx), sy(by));
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(sx(ch.x), sy(ch.y));
    ctx.rotate(-angle);
    ctx.fillStyle = "#e4572e";
    ctx.strokeStyle = "#7a2410";
    ctx.lineWidth = scale * 0.06;
    ctx.beginPath();
    HULL.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * scale, -y * scale) : ctx.lineTo(x * scale, -y * scale)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2b2d42";
    ctx.fillRect(-0.35 * scale, -0.75 * scale, 0.5 * scale, 0.5 * scale);
    ctx.fillStyle = "#ffd6a5";
    ctx.beginPath();
    ctx.arc(HEAD[0] * scale, -HEAD[1] * scale, HEAD_RADIUS * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1d3557";
    ctx.beginPath();
    ctx.arc(HEAD[0] * scale, -HEAD[1] * scale, HEAD_RADIUS * scale * 1.05, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (const wh of ch.wheels) {
      const px = sx(wh.x);
      const py = sy(wh.y);
      const r = WHEEL_RADIUS * scale;
      ctx.fillStyle = "#1f1f1f";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
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
    }
  }
}

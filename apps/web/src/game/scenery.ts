import type { Biome, PropKind } from "@talus/game-core";

export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type Ctx = CanvasRenderingContext2D;

function rgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(x[0] + (y[0] - x[0]) * t)}${h(x[1] + (y[1] - x[1]) * t)}${h(x[2] + (y[2] - x[2]) * t)}`;
}

export function shade(c: string, k: number): string {
  return k < 0 ? mix(c, "#000000", -k) : mix(c, "#ffffff", k);
}

export function luminance(c: string): number {
  const [r, g, b] = rgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export interface Palette {
  skyTop: string;
  skyBottom: string;
  far: string;
  hills: string;
  ground: string;
  surface: string;
  cloud: string;
}

export function palette(biomes: Biome[], x: number): { pal: Palette; cur: Biome; next: Biome | undefined; blend: number } {
  let i = 0;
  while (i + 1 < biomes.length && x >= biomes[i + 1].from) i++;
  const cur = biomes[i];
  const next = biomes[i + 1];
  const blend = next ? Math.max(0, Math.min(1, (x - (next.from - 150)) / 150)) : 0;
  const m = (a: string, b: string | undefined) => (b ? mix(a, b, blend) : a);
  return {
    cur,
    next,
    blend,
    pal: {
      skyTop: m(cur.sky[0], next?.sky[0]),
      skyBottom: m(cur.sky[1], next?.sky[1]),
      far: m(cur.far, next?.far),
      hills: m(cur.hills, next?.hills),
      ground: m(cur.ground, next?.ground),
      surface: m(cur.surface, next?.surface),
      cloud: m(cur.cloud, next?.cloud),
    },
  };
}

export function biomeOf(biomes: Biome[], x: number): Biome {
  let b = biomes[0];
  for (const it of biomes) if (x >= it.from) b = it;
  return b;
}

export function drawSky(ctx: Ctx, W: number, H: number, pal: Palette, cur: Biome, camX: number, time: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (cur.stars) {
    for (let i = 0; i < 90; i++) {
      const x = (hash(i) * W * 1.3 - camX * 0.6) % (W * 1.3);
      const px = x < 0 ? x + W * 1.3 : x;
      const py = hash(i + 500) * H * 0.55;
      const tw = 0.5 + 0.5 * Math.sin(time * (1 + hash(i + 9) * 3) + i);
      ctx.fillStyle = `rgba(255,255,240,${0.35 + 0.6 * tw})`;
      const r = (hash(i + 77) < 0.1 ? 2.2 : 1.2) * (H / 720);
      ctx.fillRect(px, py, r, r);
    }
  }
  if (cur.landmark === "aurora") {
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      const base = H * (0.14 + band * 0.07);
      for (let px = 0; px <= W; px += 12) {
        const u = px / W;
        const y = base + Math.sin(u * 6 + time * 0.4 + band) * H * 0.04 + Math.sin(u * 13 - time * 0.7) * H * 0.015;
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.lineWidth = H * 0.05;
      ctx.strokeStyle = band === 1 ? "rgba(140,120,255,0.18)" : "rgba(90,255,180,0.22)";
      ctx.stroke();
    }
  }
  if (cur.celestial !== "none") {
    const cx = W * 0.78;
    const cy = H * 0.2;
    const r = H * (cur.celestial === "sun" ? 0.06 : 0.045);
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 4);
    glow.addColorStop(0, cur.celestial === "sun" ? "rgba(255,240,180,0.55)" : "rgba(220,220,255,0.35)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
    ctx.fillStyle = cur.celestial === "sun" ? "#fff3c4" : "#f0eefc";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (cur.celestial === "moon") {
      ctx.fillStyle = "rgba(180,175,210,0.6)";
      ctx.beginPath();
      ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.35, cy + r * 0.3, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawClouds(ctx: Ctx, W: number, H: number, color: string, camX: number, time: number, smoky: boolean) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = smoky ? 0.55 : 0.85;
  for (let i = 0; i < 7; i++) {
    const span = W * 1.6;
    let x = (hash(i * 3.1) * span - camX * 4 - time * (8 + hash(i) * 10)) % span;
    if (x < 0) x += span;
    x -= W * 0.3;
    const y = H * (0.08 + hash(i + 40) * 0.3);
    const s = H * (0.035 + hash(i + 90) * 0.03);
    ctx.beginPath();
    ctx.ellipse(x, y, s * 2.4, s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * 1.3, y + s * 0.2, s * 1.4, s * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.9, y - s * 0.5, s * 1.4, s * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function farHeight(shape: Biome["farShape"], u: number): number {
  if (shape === "mesas") {
    const cell = Math.floor(u * 3);
    const f = u * 3 - cell;
    const h = 0.35 + hash(cell) * 0.65;
    const edge = Math.min(1, Math.min(f, 1 - f) * 10);
    return h * edge * (hash(cell + 17) > 0.35 ? 1 : 0.3);
  }
  if (shape === "peaks") {
    const cell = Math.floor(u * 4);
    const f = u * 4 - cell;
    const h = 0.45 + hash(cell + 3) * 0.55;
    return h * (1 - Math.abs(f - 0.5) * 2) * 0.9 + Math.sin(u * 40) * 0.02;
  }
  return 0.5 + Math.sin(u * 4.3) * 0.25 + Math.sin(u * 9.1 + 1.7) * 0.12;
}

export function drawFar(ctx: Ctx, W: number, H: number, pal: Palette, cur: Biome, camX: number, time: number) {
  const offset = camX * 2.2;
  const top = H * 0.25;
  const bottom = H * 0.62;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let px = 0; px <= W + 6; px += 6) {
    const u = (px + offset) / (W * 0.9);
    ctx.lineTo(px, bottom - farHeight(cur.farShape, u) * (bottom - top));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = pal.far;
  ctx.fill();

  if (cur.farShape === "peaks" && luminance(pal.far) > 0.55) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(0, top - 10, W, (bottom - top) * 0.28);
    ctx.restore();
  }

  if (cur.landmark === "volcano") {
    const span = W * 1.8;
    const vx = ((((W * 0.7 - camX * 1.6) % span) + span) % span) - W * 0.3;
    const vy = H * 0.62;
    const vw = W * 0.28;
    const vh = H * 0.36;
    ctx.fillStyle = shade(pal.far, -0.25);
    ctx.beginPath();
    ctx.moveTo(vx - vw, vy);
    ctx.lineTo(vx - vw * 0.12, vy - vh);
    ctx.lineTo(vx + vw * 0.12, vy - vh);
    ctx.lineTo(vx + vw, vy);
    ctx.closePath();
    ctx.fill();
    const glow = ctx.createRadialGradient(vx, vy - vh, 2, vx, vy - vh, vw * 0.5);
    glow.addColorStop(0, "rgba(255,170,60,0.9)");
    glow.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(vx - vw * 0.5, vy - vh - vw * 0.5, vw, vw);
    ctx.strokeStyle = "rgba(255,110,40,0.8)";
    ctx.lineWidth = H * 0.006;
    ctx.beginPath();
    ctx.moveTo(vx - vw * 0.05, vy - vh);
    ctx.quadraticCurveTo(vx - vw * 0.2, vy - vh * 0.5, vx - vw * 0.35, vy - vh * 0.1);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const t = (time * 0.12 + i / 6) % 1;
      ctx.fillStyle = `rgba(70,55,55,${2 * t * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(vx + Math.sin(t * 5 + i) * vw * 0.15 + t * vw * 0.3, vy - vh - t * vh * 0.8, vw * (0.06 + t * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawHills(ctx: Ctx, W: number, H: number, color: string, camX: number, decorate: PropKind | null) {
  const offset = camX * 6;
  const yAt = (px: number) => {
    const u = (px + offset) / W;
    return H * 0.56 + Math.sin(u * 5.1) * H * 0.05 + Math.sin(u * 11.7 + 1.3) * H * 0.022;
  };
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let px = 0; px <= W + 8; px += 8) ctx.lineTo(px, yAt(px));
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (!decorate) return;
  const spacing = W / 14;
  const start = Math.floor(offset / spacing);
  ctx.fillStyle = shade(color, -0.18);
  for (let k = start; k < start + 16; k++) {
    if (hash(k * 1.7) > 0.55) continue;
    const px = k * spacing - offset + hash(k) * spacing * 0.6;
    const py = yAt(px) + 2;
    const s = H * (0.018 + hash(k + 5) * 0.012);
    ctx.beginPath();
    if (decorate === "pine") {
      ctx.moveTo(px - s, py);
      ctx.lineTo(px, py - s * 3.2);
      ctx.lineTo(px + s, py);
    } else if (decorate === "cactus") {
      ctx.rect(px - s * 0.25, py - s * 2.4, s * 0.5, s * 2.4);
      ctx.rect(px - s * 0.9, py - s * 1.6, s * 0.4, s * 0.9);
    } else {
      ctx.arc(px, py - s * 1.4, s * 1.2, 0, Math.PI * 2);
      ctx.rect(px - s * 0.15, py - s * 1.4, s * 0.3, s * 1.4);
    }
    ctx.fill();
  }
}

export function drawProp(ctx: Ctx, kind: PropKind, px: number, py: number, m: number, r: number, time: number) {
  const s = m * (0.8 + r * 0.5);
  switch (kind) {
    case "tree": {
      ctx.fillStyle = "#6d4c2f";
      ctx.fillRect(px - s * 0.17, py - s * 1.9, s * 0.34, s * 1.9);
      const leaf = r > 0.5 ? "#3f8f3a" : "#4d9b3f";
      ctx.fillStyle = shade(leaf, -0.15);
      ctx.beginPath();
      ctx.arc(px - s * 0.7, py - s * 2.0, s * 0.85, 0, Math.PI * 2);
      ctx.arc(px + s * 0.75, py - s * 2.1, s * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = leaf;
      ctx.beginPath();
      ctx.arc(px, py - s * 2.7, s * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(leaf, 0.2);
      ctx.beginPath();
      ctx.arc(px - s * 0.35, py - s * 3.05, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "bush": {
      ctx.fillStyle = "#3d8a3a";
      ctx.beginPath();
      ctx.arc(px - s * 0.45, py - s * 0.3, s * 0.5, 0, Math.PI * 2);
      ctx.arc(px + s * 0.45, py - s * 0.3, s * 0.45, 0, Math.PI * 2);
      ctx.arc(px, py - s * 0.55, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e94f64";
      for (let i = 0; i < 3; i++) ctx.fillRect(px + (hash(r * 10 + i) - 0.5) * s, py - s * (0.4 + hash(i + r) * 0.5), s * 0.12, s * 0.12);
      break;
    }
    case "flower": {
      const colors = ["#ff6b6b", "#ffd166", "#f78fb3", "#ffffff", "#9b8cff"];
      for (let i = 0; i < 3; i++) {
        const fx = px + (i - 1) * s * 0.35;
        const h = s * (0.45 + hash(r * 7 + i) * 0.35);
        const sway = Math.sin(time * 2 + fx * 0.05) * s * 0.06;
        ctx.strokeStyle = "#3f8f3a";
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.beginPath();
        ctx.moveTo(fx, py);
        ctx.lineTo(fx + sway, py - h);
        ctx.stroke();
        ctx.fillStyle = colors[Math.floor(hash(r * 13 + i) * colors.length)];
        ctx.beginPath();
        ctx.arc(fx + sway, py - h, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "cactus": {
      const g = "#3f8f55";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(px - s * 0.25, py - s * 2.4, s * 0.5, s * 2.4, s * 0.25);
      ctx.roundRect(px - s * 0.9, py - s * 1.7, s * 0.36, s * 0.9, s * 0.18);
      ctx.roundRect(px - s * 0.9, py - s * 1.0, s * 0.8, s * 0.3, s * 0.15);
      if (r > 0.4) {
        ctx.roundRect(px + s * 0.55, py - s * 2.0, s * 0.34, s * 0.8, s * 0.17);
        ctx.roundRect(px + s * 0.1, py - s * 1.4, s * 0.78, s * 0.28, s * 0.14);
      }
      ctx.fill();
      ctx.strokeStyle = shade(g, -0.25);
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(px, py - s * 2.25);
      ctx.lineTo(px, py - s * 0.1);
      ctx.stroke();
      if (r > 0.7) {
        ctx.fillStyle = "#ff7aa2";
        ctx.beginPath();
        ctx.arc(px, py - s * 2.45, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "rock": {
      ctx.fillStyle = "#8a8f98";
      ctx.beginPath();
      ctx.moveTo(px - s * 0.8, py);
      ctx.lineTo(px - s * 0.6, py - s * 0.6);
      ctx.lineTo(px - s * 0.1, py - s * 0.85);
      ctx.lineTo(px + s * 0.55, py - s * 0.55);
      ctx.lineTo(px + s * 0.8, py);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(px - s * 0.6, py - s * 0.6);
      ctx.lineTo(px - s * 0.1, py - s * 0.85);
      ctx.lineTo(px - s * 0.05, py - s * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "deadTree": {
      ctx.strokeStyle = "#4a3426";
      ctx.lineCap = "round";
      ctx.lineWidth = s * 0.18;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + s * 0.1, py - s * 2.2);
      ctx.moveTo(px + s * 0.05, py - s * 1.3);
      ctx.lineTo(px - s * 0.6, py - s * 1.9);
      ctx.moveTo(px + s * 0.08, py - s * 1.7);
      ctx.lineTo(px + s * 0.7, py - s * 2.3);
      ctx.stroke();
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.moveTo(px - s * 0.4, py - s * 1.75);
      ctx.lineTo(px - s * 0.45, py - s * 2.2);
      ctx.moveTo(px + s * 0.5, py - s * 2.15);
      ctx.lineTo(px + s * 0.75, py - s * 2.05);
      ctx.stroke();
      ctx.lineCap = "butt";
      break;
    }
    case "pine": {
      const h = s * (2.6 + r);
      ctx.fillStyle = "#5b4033";
      ctx.fillRect(px - s * 0.12, py - s * 0.6, s * 0.24, s * 0.6);
      for (let i = 0; i < 3; i++) {
        const base = py - s * 0.4 - i * h * 0.24;
        const w = s * (1.0 - i * 0.22);
        ctx.fillStyle = "#2f5d50";
        ctx.beginPath();
        ctx.moveTo(px - w, base);
        ctx.lineTo(px, base - h * 0.42);
        ctx.lineTo(px + w, base);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f4f8fc";
        ctx.beginPath();
        ctx.moveTo(px - w * 0.45, base - h * 0.23);
        ctx.lineTo(px, base - h * 0.42);
        ctx.lineTo(px + w * 0.45, base - h * 0.23);
        ctx.quadraticCurveTo(px, base - h * 0.28, px - w * 0.45, base - h * 0.23);
        ctx.fill();
      }
      break;
    }
    case "snowman": {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py - s * 0.45, s * 0.5, 0, Math.PI * 2);
      ctx.arc(px, py - s * 1.15, s * 0.36, 0, Math.PI * 2);
      ctx.arc(px, py - s * 1.65, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1d2a3a";
      ctx.fillRect(px - s * 0.06, py - s * 1.75, s * 0.05, s * 0.05);
      ctx.fillRect(px + s * 0.06, py - s * 1.75, s * 0.05, s * 0.05);
      ctx.fillStyle = "#f08a24";
      ctx.beginPath();
      ctx.moveTo(px + s * 0.05, py - s * 1.66);
      ctx.lineTo(px + s * 0.4, py - s * 1.62);
      ctx.lineTo(px + s * 0.05, py - s * 1.58);
      ctx.fill();
      ctx.fillStyle = "#d62828";
      ctx.fillRect(px - s * 0.3, py - s * 1.45, s * 0.6, s * 0.09);
      break;
    }
    case "lavaRock": {
      ctx.fillStyle = "#1c1212";
      ctx.beginPath();
      ctx.moveTo(px - s * 1.0, py);
      ctx.lineTo(px - s * 0.7, py - s * 0.9);
      ctx.lineTo(px - s * 0.1, py - s * 1.3);
      ctx.lineTo(px + s * 0.6, py - s * 0.8);
      ctx.lineTo(px + s * 1.0, py);
      ctx.closePath();
      ctx.fill();
      const pulse = 0.6 + 0.4 * Math.sin(time * 3 + r * 10);
      ctx.strokeStyle = `rgba(255,${Math.round(110 + 60 * pulse)},40,${0.7 + 0.3 * pulse})`;
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(px - s * 0.5, py - s * 0.15);
      ctx.lineTo(px - s * 0.2, py - s * 0.6);
      ctx.lineTo(px + s * 0.1, py - s * 0.5);
      ctx.lineTo(px + s * 0.35, py - s * 0.9);
      ctx.stroke();
      break;
    }
    case "crystal": {
      const hue = r > 0.5 ? "#7ee8ff" : "#c79bff";
      const glow = ctx.createRadialGradient(px, py - s, 1, px, py - s, s * 2);
      glow.addColorStop(0, hue + "66");
      glow.addColorStop(1, hue + "00");
      ctx.fillStyle = glow;
      ctx.fillRect(px - s * 2, py - s * 3, s * 4, s * 4);
      const shards: [number, number, number][] = [
        [0, 1.9, 0.32],
        [-0.45, 1.2, 0.24],
        [0.42, 1.4, 0.26],
      ];
      for (const [ox, h, w] of shards) {
        ctx.fillStyle = hue;
        ctx.beginPath();
        ctx.moveTo(px + (ox - w) * s, py);
        ctx.lineTo(px + (ox - w * 0.7) * s, py - h * s * 0.75);
        ctx.lineTo(px + ox * s, py - h * s);
        ctx.lineTo(px + (ox + w * 0.7) * s, py - h * s * 0.75);
        ctx.lineTo(px + (ox + w) * s, py);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.moveTo(px + (ox - w * 0.7) * s, py - h * s * 0.75);
        ctx.lineTo(px + ox * s, py - h * s);
        ctx.lineTo(px + ox * s, py);
        ctx.lineTo(px + (ox - w * 0.5) * s, py);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "mushroom": {
      const cap = r > 0.5 ? "#ff7ac6" : "#5ff2d0";
      const glow = ctx.createRadialGradient(px, py - s * 1.1, 1, px, py - s * 1.1, s * 1.6);
      glow.addColorStop(0, cap + "55");
      glow.addColorStop(1, cap + "00");
      ctx.fillStyle = glow;
      ctx.fillRect(px - s * 1.6, py - s * 2.7, s * 3.2, s * 3.2);
      ctx.fillStyle = "#e9e2f5";
      ctx.fillRect(px - s * 0.13, py - s * 1.1, s * 0.26, s * 1.1);
      ctx.fillStyle = cap;
      ctx.beginPath();
      ctx.ellipse(px, py - s * 1.1, s * 0.7, s * 0.42, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(px - s * 0.25, py - s * 1.3, s * 0.08, 0, Math.PI * 2);
      ctx.arc(px + s * 0.2, py - s * 1.38, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

export function drawWeather(ctx: Ctx, W: number, H: number, kind: Biome["weather"], camX: number, camY: number, time: number, alpha: number) {
  if (kind === "none" || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const count = kind === "snow" ? 110 : kind === "dust" ? 40 : 35;
  const u = H / 720;
  for (let i = 0; i < count; i++) {
    const a = hash(i * 1.37);
    const b = hash(i * 2.91 + 4);
    const depth = 0.4 + hash(i + 13) * 0.8;
    let x = 0;
    let y = 0;
    if (kind === "snow") {
      x = a * W - camX * 30 * depth + Math.sin(time * 0.8 + i) * 18 * u;
      y = b * H + time * 55 * depth * u + camY * 30 * depth;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      wrapDraw(ctx, x, y, W, H, (px, py) => ctx.fillRect(px, py, 2.6 * depth * u, 2.6 * depth * u));
    } else if (kind === "embers") {
      x = a * W - camX * 30 * depth + Math.sin(time * 1.3 + i) * 14 * u;
      y = b * H - time * 45 * depth * u + camY * 30 * depth;
      const flick = 0.5 + 0.5 * Math.sin(time * 6 + i * 3);
      ctx.fillStyle = `rgba(255,${Math.round(120 + 90 * flick)},50,${0.5 + 0.5 * flick})`;
      wrapDraw(ctx, x, y, W, H, (px, py) => ctx.fillRect(px, py, 2.5 * depth * u, 2.5 * depth * u));
    } else if (kind === "fireflies") {
      x = a * W - camX * 20 * depth + Math.sin(time * 0.6 + i * 1.7) * 40 * u;
      y = H * 0.35 + b * H * 0.6 + Math.cos(time * 0.9 + i) * 25 * u + camY * 20 * depth;
      const on = Math.max(0, Math.sin(time * 2 + i * 2.3));
      wrapDraw(ctx, x, y, W, H, (px, py) => {
        ctx.fillStyle = `rgba(230,255,140,${0.15 * on})`;
        ctx.beginPath();
        ctx.arc(px, py, 9 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(250,255,190,${0.9 * on})`;
        ctx.fillRect(px - 1.5 * u, py - 1.5 * u, 3 * u, 3 * u);
      });
    } else if (kind === "dust") {
      x = a * W - camX * 30 * depth - time * 90 * depth * u;
      y = H * 0.4 + b * H * 0.55 + Math.sin(time + i) * 10 * u + camY * 30 * depth;
      ctx.fillStyle = "rgba(255,235,200,0.45)";
      wrapDraw(ctx, x, y, W, H, (px, py) => ctx.fillRect(px, py, 14 * depth * u, 1.6 * u));
    } else if (kind === "pollen") {
      x = a * W - camX * 30 * depth + Math.sin(time * 0.7 + i) * 30 * u;
      y = H * 0.3 + b * H * 0.6 + Math.sin(time * 1.1 + i * 0.5) * 20 * u + camY * 30 * depth;
      ctx.fillStyle = "rgba(255,255,220,0.7)";
      wrapDraw(ctx, x, y, W, H, (px, py) => ctx.fillRect(px, py, 2.2 * u, 2.2 * u));
    }
  }
  ctx.restore();
}

function wrapDraw(_ctx: Ctx, x: number, y: number, W: number, H: number, draw: (px: number, py: number) => void) {
  const px = ((x % W) + W) % W;
  const py = ((y % H) + H) % H;
  draw(px, py);
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export class Particles {
  private items: Particle[] = [];

  emit(p: Particle) {
    if (this.items.length < 220) this.items.push(p);
  }

  clear() {
    this.items = [];
  }

  update(dt: number, gravity: number) {
    for (const p of this.items) {
      p.life += dt;
      p.vy -= gravity * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.items = this.items.filter((p) => p.life < p.max);
  }

  draw(ctx: Ctx, sx: (x: number) => number, sy: (y: number) => number, m: number) {
    for (const p of this.items) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = k * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), p.size * m * (0.6 + 0.6 * (1 - k)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

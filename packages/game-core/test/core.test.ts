import { describe, expect, it } from "vitest";
import { defaultConfig, InputRecorder, NO_UPGRADES, parseGameConfig, replay, Sim, Terrain, INPUT_GAS, INPUT_BRAKE } from "../src";

function scriptedMask(tick: number): number {
  const phase = Math.floor(tick / 90) % 7;
  if (phase === 3) return INPUT_BRAKE;
  if (phase === 5) return 0;
  return INPUT_GAS;
}

function playScripted(seed: number, ticks: number) {
  const sim = new Sim(seed, defaultConfig, NO_UPGRADES);
  const rec = new InputRecorder();
  while (!sim.finished && sim.tick < ticks) {
    const mask = scriptedMask(sim.tick);
    rec.record(sim.tick, mask);
    sim.step(mask);
  }
  return { sim, rec };
}

describe("config", () => {
  it("default config is valid", () => {
    expect(() => parseGameConfig(defaultConfig)).not.toThrow();
  });
});

describe("terrain", () => {
  it("is identical for the same seed", () => {
    const a = new Terrain(42, defaultConfig);
    const b = new Terrain(42, defaultConfig);
    for (let x = 0; x < 3000; x += 7.3) expect(a.sample(x)).toEqual(b.sample(x));
  });

  it("does not depend on generation order", () => {
    const a = new Terrain(7, defaultConfig);
    const b = new Terrain(7, defaultConfig);
    b.sample(5000);
    for (let x = 0; x < 5000; x += 11.1) expect(a.sample(x).h).toBe(b.sample(x).h);
  });

  it("keeps slopes under the configured maximum", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const t = new Terrain(seed, defaultConfig);
      let max = 0;
      for (let x = 0; x < 6000; x += 0.5) max = Math.max(max, Math.abs(t.sample(x).slope));
      expect(max).toBeLessThanOrEqual(defaultConfig.terrain.slopeMax);
    }
  });
});

describe("simulation", () => {
  it("moves forward on full throttle", () => {
    const sim = new Sim(3, defaultConfig, NO_UPGRADES);
    for (let i = 0; i < 120 * 5 && !sim.finished; i++) sim.step(INPUT_GAS);
    expect(sim.distance).toBeGreaterThan(20);
  });

  it("is deterministic and replayable", () => {
    for (const seed of [5, 77, 2024]) {
      const { sim, rec } = playScripted(seed, 120 * 60);
      const result = replay(seed, defaultConfig, NO_UPGRADES, rec.events, sim.tick);
      expect(result.distance).toBe(sim.distance);
      expect(result.coins).toBe(sim.coins);
      expect(result.ticks).toBe(sim.tick);
    }
  });

  it("detects forged inputs", () => {
    const { sim, rec } = playScripted(11, 120 * 40);
    const forged = rec.events.filter(([, m]) => m !== INPUT_BRAKE);
    const result = replay(11, defaultConfig, NO_UPGRADES, forged, sim.tick);
    expect(result.distance === sim.distance && result.coins === sim.coins).toBe(false);
  });
});

describe("kubernetes game-config ConfigMap", () => {
  it("ships a valid config equal to the code defaults", async () => {
    const { readFileSync } = await import("node:fs");
    const { parse } = await import("yaml");
    const manifest = parse(readFileSync(new URL("../../../k8s/20-configmap-game.yaml", import.meta.url), "utf8"));
    const config = parseGameConfig(JSON.parse(manifest.data["game.json"]));
    expect(config).toEqual(defaultConfig);
  });
});

describe("post-crash coasting", () => {
  it("keeps moving the wreck without changing the result", () => {
    const sim = new Sim(9, defaultConfig, NO_UPGRADES);
    while (!sim.finished && sim.tick < 120 * 120) sim.step(INPUT_GAS);
    const before = { distance: sim.distance, coins: sim.coins, tick: sim.tick, reason: sim.reason };
    const x = sim.chassis.x;
    for (let i = 0; i < 240; i++) sim.coast();
    expect({ distance: sim.distance, coins: sim.coins, tick: sim.tick, reason: sim.reason }).toEqual(before);
    expect(sim.chassis.x).not.toBe(x);
  });
});

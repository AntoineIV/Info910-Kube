import { z } from "zod";

const upgradeSchema = z.object({
  label: z.string(),
  prices: z.array(z.number().int().nonnegative()).max(10),
  perLevel: z.number(),
});

const biomeSchema = z.object({
  name: z.string(),
  from: z.number().nonnegative(),
  grip: z.number().positive(),
  sky: z.tuple([z.string(), z.string()]),
  hills: z.string(),
  ground: z.string(),
  surface: z.string(),
});

export const gameConfigSchema = z.object({
  physics: z.object({
    gravity: z.number().positive(),
    engineTorque: z.number().positive(),
    maxWheelSpeed: z.number().positive(),
    brakeTorque: z.number().positive(),
    reverseTorque: z.number().nonnegative(),
    airTorque: z.number().nonnegative(),
    grip: z.number().positive(),
    suspensionStiffness: z.number().positive(),
    suspensionDamping: z.number().nonnegative(),
  }),
  fuel: z.object({
    capacity: z.number().positive(),
    burnPerSecond: z.number().nonnegative(),
    burnGasPerSecond: z.number().nonnegative(),
    canSpacing: z.number().positive(),
    canSpacingGrowth: z.number().nonnegative(),
  }),
  terrain: z.object({
    flatStart: z.number().nonnegative(),
    rampDistance: z.number().positive(),
    segmentMax: z.number().positive(),
    segmentMin: z.number().positive(),
    amplitudeMin: z.number().nonnegative(),
    amplitudeMax: z.number().nonnegative(),
    slopeMin: z.number().positive(),
    slopeMax: z.number().positive().max(1.2),
  }),
  coins: z.object({
    rowChance: z.number().min(0).max(1),
    rowLength: z.number().int().positive(),
    valueStep: z.number().positive(),
  }),
  upgrades: z.object({
    engine: upgradeSchema,
    tires: upgradeSchema,
    suspension: upgradeSchema,
    tank: upgradeSchema,
  }),
  biomes: z.array(biomeSchema).min(1),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;
export type UpgradeKind = keyof GameConfig["upgrades"];
export const UPGRADE_KINDS: UpgradeKind[] = ["engine", "tires", "suspension", "tank"];
export type UpgradeLevels = Record<UpgradeKind, number>;
export const NO_UPGRADES: UpgradeLevels = { engine: 0, tires: 0, suspension: 0, tank: 0 };

export function parseGameConfig(input: unknown): GameConfig {
  return gameConfigSchema.parse(input);
}

export const defaultConfig: GameConfig = {
  physics: {
    gravity: 9.81,
    engineTorque: 420,
    maxWheelSpeed: 42,
    brakeTorque: 600,
    reverseTorque: 220,
    airTorque: 2600,
    grip: 1.1,
    suspensionStiffness: 6500,
    suspensionDamping: 520,
  },
  fuel: {
    capacity: 100,
    burnPerSecond: 1.2,
    burnGasPerSecond: 3.2,
    canSpacing: 220,
    canSpacingGrowth: 0.12,
  },
  terrain: {
    flatStart: 30,
    rampDistance: 2500,
    segmentMax: 34,
    segmentMin: 13,
    amplitudeMin: 1.5,
    amplitudeMax: 11,
    slopeMin: 0.3,
    slopeMax: 0.95,
  },
  coins: { rowChance: 0.35, rowLength: 5, valueStep: 400 },
  upgrades: {
    engine: { label: "Engine", prices: [40, 90, 180, 320, 520], perLevel: 0.14 },
    tires: { label: "Tires", prices: [30, 70, 140, 260, 420], perLevel: 0.08 },
    suspension: { label: "Suspension", prices: [30, 70, 140, 260, 420], perLevel: 0.1 },
    tank: { label: "Fuel tank", prices: [50, 110, 210, 360, 560], perLevel: 0.2 },
  },
  biomes: [
    { name: "Meadow", from: 0, grip: 1, sky: ["#8fd3ff", "#e8f7ff"], hills: "#7fbf7a", ground: "#6b4a2b", surface: "#4caf50" },
    { name: "Desert", from: 800, grip: 0.92, sky: ["#ffc98b", "#fff1d6"], hills: "#e0b070", ground: "#b07a3e", surface: "#e8c170" },
    { name: "Tundra", from: 1800, grip: 0.8, sky: ["#b7c9e8", "#f1f5fb"], hills: "#cfd9e6", ground: "#5d6b7a", surface: "#f4f8fc" },
    { name: "Dusk", from: 3200, grip: 1, sky: ["#3b2a5c", "#d9707a"], hills: "#4c3866", ground: "#2b1f3a", surface: "#9b6fd1" },
  ],
};

export function upgradeFactor(config: GameConfig, levels: UpgradeLevels, kind: UpgradeKind): number {
  return 1 + config.upgrades[kind].perLevel * levels[kind];
}

export function biomeAt(config: GameConfig, x: number) {
  let current = config.biomes[0];
  for (const b of config.biomes) if (x >= b.from) current = b;
  return current;
}

import { z } from "zod";

const upgradeSchema = z.object({
  label: z.string(),
  prices: z.array(z.number().int().nonnegative()).max(10),
  perLevel: z.number(),
});

export const PROP_KINDS = ["tree", "bush", "flower", "cactus", "rock", "deadTree", "pine", "snowman", "lavaRock", "crystal", "mushroom"] as const;

const biomeSchema = z.object({
  name: z.string(),
  from: z.number().nonnegative(),
  grip: z.number().positive(),
  sky: z.tuple([z.string(), z.string()]),
  far: z.string().default("#9cc7c9"),
  farShape: z.enum(["rolling", "peaks", "mesas"]).default("rolling"),
  hills: z.string(),
  ground: z.string(),
  surface: z.string(),
  cloud: z.string().default("#ffffff"),
  celestial: z.enum(["sun", "moon", "none"]).default("sun"),
  stars: z.boolean().default(false),
  landmark: z.enum(["none", "volcano", "aurora"]).default("none"),
  props: z.array(z.enum(PROP_KINDS)).default([]),
  propDensity: z.number().min(0).max(1).default(0.4),
  detail: z.enum(["grass", "sand", "snow", "ash", "moss"]).default("grass"),
  weather: z.enum(["none", "pollen", "dust", "snow", "embers", "fireflies"]).default("none"),
});

export const gameConfigSchema = z.object({
  physics: z.object({
    gravity: z.number().positive(),
    engineTorque: z.number().positive(),
    maxWheelSpeed: z.number().positive(),
    brakeTorque: z.number().positive(),
    reverseTorque: z.number().nonnegative(),
    airSpinSpeed: z.number().nonnegative().default(3.4),
    airResponse: z.number().positive().default(5),
    airDamping: z.number().nonnegative().default(3.5),
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
export type Biome = GameConfig["biomes"][number];
export type PropKind = (typeof PROP_KINDS)[number];
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
    airSpinSpeed: 3.4,
    airResponse: 5,
    airDamping: 3.5,
    grip: 1.1,
    suspensionStiffness: 6500,
    suspensionDamping: 520,
  },
  fuel: {
    capacity: 100,
    burnPerSecond: 1.2,
    burnGasPerSecond: 3.2,
    canSpacing: 180,
    canSpacingGrowth: 0.15,
  },
  terrain: {
    flatStart: 15,
    rampDistance: 1500,
    segmentMax: 24,
    segmentMin: 10,
    amplitudeMin: 3.5,
    amplitudeMax: 14,
    slopeMin: 0.55,
    slopeMax: 1.05,
  },
  coins: { rowChance: 0.35, rowLength: 5, valueStep: 400 },
  upgrades: {
    engine: { label: "Engine", prices: [40, 90, 180, 320, 520], perLevel: 0.14 },
    tires: { label: "Tires", prices: [30, 70, 140, 260, 420], perLevel: 0.08 },
    suspension: { label: "Suspension", prices: [30, 70, 140, 260, 420], perLevel: 0.1 },
    tank: { label: "Fuel tank", prices: [50, 110, 210, 360, 560], perLevel: 0.2 },
  },
  biomes: [
    {
      name: "Meadow", from: 0, grip: 1,
      sky: ["#6cc0ff", "#e6f7ff"], far: "#a3c9cf", farShape: "rolling",
      hills: "#86c47c", ground: "#6b4a2b", surface: "#5cbf4a", cloud: "#ffffff",
      celestial: "sun", stars: false, landmark: "none",
      props: ["tree", "tree", "bush", "flower", "flower"], propDensity: 0.6, detail: "grass", weather: "pollen",
    },
    {
      name: "Desert", from: 500, grip: 0.92,
      sky: ["#f39c4f", "#ffe9c4"], far: "#d99a5e", farShape: "mesas",
      hills: "#e7b676", ground: "#b5733c", surface: "#f2c97a", cloud: "#fff3df",
      celestial: "sun", stars: false, landmark: "none",
      props: ["cactus", "cactus", "rock", "deadTree"], propDensity: 0.35, detail: "sand", weather: "dust",
    },
    {
      name: "Tundra", from: 1100, grip: 0.8,
      sky: ["#1f3a66", "#9fc3e6"], far: "#b9cbe3", farShape: "peaks",
      hills: "#d5e2f0", ground: "#4d5d72", surface: "#f7fbff", cloud: "#dfe9f5",
      celestial: "none", stars: true, landmark: "aurora",
      props: ["pine", "pine", "pine", "snowman", "rock"], propDensity: 0.55, detail: "snow", weather: "snow",
    },
    {
      name: "Volcano", from: 1800, grip: 1.05,
      sky: ["#2a0f12", "#d4552a"], far: "#3e1a1c", farShape: "peaks",
      hills: "#55261f", ground: "#241615", surface: "#4e3d39", cloud: "#5b4646",
      celestial: "none", stars: false, landmark: "volcano",
      props: ["lavaRock", "lavaRock", "deadTree", "rock"], propDensity: 0.4, detail: "ash", weather: "embers",
    },
    {
      name: "Dusk", from: 2600, grip: 1,
      sky: ["#171338", "#c96a86"], far: "#3a2a5c", farShape: "peaks",
      hills: "#4a3565", ground: "#211637", surface: "#9b6fd1", cloud: "#b88bb4",
      celestial: "moon", stars: true, landmark: "none",
      props: ["crystal", "mushroom", "mushroom", "crystal"], propDensity: 0.5, detail: "moss", weather: "fireflies",
    },
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

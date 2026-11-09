import { index, integer, jsonb, pgEnum, pgTable, real, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  coins: integer("coins").notNull().default(0),
  engine: integer("engine").notNull().default(0),
  tires: integer("tires").notNull().default(0),
  suspension: integer("suspension").notNull().default(0),
  tank: integer("tank").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameConfigs = pgTable("game_configs", {
  hash: text("hash").primaryKey(),
  body: jsonb("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runStatus = pgEnum("run_status", ["started", "pending", "verified", "rejected"]);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
    configHash: text("config_hash").notNull().references(() => gameConfigs.hash),
    upgrades: jsonb("upgrades").notNull(),
    status: runStatus("status").notNull().default("started"),
    events: jsonb("events"),
    endTick: integer("end_tick"),
    claimedDistance: integer("claimed_distance"),
    claimedCoins: integer("claimed_coins"),
    distance: integer("distance"),
    coins: integer("coins"),
    rejectReason: text("reject_reason"),
    verifiedBy: text("verified_by"),
    verifyMs: real("verify_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [index("runs_status_idx").on(t.status, t.finishedAt), index("runs_user_idx").on(t.userId, t.distance)],
);

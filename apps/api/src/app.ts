import { randomInt } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { runs, users, type Db } from "@talus/db";
import { inputEventsSchema, MAX_TICKS, type UpgradeKind, type UpgradeLevels } from "@talus/game-core";
import { hashPassword, sessionAuth, verifyPassword, type AuthEnv } from "./auth";
import type { ConfigStore } from "./config-store";

const credentialsSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_-]{3,20}$/),
  password: z.string().min(6).max(100),
});

const finishSchema = z.object({
  endTick: z.number().int().positive().max(MAX_TICKS),
  events: inputEventsSchema,
  distance: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(),
});

const buySchema = z.object({ kind: z.enum(["engine", "tires", "suspension", "tank"]) });

type UserRow = typeof users.$inferSelect;

function levelsOf(u: UserRow): UpgradeLevels {
  return { engine: u.engine, tires: u.tires, suspension: u.suspension, tank: u.tank };
}

export interface AppDeps {
  db: Db;
  configs: ConfigStore;
  sessionSecret: string;
  podName: string;
}

export function createApp({ db, configs, sessionSecret, podName }: AppDeps) {
  const auth = sessionAuth(sessionSecret);
  const api = new Hono<AuthEnv>();

  api.use(async (c, next) => {
    await next();
    c.header("X-Served-By", podName);
  });

  const activeConfig = () => {
    if (!configs.current) throw new Error("config not loaded");
    return configs.current;
  };

  const profile = async (userId: number) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (!u) return null;
    const [best] = await db
      .select({ best: sql<number>`coalesce(max(${runs.distance}), 0)` })
      .from(runs)
      .where(and(eq(runs.userId, userId), eq(runs.status, "verified")));
    return { username: u.username, coins: u.coins, upgrades: levelsOf(u), best: Number(best?.best ?? 0) };
  };

  api.get("/config", (c) => {
    const { hash, config } = activeConfig();
    return c.json({ hash, config, servedBy: podName });
  });

  api.post("/auth/register", async (c) => {
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_credentials_format" }, 400);
    const { username, password } = parsed.data;
    const passwordHash = await hashPassword(password);
    const inserted = await db.insert(users).values({ username, passwordHash }).onConflictDoNothing().returning({ id: users.id });
    if (inserted.length === 0) return c.json({ error: "username_taken" }, 409);
    await auth.issue(c, inserted[0].id);
    return c.json(await profile(inserted[0].id), 201);
  });

  api.post("/auth/login", async (c) => {
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_credentials" }, 401);
    const [u] = await db.select().from(users).where(eq(users.username, parsed.data.username));
    if (!u || !(await verifyPassword(parsed.data.password, u.passwordHash))) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    await auth.issue(c, u.id);
    return c.json(await profile(u.id));
  });

  api.post("/auth/logout", (c) => {
    auth.clear(c);
    return c.json({ ok: true });
  });

  api.get("/me", auth.required, async (c) => {
    const p = await profile(c.get("userId"));
    if (!p) return c.json({ error: "not_authenticated" }, 401);
    return c.json(p);
  });

  api.post("/runs", auth.required, async (c) => {
    const userId = c.get("userId");
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (!u) return c.json({ error: "not_authenticated" }, 401);
    const { hash } = activeConfig();
    const [run] = await db
      .insert(runs)
      .values({ userId, seed: randomInt(1, 2 ** 31 - 1), configHash: hash, upgrades: levelsOf(u) })
      .returning({ id: runs.id, seed: runs.seed, configHash: runs.configHash, upgrades: runs.upgrades });
    return c.json(run, 201);
  });

  api.post("/runs/:id/finish", auth.required, async (c) => {
    const parsed = finishSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_run" }, 400);
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return c.json({ error: "not_found" }, 404);
    const updated = await db
      .update(runs)
      .set({
        status: "pending",
        events: parsed.data.events,
        endTick: parsed.data.endTick,
        claimedDistance: parsed.data.distance,
        claimedCoins: parsed.data.coins,
        finishedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.userId, c.get("userId")), eq(runs.status, "started")))
      .returning({ id: runs.id, status: runs.status });
    if (updated.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json(updated[0], 202);
  });

  api.get("/runs/stats", async (c) => {
    const byStatus = await db.select({ status: runs.status, count: sql<number>`count(*)::int` }).from(runs).groupBy(runs.status);
    const byVerifier = await db
      .select({ pod: runs.verifiedBy, count: sql<number>`count(*)::int` })
      .from(runs)
      .where(sql`${runs.verifiedBy} is not null`)
      .groupBy(runs.verifiedBy);
    return c.json({ byStatus, byVerifier });
  });

  api.get("/runs/:id", auth.required, async (c) => {
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return c.json({ error: "not_found" }, 404);
    const [run] = await db
      .select({
        id: runs.id,
        status: runs.status,
        distance: runs.distance,
        coins: runs.coins,
        claimedDistance: runs.claimedDistance,
        claimedCoins: runs.claimedCoins,
        rejectReason: runs.rejectReason,
        verifiedBy: runs.verifiedBy,
      })
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.userId, c.get("userId"))));
    if (!run) return c.json({ error: "not_found" }, 404);
    return c.json(run);
  });

  api.get("/leaderboard", async (c) => {
    const best = sql<number>`max(${runs.distance})`;
    const rows = await db
      .select({ username: users.username, distance: best })
      .from(runs)
      .innerJoin(users, eq(users.id, runs.userId))
      .where(eq(runs.status, "verified"))
      .groupBy(users.username)
      .orderBy(desc(best))
      .limit(20);
    return c.json(rows.map((r) => ({ username: r.username, distance: Number(r.distance) })));
  });

  api.post("/shop/buy", auth.required, async (c) => {
    const parsed = buySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_upgrade" }, 400);
    const kind: UpgradeKind = parsed.data.kind;
    const userId = c.get("userId");
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (!u) return c.json({ error: "not_authenticated" }, 401);
    const level = u[kind];
    const price = activeConfig().config.upgrades[kind].prices[level];
    if (price === undefined) return c.json({ error: "max_level" }, 409);
    const column = users[kind];
    const updated = await db
      .update(users)
      .set({ coins: sql`${users.coins} - ${price}`, [kind]: sql`${column} + 1` })
      .where(and(eq(users.id, userId), eq(column, level), sql`${users.coins} >= ${price}`))
      .returning({ id: users.id });
    if (updated.length === 0) return c.json({ error: "not_enough_coins" }, 409);
    return c.json(await profile(userId));
  });

  api.onError((err, c) => {
    const detail = `${err.message} ${err.cause instanceof Error ? err.cause.message : ""}`;
    const unavailable = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timeout|terminat|Connection/i.test(detail);
    console.error(`[api] ${c.req.method} ${c.req.path} failed: ${detail.split("\n")[0]}`);
    return c.json({ error: unavailable ? "service_unavailable" : "internal_error" }, unavailable ? 503 : 500);
  });

  const app = new Hono();
  app.route("/api", api);
  return app;
}


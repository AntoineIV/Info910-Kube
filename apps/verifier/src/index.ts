import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { eq, sql } from "drizzle-orm";
import { createDb, gameConfigs, runs, users } from "@talus/db";
import { inputEventsSchema, NO_UPGRADES, parseGameConfig, replay, type GameConfig, type UpgradeLevels } from "@talus/game-core";

const podName = process.env.POD_NAME ?? "local";
const heartbeatFile = process.env.HEARTBEAT_FILE ?? "/tmp/talus-heartbeat";
const idleMs = Number(process.env.POLL_IDLE_MS ?? 1000);
const distanceTolerance = Number(process.env.DISTANCE_TOLERANCE ?? 0);

const { db, pool } = createDb();
const configCache = new Map<string, GameConfig>();
let stopping = false;

mkdirSync(dirname(heartbeatFile), { recursive: true });
const beat = () => writeFileSync(heartbeatFile, String(Date.now()));

async function configFor(hash: string): Promise<GameConfig> {
  const cached = configCache.get(hash);
  if (cached) return cached;
  const [row] = await db.select().from(gameConfigs).where(eq(gameConfigs.hash, hash));
  if (!row) throw new Error(`unknown config ${hash}`);
  const config = parseGameConfig(row.body);
  configCache.set(hash, config);
  return config;
}

async function verifyOne(): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(runs)
      .where(eq(runs.status, "pending"))
      .orderBy(runs.finishedAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!run) return false;

    const started = performance.now();
    let verdict: { ok: boolean; distance: number; coins: number; reason: string | null };
    try {
      const events = inputEventsSchema.parse(run.events);
      const config = await configFor(run.configHash);
      const upgrades = { ...NO_UPGRADES, ...(run.upgrades as Partial<UpgradeLevels>) };
      const result = replay(run.seed, config, upgrades, events, run.endTick ?? 0);
      const distanceOk = Math.abs(result.distance - (run.claimedDistance ?? -1)) <= distanceTolerance;
      const coinsOk = result.coins === run.claimedCoins;
      verdict = {
        ok: distanceOk && coinsOk,
        distance: result.distance,
        coins: result.coins,
        reason: distanceOk && coinsOk ? null : `claimed ${run.claimedDistance} m / ${run.claimedCoins} coins, replay gave ${result.distance} m / ${result.coins} coins`,
      };
    } catch (err) {
      verdict = { ok: false, distance: 0, coins: 0, reason: `invalid run: ${err instanceof Error ? err.message : err}` };
    }
    const verifyMs = performance.now() - started;

    await tx
      .update(runs)
      .set({
        status: verdict.ok ? "verified" : "rejected",
        distance: verdict.ok ? verdict.distance : null,
        coins: verdict.ok ? verdict.coins : null,
        rejectReason: verdict.reason,
        verifiedBy: podName,
        verifyMs,
        verifiedAt: new Date(),
      })
      .where(eq(runs.id, run.id));
    if (verdict.ok && verdict.coins > 0) {
      await tx.update(users).set({ coins: sql`${users.coins} + ${verdict.coins}` }).where(eq(users.id, run.userId));
    }
    console.log(`[verifier] ${podName} run ${run.id}: ${verdict.ok ? "VERIFIED" : "REJECTED"} ${verdict.distance} m, ${verdict.coins} coins (${verifyMs.toFixed(0)} ms)${verdict.reason ? ` - ${verdict.reason}` : ""}`);
    return true;
  });
}

async function loop(): Promise<void> {
  console.log(`[verifier] ${podName} started`);
  while (!stopping) {
    beat();
    let worked = false;
    try {
      worked = await verifyOne();
    } catch (err) {
      console.error(`[verifier] ${err instanceof Error ? err.message : err}`);
    }
    if (!worked) await new Promise((r) => setTimeout(r, idleMs));
  }
  await pool.end();
  console.log("[verifier] stopped");
}

process.on("SIGTERM", () => {
  stopping = true;
});

void loop();

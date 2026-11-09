import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createDb, migrateWithLock, ping } from "@talus/db";
import { createApp } from "./app";
import { ConfigStore } from "./config-store";

const port = Number(process.env.PORT ?? 3000);
const podName = process.env.POD_NAME ?? "local";
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 16) {
  console.error("SESSION_SECRET must be set (at least 16 characters)");
  process.exit(1);
}
const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

const { db, pool } = createDb();
const configs = new ConfigStore(db, process.env.CONFIG_PATH);
const state = { started: false, shuttingDown: false };

const root = new Hono();
root.get("/healthz/startup", (c) => (state.started ? c.text("started") : c.text("starting", 503)));
root.get("/healthz/live", (c) => c.text("alive"));
root.get("/healthz/ready", async (c) => {
  if (!state.started || state.shuttingDown) return c.text("not ready", 503);
  if (!(await ping(pool))) return c.text("database unreachable", 503);
  return c.json({ ready: true, config: configs.current?.hash, configError: configs.lastError });
});
root.route("/", createApp({ db, configs, sessionSecret, podName }));

const server = serve({ fetch: root.fetch, port }, () => console.log(`[api] ${podName} listening on :${port}`));

async function boot(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrateWithLock(db, pool, migrationsFolder);
      await configs.load();
      configs.watch(Number(process.env.CONFIG_RELOAD_MS ?? 5000));
      state.started = true;
      console.log("[api] migrations applied, config loaded: startup complete");
      return;
    } catch (err) {
      console.error(`[api] boot attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`);
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
    }
  }
}

process.on("SIGTERM", () => {
  console.log("[api] SIGTERM: draining");
  state.shuttingDown = true;
  setTimeout(() => {
    server.close();
    pool.end().finally(() => process.exit(0));
  }, Number(process.env.DRAIN_MS ?? 5000)).unref();
});

void boot();

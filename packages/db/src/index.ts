import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";

export * from "./schema";
export { schema };

const MIGRATION_LOCK = 910_2026;

export function connectionConfig(env: NodeJS.ProcessEnv = process.env): pg.PoolConfig {
  return {
    host: env.DATABASE_HOST ?? "localhost",
    port: Number(env.DATABASE_PORT ?? 5432),
    database: env.DATABASE_NAME ?? "talus",
    user: env.DATABASE_USER ?? "talus",
    password: env.DATABASE_PASSWORD ?? "talus",
    max: Number(env.DATABASE_POOL_SIZE ?? 5),
    connectionTimeoutMillis: 3000,
  };
}

export function createDb(config: pg.PoolConfig = connectionConfig()) {
  const pool = new pg.Pool(config);
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];

export async function migrateWithLock(db: Db, pool: pg.Pool, migrationsFolder: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}

export async function ping(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gameConfigs, type Db } from "@talus/db";
import { defaultConfig, parseGameConfig, type GameConfig } from "@talus/game-core";

export interface LoadedConfig {
  hash: string;
  config: GameConfig;
  loadedAt: Date;
}

export class ConfigStore {
  current: LoadedConfig | null = null;
  lastError: string | null = null;
  private lastRaw = "";

  constructor(
    private readonly db: Db,
    private readonly path: string | undefined,
  ) {}

  async load(): Promise<void> {
    const raw = this.path ? await readFile(this.path, "utf8") : JSON.stringify(defaultConfig);
    if (raw === this.lastRaw && this.current) return;
    try {
      const config = parseGameConfig(JSON.parse(raw));
      const body = JSON.stringify(config);
      const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
      await this.db.insert(gameConfigs).values({ hash, body: config }).onConflictDoNothing();
      const changed = this.current?.hash !== hash;
      this.current = { hash, config, loadedAt: new Date() };
      this.lastError = null;
      this.lastRaw = raw;
      if (changed) console.log(`[config] active game config ${hash} (gravity=${config.physics.gravity})`);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.lastRaw = raw;
      console.error(`[config] rejected config file, keeping ${this.current?.hash ?? "none"}: ${this.lastError}`);
      if (!this.current) throw err;
    }
  }

  watch(intervalMs: number): void {
    setInterval(() => {
      this.load().catch(() => {});
    }, intervalMs).unref();
  }
}

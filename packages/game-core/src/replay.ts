import { z } from "zod";
import type { GameConfig, UpgradeLevels } from "./config";
import { MAX_TICKS, Sim, type EndReason } from "./sim";

export const inputEventsSchema = z
  .array(z.tuple([z.number().int().nonnegative(), z.number().int().min(0).max(3)]))
  .max(20000);

export type InputEvent = z.infer<typeof inputEventsSchema>[number];

export class InputRecorder {
  readonly events: InputEvent[] = [];
  private last = 0;

  record(tick: number, mask: number): void {
    if (mask === this.last) return;
    this.events.push([tick, mask]);
    this.last = mask;
  }
}

export interface RunResult {
  distance: number;
  coins: number;
  ticks: number;
  reason: EndReason | "abandoned";
}

export function replay(
  seed: number,
  config: GameConfig,
  upgrades: UpgradeLevels,
  events: InputEvent[],
  endTick: number,
): RunResult {
  const sim = new Sim(seed, config, upgrades);
  const limit = Math.min(endTick, MAX_TICKS);
  let mask = 0;
  let next = 0;
  while (!sim.finished && sim.tick < limit) {
    while (next < events.length && events[next][0] <= sim.tick) {
      mask = events[next][1];
      next++;
    }
    sim.step(mask);
  }
  return {
    distance: sim.distance,
    coins: sim.coins,
    ticks: sim.tick,
    reason: sim.reason ?? "abandoned",
  };
}

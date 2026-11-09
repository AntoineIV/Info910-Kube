import { biomeAt, InputRecorder, INPUT_BRAKE, INPUT_GAS, NO_UPGRADES, Sim, TICK_RATE } from "@talus/game-core";
import { api, type RunTicket } from "../api";
import { useStore, type LastRun } from "../store";
import { Renderer, snapshot, type Snapshot } from "./render";

const STEP = 1 / TICK_RATE;
const REASONS: Record<string, string> = {
  crash: "Head over heels!",
  fuel: "Out of fuel",
  timeout: "Time is up",
  abandoned: "Run abandoned",
};

export class Runner {
  private readonly renderer: Renderer;
  private sim: Sim | null = null;
  private recorder = new InputRecorder();
  private ticket: RunTicket | null = null;
  private nextTicket: Promise<RunTicket | null> | null = null;
  private keys = new Set<string>();
  private acc = 0;
  private last = 0;
  private frame = 0;
  private starting = false;
  private finishedHandled = false;
  private prev: Snapshot | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
  }

  mount(): () => void {
    const down = (e: KeyboardEvent) => this.onKey(e, true);
    const up = (e: KeyboardEvent) => this.onKey(e, false);
    const blur = () => this.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    void this.restart();
    this.frame = requestAnimationFrame(this.loop);
    return () => {
      cancelAnimationFrame(this.frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }

  private onKey(e: KeyboardEvent, pressed: boolean) {
    if (e.target instanceof HTMLInputElement) return;
    const key = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) e.preventDefault();
    if (pressed && (key === "r" || key === " " || key === "enter") && !e.repeat) {
      if (useStore.getState().panel) return;
      void this.restart();
      return;
    }
    if (pressed) this.keys.add(key);
    else this.keys.delete(key);
  }

  private mask(): number {
    let m = 0;
    if (this.keys.has("arrowright") || this.keys.has("d")) m |= INPUT_GAS;
    if (this.keys.has("arrowleft") || this.keys.has("a")) m |= INPUT_BRAKE;
    return m;
  }

  private fetchTicket(): Promise<RunTicket | null> {
    if (!useStore.getState().user) return Promise.resolve(null);
    return api.startRun().catch(() => null);
  }

  async restart(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
      if (this.sim && !this.sim.finished && this.sim.tick > TICK_RATE) this.finish("abandoned");
      const store = useStore.getState();
      let ticket = store.user ? ((await this.nextTicket) ?? (await this.fetchTicket())) : null;
      this.nextTicket = this.fetchTicket();
      if (ticket && ticket.configHash !== useStore.getState().configHash) await useStore.getState().loadConfig();
      if (ticket && ticket.configHash !== useStore.getState().configHash) ticket = null;
      const { config } = useStore.getState();
      const seed = ticket?.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff);
      this.ticket = ticket;
      this.sim = new Sim(seed, config, ticket?.upgrades ?? store.user?.upgrades ?? NO_UPGRADES);
      this.recorder = new InputRecorder();
      this.finishedHandled = false;
      this.acc = 0;
      const jump = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("x")) : 0;
      if (jump > 0) this.teleport(jump);
      this.prev = snapshot(this.sim);
      useStore.getState().setLastRun(null);
    } finally {
      this.starting = false;
    }
  }

  private teleport(x: number) {
    const sim = this.sim!;
    const dx = x - sim.chassis.x;
    const dy = sim.terrain.sample(x).h + 0.3 - sim.terrain.sample(sim.chassis.x).h;
    sim.terrain.ensure(x + 60);
    sim.chassis.x += dx;
    sim.chassis.y += dy;
    for (const w of sim.wheels) {
      w.x += dx;
      w.y += dy;
    }
  }

  private loop = (now: number) => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    const sim = this.sim;
    if (!sim) return;
    const paused = useStore.getState().panel !== null;
    if (!paused && !sim.finished) {
      this.acc += dt;
      while (this.acc >= STEP && !sim.finished) {
        const m = this.mask();
        this.recorder.record(sim.tick, m);
        this.prev = snapshot(sim);
        sim.step(m);
        this.acc -= STEP;
      }
    }
    if (sim.finished && !this.finishedHandled) this.finish(sim.reason ?? "crash");
    const alpha = sim.finished ? 1 : Math.min(1, this.acc / STEP);
    this.renderer.draw(sim, this.prev ?? snapshot(sim), alpha, now / 1000, dt);
    const hud = useStore.getState().hud;
    const fuel = sim.fuel / sim.fuelCapacity;
    const biome = biomeAt(sim.config, sim.chassis.x).name;
    if (hud.distance !== sim.distance || hud.coins !== sim.coins || Math.abs(hud.fuel - fuel) > 0.005 || hud.biome !== biome) {
      useStore.getState().setHud({ distance: sim.distance, coins: sim.coins, fuel, biome });
    }
  };

  private finish(reason: string) {
    const sim = this.sim;
    if (!sim || this.finishedHandled) return;
    this.finishedHandled = true;
    const store = useStore.getState();
    const base: LastRun = { distance: sim.distance, coins: sim.coins, reason: REASONS[reason] ?? reason, status: "guest" };
    const ticket = this.ticket;
    if (!ticket || !store.user) {
      store.setLastRun(base);
      return;
    }
    store.setLastRun({ ...base, status: "pending" });
    const payload = { endTick: sim.tick, events: this.recorder.events, distance: sim.distance, coins: sim.coins };
    void this.submit(ticket.id, payload, base);
  }

  private async submit(id: string, payload: Parameters<typeof api.finishRun>[1], base: LastRun) {
    const isCurrent = () => useStore.getState().lastRun?.distance === base.distance;
    try {
      await api.finishRun(id, payload);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 750));
        const run = await api.run(id);
        if (run.status === "verified" || run.status === "rejected") {
          if (isCurrent()) useStore.getState().setLastRun({ ...base, status: run.status, verifiedBy: run.verifiedBy });
          void useStore.getState().refreshMe();
          return;
        }
      }
    } catch {
      if (isCurrent()) useStore.getState().setLastRun({ ...base, status: "offline" });
    }
  }
}

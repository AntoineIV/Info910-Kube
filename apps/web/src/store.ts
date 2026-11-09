import { create } from "zustand";
import { defaultConfig, type GameConfig, type UpgradeKind } from "@talus/game-core";
import { api, ApiError, onServedBy, type Profile } from "./api";

export type Panel = null | "account" | "leaderboard" | "garage";

export interface LastRun {
  distance: number;
  coins: number;
  reason: string;
  status: "guest" | "offline" | "pending" | "verified" | "rejected";
  verifiedBy?: string | null;
  crashed?: boolean;
}

interface Hud {
  distance: number;
  coins: number;
  fuel: number;
  biome: string;
}

interface State {
  config: GameConfig;
  configHash: string | null;
  online: boolean;
  servedBy: string | null;
  user: Profile | null;
  panel: Panel;
  hud: Hud;
  lastRun: LastRun | null;
  leaderboard: { username: string; distance: number }[];
  error: string | null;
  setPanel: (panel: Panel) => void;
  setHud: (hud: Hud) => void;
  setLastRun: (run: LastRun | null) => void;
  loadConfig: () => Promise<void>;
  refreshMe: () => Promise<void>;
  authenticate: (mode: "login" | "register", username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadLeaderboard: () => Promise<void>;
  buy: (kind: UpgradeKind) => Promise<void>;
}

const messages: Record<string, string> = {
  invalid_credentials: "Wrong username or password.",
  invalid_credentials_format: "Username: 3-20 letters, digits, _ or -. Password: 6+ characters.",
  username_taken: "This username is already taken.",
  not_enough_coins: "Not enough coins.",
  max_level: "Already at max level.",
};

function errorText(err: unknown): string {
  if (err instanceof ApiError) return messages[err.code] ?? `Server error (${err.status}).`;
  return "Server unreachable.";
}

export const useStore = create<State>((set, get) => ({
  config: defaultConfig,
  configHash: null,
  online: false,
  servedBy: null,
  user: null,
  panel: null,
  hud: { distance: 0, coins: 0, fuel: 1, biome: defaultConfig.biomes[0].name },
  lastRun: null,
  leaderboard: [],
  error: null,
  setPanel: (panel) => set({ panel, error: null }),
  setHud: (hud) => set({ hud }),
  setLastRun: (lastRun) => set({ lastRun }),
  loadConfig: async () => {
    try {
      const { hash, config } = await api.config();
      set({ config, configHash: hash, online: true });
    } catch {
      set({ online: false });
    }
  },
  refreshMe: async () => {
    try {
      set({ user: await api.me() });
    } catch {
      set({ user: null });
    }
  },
  authenticate: async (mode, username, password) => {
    try {
      const user = mode === "login" ? await api.login(username, password) : await api.register(username, password);
      set({ user, panel: null, error: null });
    } catch (err) {
      set({ error: errorText(err) });
    }
  },
  logout: async () => {
    await api.logout().catch(() => {});
    set({ user: null, panel: null });
  },
  loadLeaderboard: async () => {
    try {
      set({ leaderboard: await api.leaderboard() });
    } catch {
      set({ leaderboard: [] });
    }
  },
  buy: async (kind) => {
    try {
      set({ user: await api.buy(kind), error: null });
    } catch (err) {
      set({ error: errorText(err) });
      void get().refreshMe();
    }
  },
}));

onServedBy((pod) => {
  if (useStore.getState().servedBy !== pod) useStore.setState({ servedBy: pod });
});

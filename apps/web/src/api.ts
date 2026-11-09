import type { GameConfig, InputEvent, UpgradeKind, UpgradeLevels } from "@talus/game-core";

export interface Profile {
  username: string;
  coins: number;
  upgrades: UpgradeLevels;
  best: number;
}

export interface RunTicket {
  id: string;
  seed: number;
  configHash: string;
  upgrades: UpgradeLevels;
}

export interface RunStatus {
  id: string;
  status: "started" | "pending" | "verified" | "rejected";
  distance: number | null;
  coins: number | null;
  rejectReason: string | null;
  verifiedBy: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

let servedByListener: (pod: string) => void = () => {};
export function onServedBy(fn: (pod: string) => void) {
  servedByListener = fn;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const pod = res.headers.get("x-served-by");
  if (pod) servedByListener(pod);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "http_error");
  return data as T;
}

export const api = {
  config: () => request<{ hash: string; config: GameConfig }>("/config"),
  me: () => request<Profile>("/me"),
  login: (username: string, password: string) => request<Profile>("/auth/login", { username, password }),
  register: (username: string, password: string) => request<Profile>("/auth/register", { username, password }),
  logout: () => request<{ ok: true }>("/auth/logout", {}),
  startRun: () => request<RunTicket>("/runs", {}),
  finishRun: (id: string, payload: { endTick: number; events: InputEvent[]; distance: number; coins: number }) =>
    request<{ id: string }>(`/runs/${id}/finish`, payload),
  run: (id: string) => request<RunStatus>(`/runs/${id}`),
  leaderboard: () => request<{ username: string; distance: number }[]>("/leaderboard"),
  buy: (kind: UpgradeKind) => request<Profile>("/shop/buy", { kind }),
};

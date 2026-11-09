import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { UPGRADE_KINDS, type UpgradeKind } from "@talus/game-core";
import { useStore, type Panel } from "../store";
import { Close, Coin, Engine, Fuel, Restart, Spring, Tire, Trophy, User, Wrench } from "./icons";

const TITLES: Record<Exclude<Panel, null>, { title: string; icon: ReactNode }> = {
  account: { title: "Account", icon: <User /> },
  leaderboard: { title: "Leaderboard", icon: <Trophy /> },
  garage: { title: "Garage", icon: <Wrench /> },
};

export function Modal() {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  if (!panel) return null;
  const { title, icon } = TITLES[panel];
  return (
    <div className="backdrop" onMouseDown={() => setPanel(null)}>
      <section className="panel" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <span className="panel-icon">{icon}</span>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={() => setPanel(null)}>
            <Close />
          </button>
        </header>
        <div className="panel-body">
          {panel === "account" && <AccountPanel />}
          {panel === "leaderboard" && <LeaderboardPanel />}
          {panel === "garage" && <GaragePanel />}
        </div>
      </section>
    </div>
  );
}

function AccountPanel() {
  const user = useStore((s) => s.user);
  const error = useStore((s) => s.error);
  const busy = useStore((s) => s.busy);
  const authenticate = useStore((s) => s.authenticate);
  const logout = useStore((s) => s.logout);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    return (
      <div className="profile">
        <div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div>
        <div className="profile-name">{user.username}</div>
        <div className="stats">
          <div>
            <strong>{user.best} m</strong>
            <span>best distance</span>
          </div>
          <div>
            <strong><Coin /> {user.coins}</strong>
            <span>coins</span>
          </div>
          <div>
            <strong>{UPGRADE_KINDS.reduce((n, k) => n + user.upgrades[k], 0)}</strong>
            <span>upgrades</span>
          </div>
        </div>
        <button className="ghost wide" onClick={() => void logout()}>Sign out</button>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void authenticate(mode, username, password);
  };
  return (
    <>
      <div className="tabs">
        <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
        <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button>
      </div>
      <form className="form" onSubmit={submit}>
        <label>
          Username
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3 to 20 letters, digits, _ or -" />
        </label>
        <label>
          Password
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="cta wide" type="submit" disabled={busy || !username || !password}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <p className="muted small">Your runs are replayed by the server before they count. Coins buy upgrades in the Garage.</p>
      </form>
    </>
  );
}

const MEDALS = ["#f4c542", "#c0c7d1", "#d08a4e"];

function LeaderboardPanel() {
  const rows = useStore((s) => s.leaderboard);
  const me = useStore((s) => s.user?.username);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    void useStore.getState().loadLeaderboard().finally(() => setLoading(false));
  };
  useEffect(load, []);
  return (
    <>
      <div className="board-head">
        <span className="muted small">Best verified distance per player</span>
        <button className="icon-btn" aria-label="Refresh" onClick={load}>
          <Restart />
        </button>
      </div>
      {loading && rows.length === 0 && <p className="muted">Loading…</p>}
      {!loading && rows.length === 0 && <p className="muted">No verified run yet. Be the first!</p>}
      <ol className="board">
        {rows.map((r, i) => (
          <li key={r.username} className={r.username === me ? "me" : ""}>
            <span className="rank" style={i < 3 ? { background: MEDALS[i], color: "#1d2a3a" } : undefined}>{i + 1}</span>
            <span className="who">{r.username}{r.username === me && <em> you</em>}</span>
            <strong>{r.distance} m</strong>
          </li>
        ))}
      </ol>
    </>
  );
}

const UPGRADE_UI: Record<UpgradeKind, { icon: ReactNode; effect: string }> = {
  engine: { icon: <Engine />, effect: "engine power" },
  tires: { icon: <Tire />, effect: "grip" },
  suspension: { icon: <Spring />, effect: "suspension stiffness" },
  tank: { icon: <Fuel />, effect: "fuel capacity" },
};

function GaragePanel() {
  const user = useStore((s) => s.user);
  const config = useStore((s) => s.config);
  const error = useStore((s) => s.error);
  const busy = useStore((s) => s.busy);
  const buy = useStore((s) => s.buy);
  const setPanel = useStore((s) => s.setPanel);
  if (!user) {
    return (
      <div className="empty">
        <p>Sign in to upgrade your vehicle with the coins you collect.</p>
        <button className="cta" onClick={() => setPanel("account")}>Sign in</button>
      </div>
    );
  }
  return (
    <>
      <div className="wallet">
        <Coin /> <strong>{user.coins}</strong> coins
        <span className="muted small">Upgrades apply from your next run.</span>
      </div>
      <ul className="garage">
        {UPGRADE_KINDS.map((kind) => {
          const up = config.upgrades[kind];
          const level = user.upgrades[kind];
          const price = up.prices[level];
          const ui = UPGRADE_UI[kind];
          return (
            <li key={kind}>
              <span className="up-icon">{ui.icon}</span>
              <div className="up-info">
                <strong>{up.label}</strong>
                <span className="muted small">+{Math.round(up.perLevel * 100)}% {ui.effect} per level</span>
                <div className="pips">
                  {up.prices.map((_, i) => (
                    <span key={i} className={i < level ? "on" : ""} />
                  ))}
                </div>
              </div>
              {price === undefined ? (
                <span className="maxed">MAX</span>
              ) : (
                <button className="buy" disabled={busy || user.coins < price} onClick={() => void buy(kind)}>
                  <Coin /> {price}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="error">{error}</p>}
    </>
  );
}

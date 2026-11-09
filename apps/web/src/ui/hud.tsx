import { useStore } from "../store";

export function TopBar() {
  const user = useStore((s) => s.user);
  const online = useStore((s) => s.online);
  const servedBy = useStore((s) => s.servedBy);
  const setPanel = useStore((s) => s.setPanel);
  return (
    <header className="topbar">
      <div className="brand">Talus</div>
      <nav>
        <button onClick={() => setPanel("leaderboard")} disabled={!online}>Leaderboard</button>
        <button onClick={() => setPanel("garage")} disabled={!online}>Garage</button>
        <button className="primary" onClick={() => setPanel("account")} disabled={!online}>
          {user ? `${user.username} · ${user.coins} ◉` : "Sign in to save"}
        </button>
      </nav>
      <div className="pod">{online ? `served by ${servedBy ?? "?"}` : "offline: guest mode"}</div>
    </header>
  );
}

export function Hud() {
  const hud = useStore((s) => s.hud);
  const best = useStore((s) => s.user?.best ?? 0);
  return (
    <div className="hud">
      <div className="distance">{hud.distance} m</div>
      <div className="sub">
        <span className="coin">◉ {hud.coins}</span>
        <span>{hud.biome}</span>
        {best > 0 && <span>best {best} m</span>}
      </div>
      <div className={`fuel ${hud.fuel < 0.25 ? "low" : ""}`}>
        <div style={{ width: `${Math.round(hud.fuel * 100)}%` }} />
      </div>
      <div key={hud.biome} className="banner">{hud.biome}</div>
      <div className="keys">→ gas · ← brake · in the air, they tilt · R restart</div>
    </div>
  );
}

const STATUS: Record<string, string> = {
  guest: "Guest run: sign in to save your scores and coins.",
  offline: "Server unreachable: run not saved.",
  pending: "Verifying your run…",
  verified: "Verified ✓ score and coins saved",
  rejected: "Rejected: replay did not match",
};

export function EndCard() {
  const run = useStore((s) => s.lastRun);
  if (!run) return null;
  return (
    <div className="endcard">
      <div className="reason">{run.reason}</div>
      <div className="score">{run.distance} m · ◉ {run.coins}</div>
      <div className={`status ${run.status}`}>
        {STATUS[run.status]}
        {run.verifiedBy && <small> (by {run.verifiedBy})</small>}
      </div>
      <div className="again">Press R or Space to go again</div>
    </div>
  );
}

import { useStore } from "../store";
import { Coin, Fuel, Pause, Restart, Trophy, Wrench } from "./icons";

export function Hud() {
  const hud = useStore((s) => s.hud);
  const best = useStore((s) => s.user?.best ?? 0);
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  if (screen === "title") return null;
  return (
    <>
      <div className="hud">
        <div className="distance">
          {hud.distance}
          <small>m</small>
        </div>
        <div className="hud-row">
          <span className="pill"><Coin /> {hud.coins}</span>
          {best > 0 && <span className="pill muted">best {best} m</span>}
        </div>
        <div className={`fuel ${hud.fuel < 0.25 ? "low" : ""}`}>
          <Fuel width={16} height={16} />
          <div className="bar">
            <div style={{ width: `${Math.round(hud.fuel * 100)}%` }} />
          </div>
        </div>
        <div key={hud.biome} className="banner">{hud.biome}</div>
      </div>
      {screen === "playing" && (
        <button className="icon-btn pause-btn" aria-label="Pause" onClick={() => setScreen("paused")}>
          <Pause />
        </button>
      )}
    </>
  );
}

const STATUS: Record<string, string> = {
  guest: "Guest run: sign in to save it",
  offline: "Server unreachable: not saved",
  pending: "Verifying your run…",
  verified: "Verified: score and coins saved",
  rejected: "Rejected: the replay did not match",
};

export function EndCard() {
  const run = useStore((s) => s.lastRun);
  const screen = useStore((s) => s.screen);
  const restart = useStore((s) => s.restart);
  const setPanel = useStore((s) => s.setPanel);
  const online = useStore((s) => s.online);
  if (!run || screen !== "playing") return null;
  return (
    <div className={`endcard ${run.crashed ? "late" : ""}`}>
      <div className="reason">{run.reason}</div>
      {run.newBest && run.status !== "rejected" && <div className="newbest">New best!</div>}
      <div className="score">
        {run.distance}
        <small>m</small>
      </div>
      <div className="earned"><Coin /> +{run.coins}</div>
      <div className={`status ${run.status}`}>
        <i className="dot" /> {STATUS[run.status]}
        {run.verifiedBy && <small>by {run.verifiedBy}</small>}
      </div>
      <div className="end-actions">
        <button className="cta" onClick={restart}>
          <Restart /> Again <kbd className="keycap">R</kbd>
        </button>
        <button className="ghost" onClick={() => setPanel("garage")} disabled={!online}>
          <Wrench /> Garage
        </button>
        <button className="ghost" onClick={() => setPanel("leaderboard")} disabled={!online}>
          <Trophy /> Ranks
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Runner } from "./game/runner";
import { useStore } from "./store";
import { AccountPanel, GaragePanel, LeaderboardPanel } from "./ui/panels";
import { EndCard, Hud, TopBar } from "./ui/hud";

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const panel = useStore((s) => s.panel);

  useEffect(() => {
    let unmount = () => {};
    let cancelled = false;
    (async () => {
      await Promise.all([useStore.getState().loadConfig(), useStore.getState().refreshMe()]);
      if (cancelled || !canvas.current) return;
      unmount = new Runner(canvas.current).mount();
    })();
    return () => {
      cancelled = true;
      unmount();
    };
  }, []);

  return (
    <div className="app">
      <canvas ref={canvas} className="stage" />
      <TopBar />
      <Hud />
      <EndCard />
      {panel && (
        <div className="backdrop" onClick={() => useStore.getState().setPanel(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            {panel === "account" && <AccountPanel />}
            {panel === "leaderboard" && <LeaderboardPanel />}
            {panel === "garage" && <GaragePanel />}
          </div>
        </div>
      )}
    </div>
  );
}

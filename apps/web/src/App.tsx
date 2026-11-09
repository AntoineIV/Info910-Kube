import { useEffect, useRef } from "react";
import { Runner } from "./game/runner";
import { useStore } from "./store";
import { Hints, KeyGuide } from "./ui/guide";
import { EndCard, Hud } from "./ui/hud";
import { PauseMenu, TitleScreen } from "./ui/menu";
import { Modal } from "./ui/panels";

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const screen = useStore((s) => s.screen);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key.toLowerCase() !== "p") return;
      if (e.key.toLowerCase() === "p" && e.target instanceof HTMLInputElement) return;
      const st = useStore.getState();
      if (st.panel) st.setPanel(null);
      else if (st.screen === "playing") st.setScreen("paused");
      else if (st.screen === "paused") st.setScreen("playing");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app screen-${screen}`}>
      <canvas ref={canvas} className="stage" />
      <Hud />
      <KeyGuide />
      <Hints />
      <EndCard />
      {screen === "title" && <TitleScreen />}
      {screen === "paused" && <PauseMenu />}
      <Modal />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { INPUT_BRAKE, INPUT_GAS } from "@talus/game-core";
import { useStore } from "../store";
import { Coin, Fuel } from "./icons";

const SEEN_KEY = "talus.tutorialRuns";

function BigKey({ label, active = false }: { label: string; active?: boolean }) {
  return <span className={`bigkey ${active ? "active" : ""}`}>{label}</span>;
}

const RotateBack = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" /></svg>
);
const RotateForward = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>
);

export function HowToPlay() {
  return (
    <div className="howto">
      <div className="howto-title">How to play</div>
      <div className="howto-cards">
        <div className="howto-card">
          <BigKey label="→" />
          <strong>GAS</strong>
          <span>Hold to drive forward</span>
        </div>
        <div className="howto-card">
          <BigKey label="←" />
          <strong>BRAKE</strong>
          <span>Slow down, then reverse</span>
        </div>
        <div className="howto-card air">
          <div className="keys-row">
            <span className="rot"><BigKey label="←" /><RotateForward /><em>nose down</em></span>
            <span className="rot"><BigKey label="→" /><RotateBack /><em>nose up</em></span>
          </div>
          <strong>IN THE AIR</strong>
          <span>Same keys rotate the car: land on your wheels!</span>
        </div>
      </div>
      <div className="howto-goal">
        <span>🏁 Drive as far as you can</span>
        <span><Fuel width={18} height={18} /> Grab fuel cans or you will stop</span>
        <span><Coin /> Coins buy upgrades</span>
        <span>💥 Never land on your head</span>
      </div>
      <div className="howto-small">
        <kbd className="keycap">R</kbd> restart instantly · <kbd className="keycap">Esc</kbd> pause
      </div>
    </div>
  );
}

export function KeyGuide() {
  const hud = useStore((s) => s.hud);
  const screen = useStore((s) => s.screen);
  const lastRun = useStore((s) => s.lastRun);
  if (screen !== "playing" || lastRun) return null;
  const air = hud.airborne && hud.started;
  return (
    <div className={`keyguide ${air ? "air" : ""}`}>
      <div className="kg-key">
        <BigKey label="←" active={(hud.mask & INPUT_BRAKE) !== 0} />
        <span>{air ? "Tilt forward" : "Brake"}</span>
      </div>
      <div className="kg-key">
        <BigKey label="→" active={(hud.mask & INPUT_GAS) !== 0} />
        <span>{air ? "Tilt back" : "Gas"}</span>
      </div>
    </div>
  );
}

type HintId = "start" | "air" | "rear" | "fuel";
const HINTS: Record<HintId, { text: string; tone: "info" | "warn" }> = {
  start: { text: "Hold → to drive", tone: "info" },
  air: { text: "In the air: ← and → rotate the car. Land on your wheels!", tone: "info" },
  rear: { text: "Too steep! Release → or tap ← to bring the nose down", tone: "warn" },
  fuel: { text: "Low fuel! Grab the next fuel can", tone: "warn" },
};

export function Hints() {
  const hud = useStore((s) => s.hud);
  const screen = useStore((s) => s.screen);
  const lastRun = useStore((s) => s.lastRun);
  const [tutorialRuns] = useState(() => Number(localStorage.getItem(SEEN_KEY) ?? 0));
  const counted = useRef(false);
  const [airShown, setAirShown] = useState(0);

  useEffect(() => {
    if (hud.started && !counted.current) {
      counted.current = true;
      localStorage.setItem(SEEN_KEY, String(tutorialRuns + 1));
    }
  }, [hud.started, tutorialRuns]);

  useEffect(() => {
    if (hud.airborne && hud.started && airShown < 3) setAirShown((n) => n + 1);
  }, [hud.airborne, hud.started]);

  if (screen !== "playing" || lastRun) return null;
  const learning = tutorialRuns < 4;
  let hint: HintId | null = null;
  if (!hud.started) hint = "start";
  else if (hud.rearing && learning) hint = "rear";
  else if (hud.airborne && learning && airShown <= 3) hint = "air";
  else if (hud.fuel < 0.25 && hud.fuel > 0) hint = "fuel";
  if (!hint) return null;
  const { text, tone } = HINTS[hint];
  return (
    <div key={hint} className={`hint-bubble ${tone} ${hint === "start" ? "pulse" : ""}`}>
      {text}
    </div>
  );
}

import { useStore } from "../store";
import { HowToPlay } from "./guide";
import { Coin, Home, Play, Restart, Trophy, User, Wrench } from "./icons";

function Keycap({ children }: { children: React.ReactNode }) {
  return <kbd className="keycap">{children}</kbd>;
}

export function Controls() {
  return (
    <div className="controls">
      <span><Keycap>→</Keycap> gas</span>
      <span><Keycap>←</Keycap> brake</span>
      <span className="muted">in the air, they tilt</span>
      <span><Keycap>R</Keycap> restart</span>
      <span><Keycap>Esc</Keycap> menu</span>
    </div>
  );
}

function MenuNav() {
  const online = useStore((s) => s.online);
  const user = useStore((s) => s.user);
  const setPanel = useStore((s) => s.setPanel);
  return (
    <div className="menu-nav">
      <button className="tile" onClick={() => setPanel("garage")} disabled={!online}>
        <Wrench /> Garage
      </button>
      <button className="tile" onClick={() => setPanel("leaderboard")} disabled={!online}>
        <Trophy /> Leaderboard
      </button>
      <button className="tile" onClick={() => setPanel("account")} disabled={!online}>
        <User /> {user ? user.username : "Sign in"}
      </button>
    </div>
  );
}

function Footer() {
  const online = useStore((s) => s.online);
  const servedBy = useStore((s) => s.servedBy);
  const user = useStore((s) => s.user);
  return (
    <div className="menu-footer">
      {user && (
        <span className="chip">
          <Coin /> {user.coins} · best {user.best} m
        </span>
      )}
      <span className={`chip ${online ? "ok" : "warn"}`}>
        <i className="dot" /> {online ? `online · ${servedBy ?? "…"}` : "offline · guest mode"}
      </span>
      {online && !user && <span className="chip">Guest: sign in to save scores and earn coins</span>}
    </div>
  );
}

export function TitleScreen() {
  const setScreen = useStore((s) => s.setScreen);
  const user = useStore((s) => s.user);
  return (
    <div className="menu title-screen">
      <div className="logo">
        TALUS
        <small>an endless hill drive</small>
      </div>
      <button className="cta" onClick={() => setScreen("playing")}>
        <Play /> Drive <kbd className="keycap">→</kbd>
      </button>
      <HowToPlay />
      <MenuNav />
      <Footer />
    </div>
  );
}

export function PauseMenu() {
  const setScreen = useStore((s) => s.setScreen);
  const restart = useStore((s) => s.restart);
  return (
    <div className="menu pause-screen">
      <h1>Paused</h1>
      <div className="menu-actions">
        <button className="cta" onClick={() => setScreen("playing")}>
          <Play /> Resume
        </button>
        <button className="ghost" onClick={() => { restart(); setScreen("playing"); }}>
          <Restart /> Restart
        </button>
        <button className="ghost" onClick={() => { restart(); setScreen("title"); }}>
          <Home /> Main menu
        </button>
      </div>
      <HowToPlay />
      <MenuNav />
      <Footer />
    </div>
  );
}

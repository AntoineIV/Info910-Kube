import { useEffect, useState, type FormEvent } from "react";
import { UPGRADE_KINDS } from "@talus/game-core";
import { useStore } from "../store";

export function AccountPanel() {
  const user = useStore((s) => s.user);
  const error = useStore((s) => s.error);
  const authenticate = useStore((s) => s.authenticate);
  const logout = useStore((s) => s.logout);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    return (
      <>
        <h2>{user.username}</h2>
        <p>◉ {user.coins} coins · best {user.best} m</p>
        <button onClick={() => void logout()}>Sign out</button>
      </>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void authenticate(mode, username, password);
  };
  return (
    <form onSubmit={submit}>
      <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
      <input autoFocus placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "No account yet? Create one" : "Already registered? Sign in"}
      </button>
    </form>
  );
}

export function LeaderboardPanel() {
  const rows = useStore((s) => s.leaderboard);
  const me = useStore((s) => s.user?.username);
  useEffect(() => void useStore.getState().loadLeaderboard(), []);
  return (
    <>
      <h2>Leaderboard</h2>
      {rows.length === 0 && <p>No verified run yet. Be the first!</p>}
      <ol className="board">
        {rows.map((r) => (
          <li key={r.username} className={r.username === me ? "me" : ""}>
            <span>{r.username}</span>
            <strong>{r.distance} m</strong>
          </li>
        ))}
      </ol>
    </>
  );
}

export function GaragePanel() {
  const user = useStore((s) => s.user);
  const config = useStore((s) => s.config);
  const error = useStore((s) => s.error);
  const buy = useStore((s) => s.buy);
  if (!user) return <p>Sign in to upgrade your vehicle with the coins you collect.</p>;
  return (
    <>
      <h2>Garage</h2>
      <p>◉ {user.coins} coins. Upgrades apply from your next run.</p>
      <ul className="garage">
        {UPGRADE_KINDS.map((kind) => {
          const up = config.upgrades[kind];
          const level = user.upgrades[kind];
          const price = up.prices[level];
          return (
            <li key={kind}>
              <div>
                <strong>{up.label}</strong>
                <div className="pips">
                  {up.prices.map((_, i) => (
                    <span key={i} className={i < level ? "on" : ""} />
                  ))}
                </div>
              </div>
              {price === undefined ? (
                <em>max</em>
              ) : (
                <button className="primary" disabled={user.coins < price} onClick={() => void buy(kind)}>
                  ◉ {price}
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

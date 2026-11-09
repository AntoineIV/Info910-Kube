import { InputRecorder, INPUT_BRAKE, INPUT_GAS, parseGameConfig, Sim } from "../packages/game-core/src";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("--url="))?.slice(6) ?? "http://talus.local").replace(/\/$/, "");
const user = args.find((a) => a.startsWith("--user="))?.slice(7) ?? "bot";
const cheat = args.includes("--cheat");
const seconds = Number(args.find((a) => a.startsWith("--seconds="))?.slice(10) ?? 30);
let cookie = "";

async function call(path: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const data = await res.json().catch(() => null);
  return { status: res.status, data, servedBy: res.headers.get("x-served-by") };
}

const creds = { username: user, password: "demo-password" };
if ((await call("/auth/register", creds)).status !== 201) {
  const login = await call("/auth/login", creds);
  if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.data)}`);
}
const { data: cfg } = await call("/config");
const config = parseGameConfig(cfg.config);
const start = await call("/runs", {});
if (start.status !== 201) throw new Error(`cannot start run: ${JSON.stringify(start.data)}`);
const run = start.data;

const sim = new Sim(run.seed, config, run.upgrades);
const rec = new InputRecorder();
while (!sim.finished && sim.tick < seconds * 120) {
  const angle = Math.atan2(sim.chassis.s, sim.chassis.c);
  const mask = angle > 0.6 ? INPUT_BRAKE : INPUT_GAS;
  rec.record(sim.tick, mask);
  sim.step(mask);
}
const claim = { distance: cheat ? sim.distance * 3 : sim.distance, coins: cheat ? sim.coins + 500 : sim.coins };
console.log(`played run ${run.id} (seed ${run.seed}): ${sim.distance} m, ${sim.coins} coins; claiming ${claim.distance} m, ${claim.coins} coins`);
await call(`/runs/${run.id}/finish`, { endTick: sim.tick, events: rec.events, ...claim });

for (let i = 0; i < 30; i++) {
  const { data } = await call(`/runs/${run.id}`);
  if (data.status !== "pending") {
    console.log(`=> ${data.status.toUpperCase()} by ${data.verifiedBy}${data.rejectReason ? `: ${data.rejectReason}` : ""}`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("=> still pending after 30 s (is the verifier running?)");
process.exit(1);

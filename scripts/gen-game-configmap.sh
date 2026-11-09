#!/usr/bin/env bash
# Regenerates k8s/20-configmap-game.yaml from the default config of the game core,
# so the ConfigMap shipped with the manifests always matches the code defaults.
set -euo pipefail
cd "$(dirname "$0")/.."
json="$(npx --yes esbuild packages/game-core/src/config.ts --bundle --platform=node --format=esm --log-level=error \
  | node --input-type=module -e '
let src = "";
process.stdin.on("data", (d) => (src += d)).on("end", async () => {
  const m = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  process.stdout.write(JSON.stringify(m.defaultConfig, null, 2));
});')"
{
  cat <<'HEADER'
# Game tuning (physics, fuel, terrain difficulty, coin values, shop prices, biomes).
# Mounted as a file in the API pods (/etc/talus/game.json). The kubelet refreshes
# mounted ConfigMaps (about a minute), the API re-reads the file every few seconds,
# validates it with Zod and switches to it live: no image rebuild, no restart.
# An invalid edit is rejected and the previous config stays active.
# Every run stores the hash of the config it was played with, so the verifier
# always replays a run with the exact config the player had.
# Regenerate defaults with: scripts/gen-game-configmap.sh
apiVersion: v1
kind: ConfigMap
metadata:
  name: game-config
  namespace: talus
  labels:
    part-of: talus
data:
  game.json: |
HEADER
  printf '%s\n' "$json" | sed 's/^/    /'
} > k8s/20-configmap-game.yaml
echo "wrote k8s/20-configmap-game.yaml"

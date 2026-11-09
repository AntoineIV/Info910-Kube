#!/usr/bin/env sh
# Plays one deterministic run against the API and submits it (add --cheat to forge the score).
# Usage: scripts/bot.sh [--url=http://talus.local] [--ip=$(minikube ip)] [--user=bot] [--seconds=30] [--cheat]
set -e
cd "$(dirname "$0")/.."
if [ ! -d node_modules ]; then
  echo "The bot needs the JavaScript dependencies: run 'pnpm install' at the repository root first." >&2
  exit 1
fi
npx --yes esbuild scripts/bot.ts --bundle --platform=node --format=esm --log-level=error | node --input-type=module - "$@"

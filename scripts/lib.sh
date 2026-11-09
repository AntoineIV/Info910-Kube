# Shared helpers for the demo scripts (sourced, not executed).
set -euo pipefail
NS=talus
IP="$(minikube ip)"
HOST=talus.local
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
api() { curl -s -H "Host: $HOST" "http://$IP/api$1"; }
db_sql() { kubectl -n "$NS" exec postgres-0 -- sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"$1\""; }

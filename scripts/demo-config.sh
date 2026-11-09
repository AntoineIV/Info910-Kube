#!/usr/bin/env bash
# Demo 2: change the game tuning live through the game-config ConfigMap.
# No image rebuild, no pod restart: the kubelet refreshes the mounted file, the API
# re-reads and validates it, and the next run uses the new values. An invalid value
# is rejected and the previous config stays active.
source "$(dirname "$0")/lib.sh"
CM=k8s/20-configmap-game.yaml
# Asks every API pod directly (not through the Service) which gravity it uses.
pods_gravity() {
  for pod in $(kubectl -n $NS get pods -l app=api --field-selector=status.phase=Running -o name); do
    printf '%s=%s ' "${pod#pod/}" "$(kubectl -n $NS exec "$pod" -- wget -qO- localhost:3000/api/config | sed -E 's/.*"gravity":([^,]*),.*/\1/')"
  done
}
wait_gravity() {
  local start=$SECONDS current
  while true; do
    current=$(pods_gravity)
    if ! grep -qv "=$1\$" <(tr ' ' '\n' <<<"$current" | sed '/^$/d'); then break; fi
    if (( SECONDS - start > 180 )); then echo "  timeout: $current"; return 1; fi
    sleep 3
  done
  echo "  all pods live after $((SECONDS - start)) s: $current"
}

step "Current gravity served by the API"
echo "  $(pods_gravity)"
POD_UIDS=$(kubectl -n $NS get pods -l app=api -o jsonpath='{.items[*].metadata.uid}')

step "Applying the ConfigMap with moon-like gravity (1.62)"
sed 's/"gravity": 9.81/"gravity": 1.62/' $CM | kubectl apply -f -
wait_gravity 1.62

step "Applying an INVALID config (negative gravity): rejected, 1.62 stays active"
sed 's/"gravity": 9.81/"gravity": -5/' $CM | kubectl apply -f -
sleep 90
echo "  $(pods_gravity)"
kubectl -n $NS logs -l app=api --tail=50 | grep "rejected config" | tail -1 | cut -c1-160

step "Restoring the default ConfigMap"
kubectl apply -f $CM
wait_gravity 9.81

step "Same API pods as before (no restart, no rollout)"
[[ "$POD_UIDS" == "$(kubectl -n $NS get pods -l app=api -o jsonpath='{.items[*].metadata.uid}')" ]] && echo "  yes, identical pod UIDs" || echo "  pods changed!"
db_sql "select hash, body->'physics'->>'gravity' as gravity, created_at from game_configs order by created_at"

#!/usr/bin/env bash
# Demo 1: delete the database pod. The StatefulSet recreates postgres-0 with the same
# name and the same volume, so no data is lost. Meanwhile the API pods fail their
# readiness probe and leave the Service endpoints, but are NOT restarted (liveness
# does not depend on the database), and they come back on their own.
source "$(dirname "$0")/lib.sh"

step "Data before: players and verified runs"
db_sql "select count(*) || ' players, ' || (select count(*) from runs where status='verified') || ' verified runs' from users"
api /leaderboard; echo
RESTARTS_BEFORE=$(kubectl -n $NS get pods -l app=api --field-selector=status.phase=Running -o jsonpath='{range .items[*]}{.status.containerStatuses[0].restartCount}{" "}{end}')

step "Deleting pod postgres-0"
kubectl -n $NS delete pod postgres-0 --wait=false

watch_api() {
  for i in $(seq 1 "$1"); do
  ready=$(kubectl -n $NS get endpointslices -l kubernetes.io/service-name=api -o jsonpath='{range .items[*].endpoints[*]}{.conditions.ready}{" "}{end}')
    printf '  t+%02ds  api endpoints ready: [%s]  GET /api/leaderboard -> HTTP %s\n' $((i * 3)) "$ready" "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $HOST" "http://$IP/api/leaderboard")"
    sleep 3
  done
}

step "Watching the API while postgres-0 is recreated"
watch_api 4

step "Waiting for postgres-0 to be back"
kubectl -n $NS wait --for=condition=Ready pod/postgres-0 --timeout=180s
kubectl -n $NS rollout status deployment/api --timeout=120s >/dev/null
kubectl -n $NS get pod postgres-0 -o jsonpath='{"  pod "}{.metadata.name}{" uses PVC "}{.spec.volumes[0].persistentVolumeClaim.claimName}{"\n"}'

step "Data after: same players, same leaderboard"
db_sql "select count(*) || ' players, ' || (select count(*) from runs where status='verified') || ' verified runs' from users"
api /leaderboard; echo

step "Longer outage: scaling the database to 0 for ~40 s"
kubectl -n $NS scale statefulset postgres --replicas=0
watch_api 14
kubectl -n $NS scale statefulset postgres --replicas=1
step "Database back: the API pods become ready again by themselves"
until kubectl -n $NS get pod postgres-0 >/dev/null 2>&1; do sleep 1; done
kubectl -n $NS wait --for=condition=Ready pod/postgres-0 --timeout=180s
watch_api 5
db_sql "select count(*) || ' players, ' || (select count(*) from runs where status='verified') || ' verified runs' from users"

step "API restart counts before -> after (unchanged: liveness ignored the outage)"
echo "  $RESTARTS_BEFORE-> $(kubectl -n $NS get pods -l app=api --field-selector=status.phase=Running -o jsonpath='{range .items[*]}{.status.containerStatuses[0].restartCount}{" "}{end}')"

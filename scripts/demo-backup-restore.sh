#!/usr/bin/env bash
# Demo 4: disaster recovery. Take a dump, destroy the database AND its volume
# (StatefulSet + PVC), recreate an empty database, restore the dump from the
# backups PersistentVolume (reclaimPolicy: Retain), and check that the data is back.
source "$(dirname "$0")/lib.sh"

step "Backups currently on the talus-backups PersistentVolume"
kubectl -n $NS exec deploy/backup -- sh -c 'ls -1t /backups/talus-*.dump | head -n 5'
kubectl get pv talus-backups -o jsonpath='{"  PV talus-backups: "}{.status.phase}{", reclaimPolicy "}{.spec.persistentVolumeReclaimPolicy}{"\n"}'

step "Taking a fresh dump right now"
DUMP=talus-$(date -u +%Y%m%dT%H%M%SZ).dump
kubectl -n $NS exec deploy/backup -- pg_dump -Fc -f "/backups/$DUMP"
echo "  /backups/$DUMP"
BEFORE=$(db_sql "select count(*) || ' players, ' || (select count(*) from runs) || ' runs, ' || (select coalesce(sum(coins),0) from users) || ' coins in wallets' from users")
echo "  data: $BEFORE"

step "DISASTER: deleting the StatefulSet and the database volume (PVC data-postgres-0)"
kubectl -n $NS delete statefulset postgres
kubectl -n $NS delete pvc data-postgres-0
kubectl -n $NS wait --for=delete pod/postgres-0 --timeout=120s 2>/dev/null || true

step "Recreating an empty database from the manifest"
kubectl apply -f k8s/30-postgres.yaml
until kubectl -n $NS get pod postgres-0 >/dev/null 2>&1; do sleep 1; done
kubectl -n $NS wait --for=condition=Ready pod/postgres-0 --timeout=180s
echo "  tables in the new database: $(db_sql "select count(*) from information_schema.tables where table_schema='public'")"

step "Restoring from the backups volume"
"$(dirname "$0")/restore-backup.sh" "$DUMP"

step "Data after restore"
AFTER=$(db_sql "select count(*) || ' players, ' || (select count(*) from runs) || ' runs, ' || (select coalesce(sum(coins),0) from users) || ' coins in wallets' from users")
echo "  before: $BEFORE"
echo "  after:  $AFTER"
[[ "$BEFORE" == "$AFTER" ]] && echo "  identical" || echo "  DIFFERENT"
echo "  leaderboard through the Ingress: $(api /leaderboard)"

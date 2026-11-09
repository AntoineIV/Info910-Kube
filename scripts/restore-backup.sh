#!/usr/bin/env bash
# Restores a dump from the backups volume into the running database.
# Usage: scripts/restore-backup.sh [talus-YYYYMMDDTHHMMSSZ.dump]   (default: newest)
# Tip: after a disaster, pass the dump explicitly: the backup loop keeps running and
# may already have dumped the new, empty database.
source "$(dirname "$0")/lib.sh"
FILE="${1:-$(kubectl -n $NS exec deploy/backup -- sh -c 'ls -1t /backups/talus-*.dump | head -n 1 | xargs basename')}"
step "Restoring $FILE into $(kubectl -n $NS get cm platform -o jsonpath='{.data.DATABASE_HOST}')"
kubectl -n $NS exec deploy/backup -- sh -c "pg_restore --clean --if-exists --no-owner -d \"\$PGDATABASE\" /backups/$FILE"
echo "  done"

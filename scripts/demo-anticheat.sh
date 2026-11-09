#!/usr/bin/env bash
# Demo 3: anti-cheat and horizontal scaling of the verifier.
# Bots play real runs and submit their recorded inputs; some lie about the result.
# The verifier pods replay every run and only credit the honest ones. With 3
# replicas, the queue is shared (FOR UPDATE SKIP LOCKED) and each run is replayed once.
source "$(dirname "$0")/lib.sh"
BOT="$(dirname "$0")/bot.sh"

step "Scaling the verifier to 3 replicas"
kubectl -n $NS scale deployment verifier --replicas=3
kubectl -n $NS rollout status deployment/verifier --timeout=120s

step "6 bots play at the same time (bots 5 and 6 cheat)"
for i in 1 2 3 4; do "$BOT" --ip="$IP" --user="honest$i" --seconds=20 | sed "s/^/  [honest$i] /" & done
for i in 5 6; do "$BOT" --ip="$IP" --user="cheater$i" --seconds=20 --cheat | sed "s/^/  [cheater$i] /" & done
wait

step "Who replayed what (verified_by is the pod name, from the Downward API)"
db_sql "select verified_by, count(*) filter (where status='verified') as verified, count(*) filter (where status='rejected') as rejected, round(avg(verify_ms)::numeric) as avg_ms from runs where verified_by is not null group by verified_by order by verified_by"

step "Leaderboard (cheaters are absent)"
api /leaderboard; echo

step "Scaling the verifier back to 2 replicas"
kubectl -n $NS scale deployment verifier --replicas=2

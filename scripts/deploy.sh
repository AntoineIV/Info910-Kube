#!/usr/bin/env bash
# Deploys Talus on the current kubectl context (minikube by default).
set -euo pipefail
cd "$(dirname "$0")/.."
minikube addons enable ingress >/dev/null
# The namespace must exist before the namespaced objects are created.
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/
echo "==> waiting for the workloads"
kubectl -n talus rollout status statefulset/postgres --timeout=180s
for d in api web verifier backup; do kubectl -n talus rollout status "deployment/$d" --timeout=300s; done
kubectl -n talus get pods,svc,ingress,pvc
echo
echo "Open http://talus.local (add \"$(minikube ip) talus.local\" to /etc/hosts)."

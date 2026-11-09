#!/usr/bin/env bash
# Deploys Talus on the current kubectl context (minikube by default).
set -euo pipefail
cd "$(dirname "$0")/.."
minikube addons enable ingress >/dev/null
# On a fresh cluster the ingress controller (and its validating webhook) needs
# a minute to start: creating the Ingress before that is rejected.
echo "==> waiting for the ingress controller"
kubectl -n ingress-nginx wait --for=condition=Ready pod \
  -l app.kubernetes.io/component=controller --timeout=300s
# The namespace must exist before the namespaced objects are created.
kubectl apply -f k8s/00-namespace.yaml
# Retry: the webhook can still refuse connections for a few seconds after the pod is Ready.
for attempt in 1 2 3 4 5 6; do
  kubectl apply -f k8s/ && break
  [[ $attempt == 6 ]] && exit 1
  echo "==> retrying in 10 s (ingress webhook not ready yet)"; sleep 10
done
echo "==> waiting for the workloads"
kubectl -n talus rollout status statefulset/postgres --timeout=180s
for d in api web verifier backup; do kubectl -n talus rollout status "deployment/$d" --timeout=300s; done
kubectl -n talus get pods,svc,ingress,pvc
echo
echo "Open http://talus.local (add \"$(minikube ip) talus.local\" to /etc/hosts)."

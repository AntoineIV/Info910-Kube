#!/usr/bin/env bash
# Builds the three Talus images with the local Docker daemon, then loads them
# into minikube, so the cluster can use them without any registry
# (manifests use imagePullPolicy: IfNotPresent with a fixed tag).
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${TAG:-1.0.0}"
for app in api verifier web; do
  echo "==> building talus/$app:$TAG"
  docker build -q -t "talus/$app:$TAG" -f "apps/$app/Dockerfile" .
  echo "==> loading talus/$app:$TAG into minikube"
  minikube image load --overwrite=true "talus/$app:$TAG"
done
minikube image ls | grep talus/

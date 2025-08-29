#!/usr/bin/env bash
# Rebuild and restart the stack from scratch, skipping model downloads (DOWNLOAD_MODELS=false)
# Usage:
#   ./rebuild_docker.sh               # default (no models download)
#   ./rebuild_docker.sh --models      # enable model download during build (DOWNLOAD_MODELS=true)
#   ./rebuild_docker.sh --no-logs     # do not follow backend logs after up
#   ./rebuild_docker.sh --help        # show help
# Flags can be combined, e.g.: ./rebuild_docker.sh --models --no-logs

set -euo pipefail

DOWNLOAD_MODELS=false
FOLLOW_LOGS=true

print_help() {
  grep '^# ' "$0" | cut -c4-
}

for arg in "$@"; do
  case "$arg" in
    --models)
      DOWNLOAD_MODELS=true
      shift
      ;;
    --no-logs)
      FOLLOW_LOGS=false
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      print_help
      exit 1
      ;;
  esac
done

echo "[1/5] Bringing down existing stack (volumes + orphans)..."
docker compose down -v --remove-orphans || docker-compose down -v --remove-orphans

echo "[2/5] Pruning dangling resources (IMAGEs, CONTAINERs, NETWORKs, BUILDs)..."
docker system prune -f

echo "[3/5] Building images (no cache, DOWNLOAD_MODELS=${DOWNLOAD_MODELS})..."
docker compose build --no-cache --build-arg DOWNLOAD_MODELS=${DOWNLOAD_MODELS} backend frontend || \
  docker-compose build --no-cache --build-arg DOWNLOAD_MODELS=${DOWNLOAD_MODELS} backend frontend

echo "[4/5] Starting stack (detached)..."
docker compose up -d || docker-compose up -d

if $FOLLOW_LOGS; then
  echo "[5/5] Following backend logs (Ctrl+C to stop tail, stack keeps running)..."
  docker compose logs -f --tail=120 backend || docker-compose logs -f --tail=120 backend
else
  echo "[5/5] Skipping logs. Stack is up."
fi

echo "✅ Rebuild complete."

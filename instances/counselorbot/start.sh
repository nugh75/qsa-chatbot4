#!/bin/bash
# Avvio istanza CounselorBot (ai4educ-chatbots)
set -e

SITE="counselorbot"
PG_PORT=5532
BE_PORT=8112
FE_PORT=5172

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
cd "$DIR"

echo "🚀 Avvio istanza ${SITE}..."

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker non in esecuzione"; exit 1
fi

export DOCKER_UID="${DOCKER_UID:-$(id -u)}"
export DOCKER_GID="${DOCKER_GID:-$(id -g)}"
export CHATBOT_DATA_ROOT="${CHATBOT_DATA_ROOT:-$ROOT/runtime-data}"
echo "   UID=${DOCKER_UID} GID=${DOCKER_GID}"
echo "   CHATBOT_DATA_ROOT=${CHATBOT_DATA_ROOT}"

echo "🔄 Bootstrap runtime-data..."
"$ROOT/scripts/bootstrap_runtime_data.sh"

echo "🔨 Build e avvio..."
docker compose up --build -d

echo "📊 Stato:"
docker compose ps

cat <<EOF

🎉 Istanza ${SITE} avviata
   Frontend:    http://localhost:${FE_PORT}
   Backend API: http://localhost:${BE_PORT}
   Database:    localhost:${PG_PORT} (interno)

Log:   docker compose -f instances/${SITE}/docker-compose.yml logs -f
Stop:  docker compose -f instances/${SITE}/docker-compose.yml down
EOF

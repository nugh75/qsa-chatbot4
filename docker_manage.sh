#!/usr/bin/env bash
# Simple menu to manage the Agrusti stack (prune, build, up -d, logs, status)
# Usage: chmod +x scripts/agrusti_manage.sh && ./scripts/agrusti_manage.sh

set -euo pipefail
COMPOSE_FILE="docker-compose.multi.yml"

# Service groups
AGRUSTI_SERVICES=(postgres-agrusti backend-agrusti frontend-agrusti)
COUNSELORBOT_SERVICES=(postgres-counselorbot backend-counselorbot frontend-counselorbot)
EDURAG_SERVICES=(postgres-edurag backend-edurag frontend-edurag)
MARGOTTINI_SERVICES=(postgres-margottini backend-margottini frontend-margottini)
PEF_SERVICES=(postgres-pef backend-pef frontend-pef)
DRAGONI_SERVICES=(postgres-dragoni backend-dragoni frontend-dragoni)

# current selection (array)
SELECTED_SERVICES=()

confirm() {
  read -rp "$1 [y/N]: " ans
  case "$ans" in
    [Yy]|[Yy][Ee][Ss]) return 0;;
    *) return 1;;
  esac
}

cmd_prune() {
  echo "WARNING: prune will remove unused images/containers/volumes. This may be destructive."
  if ! confirm "Proceed with docker system prune (includes volumes)?"; then
    echo "Prune cancelled."; return
  fi
  if [ ${#SELECTED_SERVICES[@]} -gt 0 ]; then
    echo "Stopping selected services before prune..."
    docker compose -f "$COMPOSE_FILE" down ${SELECTED_SERVICES[*]} || true
  else
    docker compose -f "$COMPOSE_FILE" down || true
  fi
  echo "Running docker system prune -af --volumes"
  docker system prune -af --volumes
  echo "Prune complete." 
}

cmd_build() {
  echo "Building images for selected services..."
  if [ ${#SELECTED_SERVICES[@]} -gt 0 ]; then
    docker compose -f "$COMPOSE_FILE" build ${SELECTED_SERVICES[*]}
  else
    echo "No services selected. Nothing to build."; return
  fi
  echo "Build finished." 
}

cmd_up() {
  echo "Starting selected services in detached mode..."
  if [ ${#SELECTED_SERVICES[@]} -gt 0 ]; then
    docker compose -f "$COMPOSE_FILE" up -d ${SELECTED_SERVICES[*]}
  else
    echo "No services selected. Nothing to start."; return
  fi
  echo "Services started." 
}

cmd_logs() {
  tail_count=200
  read -rp "How many lines to show from logs (default ${tail_count}): " input
  tail_count=${input:-$tail_count}
  if [ ${#SELECTED_SERVICES[@]} -gt 0 ]; then
    echo "Tailing logs for: ${SELECTED_SERVICES[*]} (follow)...\nPress Ctrl+C to stop."
    docker compose -f "$COMPOSE_FILE" logs -f --tail="$tail_count" ${SELECTED_SERVICES[*]}
  else
    echo "Tailing logs for all services (follow)...\nPress Ctrl+C to stop."
    docker compose -f "$COMPOSE_FILE" logs -f --tail="$tail_count"
  fi
}

cmd_status() {
  echo "Docker compose ps for selected services:"
  if [ ${#SELECTED_SERVICES[@]} -gt 0 ]; then
    docker compose -f "$COMPOSE_FILE" ps ${SELECTED_SERVICES[*]}
  else
    docker compose -f "$COMPOSE_FILE" ps
  fi
}

cmd_down() {
  echo "Stopping and removing selected containers (keep volumes):"
  if [ ${#SELECTED_SERVICES[@]} -gt 0 ]; then
    docker compose -f "$COMPOSE_FILE" down ${SELECTED_SERVICES[*]}
  else
    docker compose -f "$COMPOSE_FILE" down
  fi
}

select_services_menu() {
  cat <<'SERV'

Select service group to operate on:
1) Agrusti
2) Counselorbot
3) EduRAG
4) Margottini
5) PEF
6) Dragoni
7) All groups (all services in compose)
8) Custom (enter comma-separated service names)
9) Cancel

Choose an option:
SERV
  read -rp "> " sopt
  case "$sopt" in
    1) SELECTED_SERVICES=("${AGRUSTI_SERVICES[@]}") ;;
    2) SELECTED_SERVICES=("${COUNSELORBOT_SERVICES[@]}") ;;
    3) SELECTED_SERVICES=("${EDURAG_SERVICES[@]}") ;;
    4) SELECTED_SERVICES=("${MARGOTTINI_SERVICES[@]}") ;;
    5) SELECTED_SERVICES=("${PEF_SERVICES[@]}") ;;
    6) SELECTED_SERVICES=("${DRAGONI_SERVICES[@]}") ;;
    7) SELECTED_SERVICES=() ;; # empty means all
    8)
      read -rp "Enter comma-separated service names (e.g. backend-agrusti,frontend-agrusti): " custom
      IFS=',' read -ra arr <<< "$custom"
      SELECTED_SERVICES=()
      for v in "${arr[@]}"; do SELECTED_SERVICES+=("$(echo "$v" | xargs)"); done
      ;;
    *) echo "Selection cancelled"; SELECTED_SERVICES=();;
  esac
  echo "Selected services: ${SELECTED_SERVICES[*]:-<all>}"
}

menu() {
  cat <<'MENU'

Docker compose management menu
1) Select services/group
2) Prune (docker system prune -af --volumes) - DANGEROUS
3) Build images for selected services
4) Up (detached) selected services
5) Down selected services
6) Logs (follow) selected services
7) Status (docker compose ps)
8) Exit

Choose an option:
MENU
}

while true; do
  menu
  read -rp "> " opt
  # Allow chaining multiple commands: e.g. 1,3,4 or ranges like 2-4
  IFS=',' read -ra choices <<< "$opt"
  for choice in "${choices[@]}"; do
    # trim
    choice="$(echo "$choice" | xargs)"
    # support simple ranges like 2-4
    if [[ "$choice" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      start=${BASH_REMATCH[1]}
      end=${BASH_REMATCH[2]}
      for ((c=start;c<=end;c++)); do
        sel="$c"
        case "$sel" in
          1) select_services_menu ;;
          2) cmd_prune ;;
          3) cmd_build ;;
          4) cmd_up ;;
          5) cmd_down ;;
          6) cmd_logs ;;
          7) cmd_status ;;
          8) echo "Bye"; exit 0 ;;
          *) echo "Invalid choice: $sel" ;;
        esac
      done
    else
      case "$choice" in
        1) select_services_menu ;;
        2) cmd_prune ;;
        3) cmd_build ;;
        4) cmd_up ;;
        5) cmd_down ;;
        6) cmd_logs ;;
        7) cmd_status ;;
        8) echo "Bye"; exit 0 ;;
        '') ;; # ignore empty input
        *) echo "Invalid choice: $choice" ;;
      esac
    fi
  done
  echo
  sleep 0.5
done

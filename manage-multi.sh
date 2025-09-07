#!/bin/bash

# Script per gestire i container multi-sito
# Uso: ./manage-multi.sh [start|stop|restart|logs|build] [sito]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Lista dei siti disponibili
SITES=("agrusti" "counselorbot" "edurag" "margottini" "pef")

# Verifica che docker-compose sia installato
if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Errore: docker-compose o 'docker compose' non trovato${NC}"
    exit 1
fi

# Usa docker compose se disponibile, altrimenti docker-compose
DOCKER_COMPOSE="docker-compose"
if command -v docker compose &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
fi

show_help() {
    echo "Gestione container multi-sito QSA Chatbot"
    echo ""
    echo "Uso: $0 [COMANDO] [SITO]"
    echo ""
    echo "COMANDI:"
    echo "  start      - Avvia tutti i container o quelli del sito specifico"
    echo "  stop       - Ferma tutti i container o quelli del sito specifico"
    echo "  restart    - Riavvia tutti i container o quelli del sito specifico"
    echo "  logs       - Mostra i log di tutti i container o del sito specifico"
    echo "  build      - Ricompila tutti i container o quelli del sito specifico"
    echo "  status     - Mostra lo stato dei container"
    echo "  clean      - Rimuove tutti i container, volumi e immagini"
    echo "  urls       - Mostra gli URL dei siti"
    echo ""
    echo "SITI DISPONIBILI:"
    for site in "${SITES[@]}"; do
        echo "  - $site"
    done
    echo ""
    echo "ESEMPI:"
    echo "  $0 start                    # Avvia tutti i siti"
    echo "  $0 start edurag            # Avvia solo edurag"
    echo "  $0 logs pef                # Mostra log di pef"
    echo "  $0 build margottini        # Ricompila solo margottini"
}

get_services_for_site() {
    local site=$1
    if [[ " ${SITES[@]} " =~ " ${site} " ]]; then
        echo "backend-${site} frontend-${site}"
    else
        echo ""
    fi
}

get_all_services() {
    echo -n "postgres"
    for site in "${SITES[@]}"; do
        echo -n " backend-${site} frontend-${site}"
    done
    echo
}

show_urls() {
    echo -e "${GREEN}URLs dei siti:${NC}"
    echo "  Agrusti:      http://localhost:5171 (backend: 8111)"
    echo "  Counselorbot: http://localhost:5172 (backend: 8112)"
    echo "  EduRAG:       http://localhost:5173 (backend: 8113)"
    echo "  Margottini:   http://localhost:5174 (backend: 8114)"
    echo "  PEF:          http://localhost:5175 (backend: 8115)"
    echo ""
    echo "  Database:     localhost:5532"
}

create_log_dirs() {
    echo -e "${YELLOW}Creazione directory dei log...${NC}"
    for site in "${SITES[@]}"; do
        mkdir -p "backend/storage/logs-${site}"
    done
}

# Parsing argumenti
COMMAND=${1:-help}
SITE=${2:-}

case "$COMMAND" in
    help|--help|-h)
        show_help
        exit 0
        ;;
    start)
        create_log_dirs
        if [[ -n "$SITE" ]]; then
            SERVICES=$(get_services_for_site "$SITE")
            if [[ -z "$SERVICES" ]]; then
                echo -e "${RED}Errore: Sito '$SITE' non trovato${NC}"
                exit 1
            fi
            echo -e "${GREEN}Avvio del sito $SITE...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml up -d postgres $SERVICES
        else
            echo -e "${GREEN}Avvio di tutti i container...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml up -d
        fi
        ;;
    stop)
        if [[ -n "$SITE" ]]; then
            SERVICES=$(get_services_for_site "$SITE")
            if [[ -z "$SERVICES" ]]; then
                echo -e "${RED}Errore: Sito '$SITE' non trovato${NC}"
                exit 1
            fi
            echo -e "${YELLOW}Arresto del sito $SITE...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml stop $SERVICES
        else
            echo -e "${YELLOW}Arresto di tutti i container...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml stop
        fi
        ;;
    restart)
        if [[ -n "$SITE" ]]; then
            SERVICES=$(get_services_for_site "$SITE")
            if [[ -z "$SERVICES" ]]; then
                echo -e "${RED}Errore: Sito '$SITE' non trovato${NC}"
                exit 1
            fi
            echo -e "${YELLOW}Riavvio del sito $SITE...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml restart $SERVICES
        else
            echo -e "${YELLOW}Riavvio di tutti i container...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml restart
        fi
        ;;
    logs)
        if [[ -n "$SITE" ]]; then
            SERVICES=$(get_services_for_site "$SITE")
            if [[ -z "$SERVICES" ]]; then
                echo -e "${RED}Errore: Sito '$SITE' non trovato${NC}"
                exit 1
            fi
            echo -e "${GREEN}Log del sito $SITE:${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml logs -f $SERVICES
        else
            echo -e "${GREEN}Log di tutti i container:${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml logs -f
        fi
        ;;
    build)
        if [[ -n "$SITE" ]]; then
            SERVICES=$(get_services_for_site "$SITE")
            if [[ -z "$SERVICES" ]]; then
                echo -e "${RED}Errore: Sito '$SITE' non trovato${NC}"
                exit 1
            fi
            echo -e "${GREEN}Ricompilazione del sito $SITE...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml build --no-cache $SERVICES
        else
            echo -e "${GREEN}Ricompilazione di tutti i container...${NC}"
            $DOCKER_COMPOSE -f docker-compose.multi.yml build --no-cache
        fi
        ;;
    status)
        echo -e "${GREEN}Stato dei container:${NC}"
        $DOCKER_COMPOSE -f docker-compose.multi.yml ps
        ;;
    clean)
        echo -e "${RED}Pulizia completa del sistema...${NC}"
        read -p "Sei sicuro? Questo rimuoverà tutti i container, volumi e immagini. (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            $DOCKER_COMPOSE -f docker-compose.multi.yml down -v --rmi all
            echo -e "${GREEN}Pulizia completata${NC}"
        else
            echo -e "${YELLOW}Operazione annullata${NC}"
        fi
        ;;
    urls)
        show_urls
        ;;
    *)
        echo -e "${RED}Comando non riconosciuto: $COMMAND${NC}"
        echo "Usa '$0 help' per vedere i comandi disponibili"
        exit 1
        ;;
esac

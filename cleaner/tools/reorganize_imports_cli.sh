#!/bin/bash

# Script per riorganizzare automaticamente gli import nei file Python
# Parte del sistema cleaner per QSA Chatbot

set -euo pipefail

# Colori
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directory di lavoro
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Logo e titolo
print_header() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                🔄 IMPORT REORGANIZER 🔄                   ║"
    echo "║            Riorganizzazione automatica import            ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

# Menu principale
show_menu() {
    echo -e "${BLUE}Seleziona modalità di riorganizzazione:${NC}\n"
    echo "1) 👀 Preview (dry-run) - Solo visualizza modifiche"
    echo "2) 🔄 Backend - Riorganizza app Python del backend"
    echo "3) 🌐 Frontend - Analizza import TypeScript/JavaScript" 
    echo "4) 📁 Custom Directory - Specifica directory personalizzata"
    echo "5) 🏠 Intero Progetto - Riorganizza tutto il progetto Python"
    echo "6) ℹ️  Help - Mostra informazioni dettagliate"
    echo "0) 🚪 Esci"
    echo
}

# Informazioni dettagliate
show_help() {
    echo -e "${CYAN}📋 GUIDA IMPORT REORGANIZER${NC}\n"
    
    echo -e "${YELLOW}🎯 Cosa fa:${NC}"
    echo "• Trova tutti gli import sparsi nel codice"
    echo "• Li sposta in cima ai file"
    echo "• Li organizza per categorie (standard library, third-party, local)"
    echo "• Mantiene docstring e commenti"
    echo "• Crea backup automatici"
    echo
    
    echo -e "${YELLOW}📦 Organizzazione import:${NC}"
    echo "1. Standard Library (os, sys, json, ecc.)"
    echo "2. Third-party packages (fastapi, pydantic, ecc.)"
    echo "3. Import locali (moduli del progetto)"
    echo
    
    echo -e "${YELLOW}🛡️  Sicurezza:${NC}"
    echo "• Backup automatico (.py.bak)"
    echo "• Dry-run mode per preview"
    echo "• Parsing AST per sicurezza"
    echo "• Skip automatico file con errori syntax"
    echo
    
    echo -e "${YELLOW}📊 Output:${NC}"
    echo "• Statistiche dettagliate"
    echo "• File modificati e import spostati"
    echo "• Report errori eventuali"
    echo
}

# Esegui reorganizer Python
run_reorganizer() {
    local target_dir="$1"
    local dry_run_flag="$2"
    local description="$3"
    
    echo -e "${BLUE}🎯 Target: ${description}${NC}"
    echo -e "${BLUE}📂 Directory: ${target_dir}${NC}"
    
    if [[ "$dry_run_flag" == "--dry-run" ]]; then
        echo -e "${YELLOW}👀 MODALITÀ PREVIEW ATTIVA${NC}"
        echo -e "${YELLOW}   Nessun file verrà modificato${NC}\n"
    else
        echo -e "${GREEN}🔄 MODALITÀ ATTIVA${NC}"
        echo -e "${GREEN}   I file verranno modificati${NC}\n"
    fi
    
    # Controlla se la directory esiste
    if [[ ! -d "$target_dir" ]]; then
        echo -e "${RED}❌ Directory non trovata: $target_dir${NC}"
        read -p "Premi Enter per continuare..."
        return 1
    fi
    
    # Conta file Python
    local py_files_count
    py_files_count=$(find "$target_dir" -name "*.py" -not -path "*/__pycache__/*" | wc -l)
    
    if [[ $py_files_count -eq 0 ]]; then
        echo -e "${YELLOW}⚠️  Nessun file Python trovato in $target_dir${NC}"
        read -p "Premi Enter per continuare..."
        return 0
    fi
    
    echo -e "${CYAN}📊 File Python trovati: $py_files_count${NC}\n"
    
    # Conferma se non in dry-run
    if [[ "$dry_run_flag" != "--dry-run" ]]; then
        echo -e "${YELLOW}⚠️  ATTENZIONE: I file verranno modificati!${NC}"
        echo -e "${YELLOW}   Verranno creati backup automatici (.py.bak)${NC}"
        echo
        read -p "Continuare? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Operazione annullata${NC}"
            return 0
        fi
        echo
    fi
    
    # Esegui lo script Python
    echo -e "${CYAN}🚀 Avvio riorganizzazione...${NC}\n"
    
    cd "$PROJECT_ROOT"
    python3 "$SCRIPT_DIR/reorganize_imports.py" "$target_dir" $dry_run_flag
    
    echo -e "\n${GREEN}✅ Riorganizzazione completata!${NC}"
    
    if [[ "$dry_run_flag" != "--dry-run" ]]; then
        echo -e "${BLUE}💾 I backup sono salvati come file .py.bak${NC}"
        echo -e "${BLUE}🔍 Per ripristinare un file: mv file.py.bak file.py${NC}"
    fi
    
    echo
    read -p "Premi Enter per continuare..."
}

# Analisi TypeScript/JavaScript (placeholder)
analyze_frontend() {
    echo -e "${YELLOW}🌐 ANALISI FRONTEND${NC}\n"
    
    local frontend_dir="$PROJECT_ROOT/frontend/src"
    
    if [[ ! -d "$frontend_dir" ]]; then
        echo -e "${RED}❌ Directory frontend non trovata: $frontend_dir${NC}"
        read -p "Premi Enter per continuare..."
        return 1
    fi
    
    echo -e "${BLUE}📂 Analizzando: $frontend_dir${NC}"
    
    # Conta file TypeScript/JavaScript
    local ts_files
    ts_files=$(find "$frontend_dir" -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | wc -l)
    
    echo -e "${CYAN}📊 File TS/JS trovati: $ts_files${NC}\n"
    
    # Analisi import più comuni
    echo -e "${YELLOW}📦 Import più comuni:${NC}"
    find "$frontend_dir" \( -name "*.ts" -o -name "*.tsx" \) -exec grep -h "^import" {} \; | \
        head -20 | sort | uniq -c | sort -nr | head -10
    
    echo
    echo -e "${YELLOW}⚠️  Riorganizzazione TypeScript non ancora implementata${NC}"
    echo -e "${BLUE}   Questa feature sarà aggiunta in futuro${NC}"
    
    echo
    read -p "Premi Enter per continuare..."
}

# Directory personalizzata
custom_directory() {
    echo -e "${YELLOW}📁 DIRECTORY PERSONALIZZATA${NC}\n"
    
    echo -e "${BLUE}Directory disponibili nel progetto:${NC}"
    find "$PROJECT_ROOT" -type d -name "*.py" -prune -o -type d -print | \
        grep -E "(backend|frontend|cleaner|scripts)" | \
        head -10 | \
        sed 's|^'"$PROJECT_ROOT"'/||' | \
        nl
    
    echo
    read -p "Inserisci il percorso della directory (relativo o assoluto): " custom_path
    
    if [[ -z "$custom_path" ]]; then
        echo -e "${YELLOW}Nessuna directory specificata${NC}"
        return 0
    fi
    
    # Converti in percorso assoluto se relativo
    if [[ "$custom_path" == /* ]]; then
        target_dir="$custom_path"
    else
        target_dir="$PROJECT_ROOT/$custom_path"
    fi
    
    echo
    echo "1) 👀 Preview (dry-run)"
    echo "2) 🔄 Applica modifiche"
    echo
    read -p "Seleziona modalità (1-2): " mode_choice
    
    case $mode_choice in
        1)
            run_reorganizer "$target_dir" "--dry-run" "Directory personalizzata (Preview)"
            ;;
        2)
            run_reorganizer "$target_dir" "" "Directory personalizzata"
            ;;
        *)
            echo -e "${RED}Opzione non valida${NC}"
            ;;
    esac
}

# Menu principale
main() {
    while true; do
        clear
        print_header
        show_menu
        
        read -p "Seleziona un'opzione (0-6): " choice
        
        case $choice in
            1)
                echo -e "\n${YELLOW}🎯 MODALITÀ PREVIEW - BACKEND${NC}\n"
                run_reorganizer "$PROJECT_ROOT/backend/app" "--dry-run" "Backend App (Preview)"
                ;;
            2)
                echo -e "\n${GREEN}🎯 RIORGANIZZAZIONE BACKEND${NC}\n"
                run_reorganizer "$PROJECT_ROOT/backend/app" "" "Backend App"
                ;;
            3)
                analyze_frontend
                ;;
            4)
                custom_directory
                ;;
            5)
                echo
                echo "1) 👀 Preview intero progetto"
                echo "2) 🔄 Riorganizza intero progetto"
                echo
                read -p "Seleziona modalità (1-2): " project_mode
                
                case $project_mode in
                    1)
                        run_reorganizer "$PROJECT_ROOT" "--dry-run" "Intero Progetto (Preview)"
                        ;;
                    2)
                        run_reorganizer "$PROJECT_ROOT" "" "Intero Progetto"
                        ;;
                    *)
                        echo -e "${RED}Opzione non valida${NC}"
                        sleep 1
                        ;;
                esac
                ;;
            6)
                show_help
                read -p "Premi Enter per tornare al menu..."
                ;;
            0)
                echo -e "\n${GREEN}👋 Uscita dal sistema di riorganizzazione import${NC}"
                exit 0
                ;;
            *)
                echo -e "\n${RED}❌ Opzione non valida. Riprova.${NC}"
                sleep 1
                ;;
        esac
    done
}

# Verifica dipendenze
check_dependencies() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ Python3 non trovato. Installare Python3.${NC}"
        exit 1
    fi
    
    # Controlla se il modulo ast è disponibile (dovrebbe essere built-in)
    if ! python3 -c "import ast" 2>/dev/null; then
        echo -e "${RED}❌ Modulo Python 'ast' non disponibile${NC}"
        exit 1
    fi
}

# Entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi

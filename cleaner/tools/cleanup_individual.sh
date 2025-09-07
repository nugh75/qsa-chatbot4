#!/bin/bash

# 🗑️ Script Eliminazione Individuale File Inutilizzati
# Permette di scegliere singolarmente quale file rimuovere

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Emoji per output
SUCCESS="✅"
WARNING="⚠️ "
INFO="ℹ️ "
ERROR="❌"

# Print functions
print_success() { echo -e "${GREEN}${SUCCESS} $1${NC}"; }
print_warning() { echo -e "${YELLOW}${WARNING} $1${NC}"; }
print_info() { echo -e "${BLUE}${INFO} $1${NC}"; }
print_error() { echo -e "${RED}${ERROR} $1${NC}"; }

# Directory
PROJECT_ROOT="../.."
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Funzione per contare righe
count_lines() {
    local file="$1"
    if [ -f "$file" ]; then
        wc -l < "$file"
    else
        echo "0"
    fi
}

# Funzione principale per eliminazione individuale
cleanup_individual() {
    local target_dir="$1"
    local file_type="$2"
    
    echo ""
    echo "🎯 ELIMINAZIONE INDIVIDUALE - $file_type"
    echo "========================================"
    
    # Lista file candidati basata sul tipo
    local files_to_check=()
    
    if [ "$file_type" = "BACKEND" ]; then
        files_to_check=(
            "app/feedback.py"
            "app/feedback_routes.py"
            "app/websocket_handlers.py"
            "app/session.py"
            "app/middleware.py"
            "app/oauth.py"
            "app/security.py"
            "app/token_manager.py"
            "app/utils.py"
            "app/config_backup.py"
            "app/crypto_at_rest.py"
            "app/escrow.py"
        )
    elif [ "$file_type" = "FRONTEND" ]; then
        files_to_check=(
            "src/components/FileUpload_old.tsx"
            "src/components/FileUpload_new.tsx"
            "src/components/ChatInterface_backup.tsx"
            "src/components/AdminPanel_old.tsx"
            "src/utils/crypto.ts"
            "src/utils/encryption.ts"
            "src/utils/security.ts"
        )
    fi
    
    # Controlla quali file esistono
    local existing_files=()
    cd "$target_dir"
    
    for file in "${files_to_check[@]}"; do
        if [ -f "$file" ]; then
            existing_files+=("$file")
        fi
    done
    
    # Se nessun file esiste
    if [ ${#existing_files[@]} -eq 0 ]; then
        print_success "$file_type GIÀ PULITO!"
        echo "Non ci sono file inutilizzati da rimuovere."
        return 0
    fi
    
    print_info "Trovati ${#existing_files[@]} file candidati per rimozione:"
    echo ""
    
    local removed_count=0
    
    # Chiedi per ogni file singolarmente
    for file in "${existing_files[@]}"; do
        local lines=$(count_lines "$file")
        echo "📄 File: $file ($lines righe)"
        
        # Mostra anteprima se il file è piccolo
        if [ "$lines" -lt 20 ] && [ "$lines" -gt 0 ]; then
            echo "   📋 Anteprima:"
            head -5 "$file" | sed 's/^/      /'
            if [ "$lines" -gt 5 ]; then
                echo "      ... (altre $((lines-5)) righe)"
            fi
        fi
        
        echo -n "❓ Rimuovere questo file? [y/N]: "
        read -r confirm
        
        if [[ $confirm =~ ^[Yy]$ ]]; then
            if rm "$file" 2>/dev/null; then
                print_success "Rimosso: $file"
                removed_count=$((removed_count + 1))
            else
                print_error "Errore rimozione: $file"
            fi
        else
            print_info "Saltato: $file"
        fi
        
        echo ""
    done
    
    # Riepilogo
    echo "📊 RISULTATI:"
    echo "   • File processati: ${#existing_files[@]}"
    echo "   • File rimossi: $removed_count"
    echo "   • File mantenuti: $((${#existing_files[@]} - removed_count))"
    
    if [ $removed_count -gt 0 ]; then
        print_success "Eliminazione individuale completata!"
        echo ""
        print_info "💡 Suggerimenti:"
        echo "   • Testa l'applicazione per verificare che tutto funzioni"
        echo "   • Considera un commit Git:"
        echo "     git add -A && git commit -m '🧹 Rimossi $removed_count file selezionati manualmente'"
    else
        print_info "Nessun file eliminato."
    fi
}

# Menu scelta tipo
echo "🎯 ELIMINAZIONE INDIVIDUALE FILE"
echo "================================"
echo ""
echo "Seleziona il target:"
echo "  1) Backend (Python files)"
echo "  2) Frontend (React/TypeScript files)"  
echo "  3) Entrambi"
echo "  0) Esci"
echo ""
echo -n "Scelta [1-3]: "
read -r choice

case $choice in
    1)
        cleanup_individual "$BACKEND_DIR" "BACKEND"
        ;;
    2) 
        cleanup_individual "$FRONTEND_DIR" "FRONTEND"
        ;;
    3)
        cleanup_individual "$BACKEND_DIR" "BACKEND"
        echo ""
        echo "=========================================="
        echo ""
        cleanup_individual "$FRONTEND_DIR" "FRONTEND"
        ;;
    0)
        print_info "Operazione annullata."
        ;;
    *)
        print_error "Opzione non valida."
        exit 1
        ;;
esac

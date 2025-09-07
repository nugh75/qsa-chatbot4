#!/bin/bash

# 🗑️ Script Eliminazione Tutto Insieme 
# Rimuove automaticamente tutti i file inutilizzati in una volta

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
FIRE="🔥"

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

# Funzione per eliminazione di massa
cleanup_all() {
    local target_dir="$1"
    local file_type="$2"
    
    echo ""
    echo "${FIRE} ELIMINAZIONE MASSA - $file_type"
    echo "====================================="
    
    # Lista file candidati basata sul tipo
    local files_to_remove=()
    
    if [ "$file_type" = "BACKEND" ]; then
        files_to_remove=(
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
        files_to_remove=(
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
    local total_lines=0
    
    cd "$target_dir"
    
    for file in "${files_to_remove[@]}"; do
        if [ -f "$file" ]; then
            existing_files+=("$file")
            local lines=$(count_lines "$file")
            total_lines=$((total_lines + lines))
        fi
    done
    
    # Se nessun file esiste
    if [ ${#existing_files[@]} -eq 0 ]; then
        print_success "$file_type GIÀ PULITO!"
        echo "Non ci sono file inutilizzati da rimuovere."
        return 0
    fi
    
    # Mostra riepilogo prima dell'eliminazione
    print_warning "ATTENZIONE: Eliminazione di TUTTI i file candidati!"
    echo ""
    echo "📋 File da rimuovere (${#existing_files[@]} totali):"
    
    for file in "${existing_files[@]}"; do
        local lines=$(count_lines "$file")
        echo "  ${FIRE} $file ($lines righe)"
    done
    
    echo ""
    echo "📊 TOTALI:"
    echo "   • File da rimuovere: ${#existing_files[@]}"
    echo "   • Righe da eliminare: $total_lines"
    echo ""
    
    print_warning "Questa operazione NON è reversibile!"
    echo ""
    echo -n "❓ Procedere con l'eliminazione di TUTTI i file? [y/N]: "
    read -r confirm
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        print_info "Operazione annullata dall'utente."
        return 0
    fi
    
    # Eliminazione di massa
    print_info "Iniziando eliminazione di massa..."
    echo ""
    
    local removed_count=0
    local failed_count=0
    
    for file in "${existing_files[@]}"; do
        if rm "$file" 2>/dev/null; then
            print_success "✓ $file"
            removed_count=$((removed_count + 1))
        else
            print_error "✗ $file (errore)"
            failed_count=$((failed_count + 1))
        fi
    done
    
    echo ""
    echo "🎯 RISULTATI FINALI:"
    echo "   • File rimossi: $removed_count"
    echo "   • File falliti: $failed_count"  
    echo "   • Righe eliminate: $total_lines"
    
    if [ $removed_count -gt 0 ]; then
        print_success "Eliminazione di massa completata!"
        
        # Calcola riduzione percentuale se possibile
        local total_files_before=$(find . -name "*.py" -o -name "*.ts" -o -name "*.tsx" | wc -l)
        local reduction=$(echo "scale=1; ($removed_count / $total_files_before) * 100" | bc -l 2>/dev/null || echo "N/A")
        
        echo ""
        echo "📈 IMPATTO:"
        echo "   • Riduzione file: -$reduction%"
        echo "   • Codice eliminato: -$total_lines righe"
        echo "   • Manutenibilità: ⬆️ Migliorata"
        echo ""
        
        print_info "💡 Prossimi passi:"
        echo "   1. Testa l'applicazione completa"
        echo "   2. Esegui i test unitari se presenti"  
        echo "   3. Crea commit Git:"
        echo "      git add -A && git commit -m '${FIRE} Eliminazione massa: $removed_count file $file_type'"
    else
        print_warning "Nessun file eliminato."
    fi
    
    if [ $failed_count -gt 0 ]; then
        print_error "Attenzione: $failed_count file non sono stati rimossi."
        echo "Verifica i permessi o se i file sono in uso."
    fi
}

# Funzione per creare backup Git prima dell'eliminazione
create_backup() {
    print_info "Creando backup Git automatico..."
    
    if git add -A && git commit -m "🛡️  Backup pre-eliminazione massa $(date '+%Y-%m-%d %H:%M')"; then
        print_success "Backup Git creato!"
        return 0
    else
        print_warning "Impossibile creare backup Git (forse nessun cambiamento)"
        echo -n "Continuare senza backup? [y/N]: "
        read -r continue_without_backup
        
        if [[ ! $continue_without_backup =~ ^[Yy]$ ]]; then
            print_info "Operazione annullata."
            exit 0
        fi
    fi
}

# Menu principale
echo "${FIRE} ELIMINAZIONE DI MASSA"
echo "======================="
echo ""
print_warning "ATTENZIONE: Questo script rimuove AUTOMATICAMENTE tutti i file inutilizzati!"
echo ""
echo "Seleziona il target:"
echo "  1) Backend (Python files)"
echo "  2) Frontend (React/TypeScript files)"  
echo "  3) Entrambi (COMPLETA)"
echo "  4) Solo anteprima (nessuna eliminazione)"
echo "  0) Esci"
echo ""
echo -n "Scelta [1-4]: "
read -r choice

case $choice in
    1)
        create_backup
        cleanup_all "$BACKEND_DIR" "BACKEND"
        ;;
    2) 
        create_backup
        cleanup_all "$FRONTEND_DIR" "FRONTEND"
        ;;
    3)
        create_backup
        cleanup_all "$BACKEND_DIR" "BACKEND"
        echo ""
        echo "=========================================="
        echo ""
        cleanup_all "$FRONTEND_DIR" "FRONTEND"
        ;;
    4)
        echo ""
        print_info "MODALITÀ ANTEPRIMA - Nessun file verrà eliminato"
        echo ""
        
        # Mostra solo cosa verrebbe eliminato
        PREVIEW_MODE=true
        
        echo "📋 BACKEND - File da eliminare:"
        cd "$BACKEND_DIR"
        backend_files=("app/feedback.py" "app/feedback_routes.py" "app/websocket_handlers.py" "app/session.py" "app/middleware.py" "app/oauth.py" "app/security.py" "app/token_manager.py" "app/utils.py" "app/config_backup.py" "app/crypto_at_rest.py" "app/escrow.py")
        backend_count=0
        backend_lines=0
        
        for file in "${backend_files[@]}"; do
            if [ -f "$file" ]; then
                lines=$(count_lines "$file")
                echo "  📄 $file ($lines righe)"
                backend_count=$((backend_count + 1))
                backend_lines=$((backend_lines + lines))
            fi
        done
        
        echo ""
        echo "📋 FRONTEND - File da eliminare:"
        cd "$FRONTEND_DIR"
        frontend_files=("src/components/FileUpload_old.tsx" "src/components/FileUpload_new.tsx" "src/components/ChatInterface_backup.tsx" "src/components/AdminPanel_old.tsx" "src/utils/crypto.ts" "src/utils/encryption.ts" "src/utils/security.ts")
        frontend_count=0
        frontend_lines=0
        
        for file in "${frontend_files[@]}"; do
            if [ -f "$file" ]; then
                lines=$(count_lines "$file")
                echo "  📄 $file ($lines righe)"
                frontend_count=$((frontend_count + 1))
                frontend_lines=$((frontend_lines + lines))
            fi
        done
        
        echo ""
        echo "📊 TOTALI POTENZIALI:"
        echo "   • File Backend: $backend_count ($backend_lines righe)"
        echo "   • File Frontend: $frontend_count ($frontend_lines righe)"
        echo "   • TOTALE: $((backend_count + frontend_count)) file ($((backend_lines + frontend_lines)) righe)"
        ;;
    0)
        print_info "Operazione annullata."
        ;;
    *)
        print_error "Opzione non valida."
        exit 1
        ;;
esac

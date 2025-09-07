#!/bin/bash

# 🧹 Gestione File Temporanei e Backup
# Rimuove file temporanei, backup, cache e log obsoleti

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emoji per output
SUCCESS="✅"
WARNING="⚠️ "
INFO="ℹ️ "
ERROR="❌"
CLEAN="🧹"
TRASH="🗑️"
CLOCK="⏰"

# Print functions
print_success() { echo -e "${GREEN}${SUCCESS} $1${NC}"; }
print_warning() { echo -e "${YELLOW}${WARNING} $1${NC}"; }
print_info() { echo -e "${BLUE}${INFO} $1${NC}"; }
print_error() { echo -e "${RED}${ERROR} $1${NC}"; }

PROJECT_ROOT="../.."

# Funzione per trovare e catalogare file temporanei/backup
scan_temp_backup_files() {
    local scan_type="$1"  # "preview" o "count"
    
    cd "$PROJECT_ROOT"
    
    # Definisci pattern di ricerca per diverse categorie
    local backup_patterns=(
        "-name *.bk"
        "-name *.backup" 
        "-name *.old"
        "-name *_backup*"
        "-name *_old*"
        "-name *.orig"
        "-name *~"
    )
    
    local temp_patterns=(
        "-name *.tmp"
        "-name *.temp"
        "-name *.cache"
        "-name *~"
        "-name .*~"
        "-name .DS_Store"
        "-name Thumbs.db"
    )
    
    local log_patterns=(
        "-name *.log"
        "-name *.log.*"
        "-name npm-debug.log*"
        "-name yarn-debug.log*"
        "-name yarn-error.log*"
    )
    
    local node_cache_patterns=(
        "-name node_modules"
        "-name .npm"
        "-name .yarn-cache"
        "-name .pnpm-store"
    )
    
    local python_cache_patterns=(
        "-name __pycache__"
        "-name *.pyc"
        "-name *.pyo"
        "-name .pytest_cache"
        "-name .coverage"
    )
    
    # Arrays per memorizzare risultati
    declare -A file_categories
    declare -A file_counts
    declare -A file_sizes
    
    # Funzione helper per scansione
    scan_category() {
        local category="$1"
        local patterns=("${@:2}")
        
        local find_cmd="find . -type f \\( ${patterns[0]}"
        for ((i=1; i<${#patterns[@]}; i++)); do
            find_cmd+=" -o ${patterns[i]}"
        done
        find_cmd+=" \\) 2>/dev/null"
        
        local files
        files=$(eval "$find_cmd" | head -100)  # Limita output
        
        if [ -n "$files" ]; then
            local count=$(echo "$files" | wc -l)
            local size=0
            
            # Calcola dimensione totale se in modalità preview
            if [ "$scan_type" = "preview" ]; then
                while IFS= read -r file; do
                    if [ -f "$file" ]; then
                        local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
                        size=$((size + file_size))
                    fi
                done <<< "$files"
            fi
            
            file_categories["$category"]="$files"
            file_counts["$category"]="$count"
            file_sizes["$category"]="$size"
        else
            file_counts["$category"]="0"
            file_sizes["$category"]="0"
        fi
    }
    
    # Esegui scansioni
    print_info "Scansionando file temporanei e backup..."
    
    scan_category "BACKUP" "${backup_patterns[@]}"
    scan_category "TEMP" "${temp_patterns[@]}"
    scan_category "LOGS" "${log_patterns[@]}"
    scan_category "NODE_CACHE" "${node_cache_patterns[@]}"
    scan_category "PYTHON_CACHE" "${python_cache_patterns[@]}"
    
    # Mostra risultati
    if [ "$scan_type" = "preview" ]; then
        echo ""
        echo "${CLEAN} RISULTATI SCANSIONE COMPLETA"
        echo "====================================="
        
        local total_files=0
        local total_size=0
        
        for category in "BACKUP" "TEMP" "LOGS" "NODE_CACHE" "PYTHON_CACHE"; do
            local count=${file_counts[$category]}
            local size=${file_sizes[$category]}
            
            if [ "$count" -gt 0 ]; then
                total_files=$((total_files + count))
                total_size=$((total_size + size))
                
                # Converti dimensione in formato leggibile
                local size_human
                if [ "$size" -gt 1048576 ]; then
                    size_human="$(echo "scale=1; $size / 1048576" | bc -l)MB"
                elif [ "$size" -gt 1024 ]; then
                    size_human="$(echo "scale=1; $size / 1024" | bc -l)KB"
                else
                    size_human="${size}B"
                fi
                
                echo ""
                echo "📂 $category: $count file ($size_human)"
                
                # Mostra alcuni esempi
                local files=${file_categories[$category]}
                echo "$files" | head -5 | while IFS= read -r file; do
                    if [ -f "$file" ]; then
                        local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
                        local file_size_human
                        if [ "$file_size" -gt 1024 ]; then
                            file_size_human="$(echo "scale=1; $file_size / 1024" | bc -l)KB"
                        else
                            file_size_human="${file_size}B"
                        fi
                        echo "   📄 $file ($file_size_human)"
                    fi
                done
                
                if [ "$count" -gt 5 ]; then
                    echo "   ... e altri $((count - 5)) file"
                fi
            else
                echo "📂 $category: ${GREEN}${SUCCESS} Pulito${NC}"
            fi
        done
        
        # Totali
        echo ""
        echo "📊 TOTALI:"
        echo "   • File trovati: $total_files"
        if [ "$total_size" -gt 1048576 ]; then
            echo "   • Spazio recuperabile: $(echo "scale=1; $total_size / 1048576" | bc -l)MB"
        elif [ "$total_size" -gt 1024 ]; then
            echo "   • Spazio recuperabile: $(echo "scale=1; $total_size / 1024" | bc -l)KB"
        else
            echo "   • Spazio recuperabile: ${total_size}B"
        fi
    fi
    
    # Restituisci counts per uso esterno
    echo "${file_counts[BACKUP]} ${file_counts[TEMP]} ${file_counts[LOGS]} ${file_counts[NODE_CACHE]} ${file_counts[PYTHON_CACHE]}"
}

# Funzione per pulizia selettiva individuale
cleanup_individual_temp() {
    echo ""
    echo "${TRASH} PULIZIA INDIVIDUALE FILE TEMPORANEI"
    echo "==========================================="
    
    cd "$PROJECT_ROOT"
    
    # Trova tutti i file temporanei/backup
    local all_files=()
    
    # Backup files
    while IFS= read -r -d '' file; do
        all_files+=("$file")
    done < <(find . -type f \( -name "*.bk" -o -name "*.backup" -o -name "*.old" -o -name "*_backup*" -o -name "*_old*" -o -name "*.orig" -o -name "*~" \) -print0 2>/dev/null)
    
    # Temp files
    while IFS= read -r -d '' file; do
        all_files+=("$file")
    done < <(find . -type f \( -name "*.tmp" -o -name "*.temp" -o -name "*.cache" -o -name ".*~" -o -name ".DS_Store" -o -name "Thumbs.db" \) -print0 2>/dev/null)
    
    # Log files (older than 7 days)
    while IFS= read -r -d '' file; do
        all_files+=("$file")
    done < <(find . -type f \( -name "*.log" -o -name "*.log.*" \) -mtime +7 -print0 2>/dev/null)
    
    if [ ${#all_files[@]} -eq 0 ]; then
        print_success "Nessun file temporaneo/backup trovato!"
        return 0
    fi
    
    print_info "Trovati ${#all_files[@]} file temporanei/backup"
    echo ""
    
    local removed_count=0
    
    for file in "${all_files[@]}"; do
        # Determina categoria file
        local category=""
        case "$file" in
            *.bk|*.backup|*.old|*_backup*|*_old*|*.orig|*~) category="BACKUP" ;;
            *.tmp|*.temp|*.cache|.*~|.DS_Store|Thumbs.db) category="TEMP" ;;
            *.log|*.log.*) category="LOG" ;;
            *) category="OTHER" ;;
        esac
        
        # Mostra info file
        local file_size="0B"
        if [ -f "$file" ]; then
            local size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
            if [ "$size_bytes" -gt 1024 ]; then
                file_size="$(echo "scale=1; $size_bytes / 1024" | bc -l)KB"
            else
                file_size="${size_bytes}B"
            fi
        fi
        
        echo "📄 [$category] $file ($file_size)"
        
        # Mostra anteprima per file piccoli non binari
        if [ "$size_bytes" -lt 500 ] && [ "$size_bytes" -gt 0 ]; then
            if file "$file" 2>/dev/null | grep -q text; then
                echo "   📋 Anteprima:"
                head -3 "$file" 2>/dev/null | sed 's/^/      /' || echo "      (contenuto non leggibile)"
            fi
        fi
        
        echo -n "❓ Rimuovere questo file? [y/N]: "
        read -r confirm
        
        if [[ $confirm =~ ^[Yy]$ ]]; then
            if rm -f "$file" 2>/dev/null; then
                print_success "✓ Rimosso"
                removed_count=$((removed_count + 1))
            else
                print_error "✗ Errore rimozione"
            fi
        else
            print_info "⏭️  Saltato"
        fi
        
        echo ""
    done
    
    print_info "📊 File rimossi: $removed_count/${#all_files[@]}"
    
    if [ $removed_count -gt 0 ]; then
        print_success "Pulizia individuale completata!"
    fi
}

# Funzione per pulizia automatica tutti insieme
cleanup_all_temp() {
    echo ""
    echo "${CLEAN} PULIZIA AUTOMATICA COMPLETA"
    echo "================================="
    
    cd "$PROJECT_ROOT"
    
    print_warning "ATTENZIONE: Questa operazione rimuoverà TUTTI i file temporanei e backup!"
    echo ""
    
    # Mostra anteprima
    scan_temp_backup_files "preview" > /dev/null
    
    echo ""
    echo -n "❓ Procedere con la pulizia automatica completa? [y/N]: "
    read -r confirm
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        print_info "Operazione annullata."
        return 0
    fi
    
    print_info "Iniziando pulizia automatica..."
    echo ""
    
    local total_removed=0
    
    # Backup files
    echo "🔄 Rimuovendo file backup..."
    local backup_removed=0
    while IFS= read -r file; do
        if [ -f "$file" ] && rm "$file" 2>/dev/null; then
            echo "   ✓ $file"
            backup_removed=$((backup_removed + 1))
        fi
    done < <(find . -type f \( -name "*.bk" -o -name "*.backup" -o -name "*.old" -o -name "*_backup*" -o -name "*_old*" -o -name "*.orig" -o -name "*~" \) 2>/dev/null)
    
    # Temp files
    echo "🔄 Rimuovendo file temporanei..."
    local temp_removed=0
    while IFS= read -r file; do
        if [ -f "$file" ] && rm "$file" 2>/dev/null; then
            echo "   ✓ $file"
            temp_removed=$((temp_removed + 1))
        fi
    done < <(find . -type f \( -name "*.tmp" -o -name "*.temp" -o -name "*.cache" -o -name ".*~" -o -name ".DS_Store" -o -name "Thumbs.db" \) 2>/dev/null)
    
    # Log files older than 7 days
    echo "🔄 Rimuovendo log obsoleti (>7 giorni)..."
    local log_removed=0
    while IFS= read -r file; do
        if [ -f "$file" ] && rm "$file" 2>/dev/null; then
            echo "   ✓ $file"
            log_removed=$((log_removed + 1))
        fi
    done < <(find . -type f \( -name "*.log" -o -name "*.log.*" \) -mtime +7 2>/dev/null)
    
    # Cache directories (empty ones)
    echo "🔄 Rimuovendo directory cache vuote..."
    local cache_dirs_removed=0
    while IFS= read -r dir; do
        if [ -d "$dir" ] && [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
            if rmdir "$dir" 2>/dev/null; then
                echo "   ✓ $dir/"
                cache_dirs_removed=$((cache_dirs_removed + 1))
            fi
        fi
    done < <(find . -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".coverage" -o -name "node_modules" -o -name ".npm" -o -name ".yarn-cache" \) 2>/dev/null)
    
    total_removed=$((backup_removed + temp_removed + log_removed))
    
    echo ""
    echo "🎯 RISULTATI FINALI:"
    echo "   • File backup rimossi: $backup_removed"
    echo "   • File temporanei rimossi: $temp_removed"  
    echo "   • Log obsoleti rimossi: $log_removed"
    echo "   • Directory cache rimosse: $cache_dirs_removed"
    echo "   • TOTALE FILE: $total_removed"
    
    if [ $total_removed -gt 0 ]; then
        print_success "Pulizia automatica completata!"
        echo ""
        print_info "💡 Vantaggi ottenuti:"
        echo "   • Spazio disco liberato"
        echo "   • Struttura progetto più pulita"  
        echo "   • Ridotto rumore nella navigazione"
        echo ""
        print_info "Considera un commit:"
        echo "   git add -A && git commit -m '${CLEAN} Pulizia automatica: $total_removed file temp/backup rimossi'"
    else
        print_info "Progetto già pulito - nessun file rimosso."
    fi
}

# Menu principale
echo "${CLEAN} GESTIONE FILE TEMPORANEI E BACKUP"
echo "===================================="
echo ""

# Esegui scansione preliminare
counts=$(scan_temp_backup_files "count")
read -r backup_count temp_count log_count node_count python_count <<< "$counts"
total_count=$((backup_count + temp_count + log_count + node_count + python_count))

if [ $total_count -eq 0 ]; then
    print_success "Progetto già pulito - nessun file temporaneo/backup trovato!"
    exit 0
fi

print_info "Trovati $total_count file temporanei/backup"
echo ""
echo "Seleziona operazione:"
echo "  1) ${TRASH} Elimina uno per uno (selezione manuale)"
echo "  2) ${CLEAN} Elimina tutto insieme (automatico)"
echo "  3) ${INFO} Solo anteprima (nessuna eliminazione)"
echo "  4) ${CLOCK} Pulizia mirata (solo log vecchi)"
echo "  0) Esci"
echo ""
echo -n "Scelta [1-4]: "
read -r choice

case $choice in
    1)
        cleanup_individual_temp
        ;;
    2)
        cleanup_all_temp
        ;;
    3)
        scan_temp_backup_files "preview"
        ;;
    4)
        print_info "Pulizia mirata - Solo log files vecchi (>7 giorni)"
        cd "$PROJECT_ROOT"
        old_logs=$(find . -type f \( -name "*.log" -o -name "*.log.*" \) -mtime +7 2>/dev/null)
        
        if [ -z "$old_logs" ]; then
            print_success "Nessun log vecchio trovato!"
        else
            echo ""
            echo "📋 Log files da rimuovere:"
            echo "$old_logs" | sed 's/^/   📄 /'
            echo ""
            echo -n "❓ Rimuovere questi log files? [y/N]: "
            read -r confirm
            
            if [[ $confirm =~ ^[Yy]$ ]]; then
                removed=0
                echo "$old_logs" | while read -r logfile; do
                    if [ -f "$logfile" ] && rm "$logfile" 2>/dev/null; then
                        echo "   ✓ $logfile"
                        removed=$((removed + 1))
                    fi
                done
                print_success "Pulizia log completata!"
            else
                print_info "Operazione annullata."
            fi
        fi
        ;;
    0)
        print_info "Operazione annullata."
        ;;
    *)
        print_error "Opzione non valida."
        exit 1
        ;;
esac

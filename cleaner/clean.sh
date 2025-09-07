#!/bin/bash

# 🧹 QSA Chatbot Cleaner - Interfaccia Principale
# Sistema completo di analisi e pulizia per backend e frontend

set -e

# Configurazione
PROJECT_ROOT="/mnt/git/qsa-chatbot4"
CLEANER_DIR="$PROJECT_ROOT/cleaner"
TOOLS_DIR="$CLEANER_DIR/tools"
DOCS_DIR="$CLEANER_DIR/docs"
REPORTS_DIR="$CLEANER_DIR/reports"
ANALYSIS_DIR="$REPORTS_DIR/analysis"

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Funzioni di utilità
print_header() {
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}$(printf '%.0s=' $(seq 1 ${#1}))${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Verifica ambiente
check_environment() {
    cd "$PROJECT_ROOT" || {
        print_error "Impossibile accedere alla directory del progetto: $PROJECT_ROOT"
        exit 1
    }
    
    if [ ! -d "$CLEANER_DIR" ]; then
        print_error "Directory cleaner non trovata: $CLEANER_DIR"
        exit 1
    fi
}

# Menu principale
show_main_menu() {
    clear
    echo -e "${PURPLE}"
    echo "🧹 QSA CHATBOT CLEANER v1.0"
    echo "============================"
    echo -e "${NC}"
    echo ""
    print_info "Directory progetto: $PROJECT_ROOT"
    echo ""
    echo "📋 MENU PRINCIPALE:"
    echo ""
    echo "📊 ANALISI:"
    echo "  1) Analizza dipendenze Backend (Python)"
    echo "  2) Analizza dipendenze Frontend (React/TS)"
    echo "  3) Analisi completa (Backend + Frontend)"
    echo "  4) Mostra statistiche progetti"
    echo ""
    echo "🗑️  PULIZIA:"
    echo "  5) Pulisci Backend (automatico)"
    echo "  6) Pulisci Frontend (automatico)"
    echo "  7) Pulizia completa (Backend + Frontend)"
    echo "  8) Elimina file uno per uno (manuale)"
    echo "  9) Elimina tutto insieme (massa)"
    echo "  10) Gestisci file temporanei/backup"
    echo ""
    echo "📄 REPORT:"
    echo "  11) Visualizza ultimo report Backend"
    echo "  12) Visualizza ultimo report Frontend"
    echo "  13) Confronta report (prima/dopo pulizia)"
    echo "  14) Esporta report completo"
    echo ""
    echo "🛠️  MANUTENZIONE:"
    echo "  15) Aggiorna analizzatori"
    echo "  16) Verifica integrità progetto"
    echo "  17) Backup completo prima pulizia"
    echo ""
    echo "❓ AIUTO:"
    echo "  18) Documentazione"
    echo "  19) Esempi utilizzo"
    echo ""
    echo "  0) Esci"
    echo ""
    echo -n "Scegli un'opzione (0-19): "
}

# Funzione analisi backend
analyze_backend() {
    print_header "🐍 ANALISI BACKEND PYTHON"
    echo ""
    
    if [ ! -f "$TOOLS_DIR/analyze_imports.py" ]; then
        print_error "Analizzatore Python non trovato in $TOOLS_DIR"
        return 1
    fi
    
    print_info "Analizzando backend/app/..."
    
    if python "$TOOLS_DIR/analyze_imports.py" "$PROJECT_ROOT/backend/app" --format json --output "$ANALYSIS_DIR/back_data_analysis.json"; then
        print_success "Analisi backend completata!"
        
        # Mostra statistiche rapide
        if command -v jq >/dev/null 2>&1; then
            echo ""
            echo "📊 STATISTICHE RAPIDE:"
            jq -r '"📁 File totali: " + (.summary.total_files | tostring) + "\n🗑️  File inutilizzati: " + (.summary.unused_files_count | tostring) + "\n💾 Riduzione possibile: " + ((.summary.unused_files_count * 100.0 / .summary.total_files) | floor | tostring) + "%"' "$ANALYSIS_DIR/back_data_analysis.json"
        fi
    else
        print_error "Errore durante l'analisi backend"
        return 1
    fi
}

# Funzione analisi frontend
analyze_frontend() {
    print_header "⚛️  ANALISI FRONTEND REACT/TS"
    echo ""
    
    if [ ! -f "$TOOLS_DIR/analyze_react_imports.cjs" ]; then
        print_error "Analizzatore React non trovato in $TOOLS_DIR"
        return 1
    fi
    
    print_info "Analizzando frontend/src/..."
    
    if node "$TOOLS_DIR/analyze_react_imports.cjs" "$PROJECT_ROOT/frontend/src" --format json --output "$ANALYSIS_DIR/front_data_analysis.json" 2>/dev/null; then
        print_success "Analisi frontend completata!"
        
        # Mostra statistiche rapide
        if command -v jq >/dev/null 2>&1; then
            echo ""
            echo "📊 STATISTICHE RAPIDE:"
            jq -r '"📁 File totali: " + (.summary.total_files | tostring) + "\n🗑️  File inutilizzati: " + (.summary.unused_files_count | tostring) + "\n💾 Riduzione possibile: " + ((.summary.unused_files_count * 100.0 / .summary.total_files) | floor | tostring) + "%"' "$ANALYSIS_DIR/front_data_analysis.json"
        fi
    else
        print_error "Errore durante l'analisi frontend"
        return 1
    fi
}

# Analisi completa
analyze_complete() {
    print_header "🔍 ANALISI COMPLETA PROGETTO"
    echo ""
    
    print_info "Eseguendo analisi backend..."
    analyze_backend
    echo ""
    
    print_info "Eseguendo analisi frontend..."
    analyze_frontend
    echo ""
    
    # Statistiche combinate
    if command -v jq >/dev/null 2>&1 && [ -f "$ANALYSIS_DIR/back_data_analysis.json" ] && [ -f "$ANALYSIS_DIR/front_data_analysis.json" ]; then
        echo ""
        print_header "📊 STATISTICHE PROGETTO COMPLETE"
        
        BACKEND_TOTAL=$(jq '.summary.total_files' "$ANALYSIS_DIR/back_data_analysis.json")
        BACKEND_UNUSED=$(jq '.summary.unused_files_count' "$ANALYSIS_DIR/back_data_analysis.json")
        FRONTEND_TOTAL=$(jq '.summary.total_files' "$ANALYSIS_DIR/front_data_analysis.json")
        FRONTEND_UNUSED=$(jq '.summary.unused_files_count' "$ANALYSIS_DIR/front_data_analysis.json")
        
        TOTAL_FILES=$((BACKEND_TOTAL + FRONTEND_TOTAL))
        TOTAL_UNUSED=$((BACKEND_UNUSED + FRONTEND_UNUSED))
        REDUCTION_PERCENT=$((TOTAL_UNUSED * 100 / TOTAL_FILES))
        
        echo ""
        printf "%-15s | %-12s | %-12s | %-10s\n" "Componente" "File Totali" "Inutilizzati" "Riduzione"
        printf "%-15s-+-%-12s-+-%-12s-+-%-10s\n" "---------------" "------------" "------------" "----------"
        printf "%-15s | %-12d | %-12d | %-9d%%\n" "Backend" "$BACKEND_TOTAL" "$BACKEND_UNUSED" $((BACKEND_UNUSED * 100 / BACKEND_TOTAL))
        printf "%-15s | %-12d | %-12d | %-9d%%\n" "Frontend" "$FRONTEND_TOTAL" "$FRONTEND_UNUSED" $((FRONTEND_UNUSED * 100 / FRONTEND_TOTAL))
        printf "%-15s-+-%-12s-+-%-12s-+-%-10s\n" "---------------" "------------" "------------" "----------"
        printf "%-15s | %-12d | %-12d | %-9d%%\n" "TOTALE" "$TOTAL_FILES" "$TOTAL_UNUSED" "$REDUCTION_PERCENT"
    fi
    
    print_success "Analisi completa terminata!"
}

# Pulizia backend
cleanup_backend() {
    print_header "🧹 PULIZIA BACKEND"
    echo ""
    
    if [ ! -f "$TOOLS_DIR/cleanup_backend.sh" ]; then
        print_error "Script pulizia backend non trovato"
        return 1
    fi
    
    print_warning "Questa operazione rimuoverà file dal backend!"
    echo -n "Continuare? (y/N): "
    read -r confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        chmod +x "$TOOLS_DIR/cleanup_backend.sh"
        "$TOOLS_DIR/cleanup_backend.sh"
    else
        print_info "Pulizia backend annullata"
    fi
}

# Pulizia frontend
cleanup_frontend() {
    print_header "🧹 PULIZIA FRONTEND"
    echo ""
    
    if [ ! -f "$TOOLS_DIR/cleanup_frontend.sh" ]; then
        print_error "Script pulizia frontend non trovato"
        return 1
    fi
    
    print_warning "Questa operazione rimuoverà file dal frontend!"
    echo -n "Continuare? (y/N): "
    read -r confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        chmod +x "$TOOLS_DIR/cleanup_frontend.sh"
        "$TOOLS_DIR/cleanup_frontend.sh"
    else
        print_info "Pulizia frontend annullata"
    fi
}

# Trova file backup/temporanei
find_backup_files() {
    print_header "🔍 RICERCA FILE BACKUP/TEMPORANEI"
    echo ""
    
    print_info "Cercando file backup nel progetto..."
    
    echo ""
    echo "📁 FILE BACKUP (.bk, .backup, .old):"
    find "$PROJECT_ROOT" -name "*.bk" -o -name "*.backup" -o -name "*.old" -o -name "*_backup*" -o -name "*_old*" 2>/dev/null | head -20
    
    echo ""
    echo "🗂️  FILE TEMPORANEI (.tmp, .temp, ~):"
    find "$PROJECT_ROOT" -name "*.tmp" -o -name "*.temp" -o -name "*~" -o -name ".*~" 2>/dev/null | head -20
    
    echo ""
    echo "📄 FILE LOG VECCHI (*.log oltre 7 giorni):"
    find "$PROJECT_ROOT" -name "*.log" -mtime +7 2>/dev/null | head -10
    
    echo ""
    echo "🗃️  DIRECTORY CACHE/BUILD:"
    find "$PROJECT_ROOT" -type d \( -name "__pycache__" -o -name "node_modules" -o -name ".cache" -o -name "dist" -o -name "build" \) 2>/dev/null | head -10
    
    echo ""
    echo -n "Rimuovere automaticamente i file backup/temp trovati? (y/N): "
    read -r cleanup_confirm
    
    if [[ $cleanup_confirm =~ ^[Yy]$ ]]; then
        print_info "Rimuovendo file backup/temporanei..."
        
        # Rimuovi file backup/old (con conferma)
        find "$PROJECT_ROOT" \( -name "*.bk" -o -name "*.backup" -o -name "*.old" -o -name "*_backup*" -o -name "*_old*" \) -delete 2>/dev/null
        
        # Rimuovi file temp
        find "$PROJECT_ROOT" \( -name "*.tmp" -o -name "*.temp" -o -name "*~" -o -name ".*~" \) -delete 2>/dev/null
        
        # Rimuovi log vecchi
        find "$PROJECT_ROOT" -name "*.log" -mtime +7 -delete 2>/dev/null
        
        print_success "File backup/temporanei rimossi!"
    else
        print_info "Pulizia annullata"
    fi
}

# Visualizza report
show_report() {
    local report_type="$1"
    local file_path=""
    
    case $report_type in
        "backend")
            file_path="$ANALYSIS_DIR/back_data_analysis.json"
            print_header "📊 REPORT BACKEND"
            ;;
        "frontend")
            file_path="$ANALYSIS_DIR/front_data_analysis.json"
            print_header "📊 REPORT FRONTEND"
            ;;
        *)
            print_error "Tipo report non valido"
            return 1
            ;;
    esac
    
    if [ ! -f "$file_path" ]; then
        print_error "Report non trovato: $file_path"
        print_info "Esegui prima l'analisi per generare il report"
        return 1
    fi
    
    if command -v jq >/dev/null 2>&1; then
        echo ""
        echo "📅 Data analisi: $(jq -r '.analysis_date' "$file_path")"
        echo "📁 Directory: $(jq -r '.directory' "$file_path")"
        echo ""
        
        jq -r '
        "📊 STATISTICHE:",
        "  • File totali: " + (.summary.total_files | tostring),
        "  • File inutilizzati: " + (.summary.unused_files_count | tostring),
        "  • Percentuale inutilizzata: " + ((.summary.unused_files_count * 100.0 / .summary.total_files) | floor | tostring) + "%"
        ' "$file_path"
        
        echo ""
        echo "🗑️  FILE INUTILIZZATI:"
        jq -r '.summary.unused_files[]' "$file_path" | head -10 | sed 's/^/  • /'
        
        local unused_count=$(jq '.summary.unused_files | length' "$file_path")
        if [ "$unused_count" -gt 10 ]; then
            echo "  ... e altri $((unused_count - 10)) file"
        fi
        
    else
        print_warning "jq non installato, mostro report grezzo:"
        cat "$file_path"
    fi
}

# Documentazione
show_documentation() {
    print_header "📚 DOCUMENTAZIONE CLEANER"
    echo ""
    
    if [ -f "$DOCS_DIR/README_analyze_imports.md" ]; then
        print_info "Manuale analizzatore Python: $DOCS_DIR/README_analyze_imports.md"
    fi
    
    if [ -f "$DOCS_DIR/README_analyze_react_imports.md" ]; then
        print_info "Manuale analizzatore React: $DOCS_DIR/README_analyze_react_imports.md"
    fi
    
    echo ""
    echo "📖 COMANDI RAPIDI:"
    echo ""
    echo "  # Analisi diretta backend"
    echo "  python cleaner/tools/analyze_imports.py backend/app/"
    echo ""
    echo "  # Analisi diretta frontend"
    echo "  node cleaner/tools/analyze_react_imports.cjs frontend/src/"
    echo ""
    echo "  # Visualizza report"
    echo "  jq '.summary' cleaner/reports/analysis/back_data_analysis.json"
    echo ""
    
    print_info "Premi ENTER per continuare..."
    read -r
}

# Funzione eliminazione individuale
cleanup_individual() {
    print_header "🎯 ELIMINAZIONE INDIVIDUALE"
    echo ""
    
    if [ ! -f "$TOOLS_DIR/cleanup_individual.sh" ]; then
        print_error "Script eliminazione individuale non trovato"
        return 1
    fi
    
    print_info "Avviando modalità eliminazione individuale..."
    echo ""
    
    cd "$TOOLS_DIR" || {
        print_error "Impossibile accedere a $TOOLS_DIR"
        return 1
    }
    
    if [ -x "cleanup_individual.sh" ]; then
        "./cleanup_individual.sh"
    else
        chmod +x "cleanup_individual.sh"
        "./cleanup_individual.sh"
    fi
}

# Funzione eliminazione di massa
cleanup_mass() {
    print_header "🔥 ELIMINAZIONE DI MASSA"
    echo ""
    
    if [ ! -f "$TOOLS_DIR/cleanup_mass.sh" ]; then
        print_error "Script eliminazione di massa non trovato"
        return 1
    fi
    
    print_warning "ATTENZIONE: Eliminazione automatica di tutti i file inutilizzati!"
    echo ""
    print_info "Avviando modalità eliminazione di massa..."
    echo ""
    
    cd "$TOOLS_DIR" || {
        print_error "Impossibile accedere a $TOOLS_DIR"
        return 1
    }
    
    if [ -x "cleanup_mass.sh" ]; then
        "./cleanup_mass.sh"
    else
        chmod +x "cleanup_mass.sh"
        "./cleanup_mass.sh"
    fi
}

# Funzione gestione file temporanei/backup
cleanup_temp_backup() {
    print_header "🧹 GESTIONE FILE TEMPORANEI E BACKUP"
    echo ""
    
    if [ ! -f "$TOOLS_DIR/cleanup_temp_backup.sh" ]; then
        print_error "Script gestione temp/backup non trovato"
        return 1
    fi
    
    print_info "Avviando gestione file temporanei e backup..."
    echo ""
    
    cd "$TOOLS_DIR" || {
        print_error "Impossibile accedere a $TOOLS_DIR"
        return 1
    }
    
    if [ -x "cleanup_temp_backup.sh" ]; then
        "./cleanup_temp_backup.sh"
    else
        chmod +x "cleanup_temp_backup.sh"
        "./cleanup_temp_backup.sh"
    fi
}

# Menu loop principale
main_loop() {
    while true; do
        show_main_menu
        read -r choice
        
        echo ""
        case $choice in
            1) analyze_backend ;;
            2) analyze_frontend ;;
            3) analyze_complete ;;
            4) 
                if [ -f "$ANALYSIS_DIR/back_data_analysis.json" ] && [ -f "$ANALYSIS_DIR/front_data_analysis.json" ]; then
                    analyze_complete
                else
                    print_warning "Report non disponibili. Esegui prima l'analisi completa."
                fi
                ;;
            5) cleanup_backend ;;
            6) cleanup_frontend ;;
            7) 
                cleanup_backend
                echo ""
                cleanup_frontend
                ;;
            8) cleanup_individual ;;
            9) cleanup_mass ;;
            10) cleanup_temp_backup ;;
            11) show_report "backend" ;;
            12) show_report "frontend" ;;
            13) 
                print_info "Funzione confronto report in sviluppo..."
                ;;
            14) 
                print_info "Export report completo in sviluppo..."
                ;;
            15) 
                print_info "Aggiornamento analizzatori in sviluppo..."
                ;;
            16) 
                print_info "Verifica integrità in sviluppo..."
                ;;
            17) 
                print_info "Creando backup Git..."
                git add -A && git commit -m "🧹 Backup automatico cleaner $(date)"
                print_success "Backup creato!"
                ;;
            18) show_documentation ;;
            19) 
                print_info "Esempi utilizzo disponibili nella documentazione"
                ;;
            0) 
                print_success "Arrivederci!"
                exit 0
                ;;
            *) 
                print_error "Opzione non valida. Riprova."
                ;;
        esac
        
        if [ "$choice" != "0" ]; then
            echo ""
            print_info "Premi ENTER per continuare..."
            read -r
        fi
    done
}

# Script principale
main() {
    check_environment
    main_loop
}

# Esegui solo se chiamato direttamente
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi

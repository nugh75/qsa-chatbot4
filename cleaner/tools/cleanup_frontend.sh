#!/bin/bash

# 🧹 Script Pulizia Automatica Frontend React QSA Chatbot
# Rimuove file React/TypeScript identificati come sicuramente inutilizzati

set -e  # Esci in caso di errore

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../" && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SRC_DIR="$FRONTEND_DIR/src"

echo "🧹 PULIZIA FRONTEND REACT QSA CHATBOT"
echo "====================================="
echo ""

# Verifica che siamo nella directory corretta
if [ ! -d "$SRC_DIR" ]; then
    echo "❌ Errore: Directory $SRC_DIR non trovata"
    exit 1
fi

cd "$FRONTEND_DIR"

echo "📍 Directory di lavoro: $(pwd)"
echo ""

# Lista file da rimuovere (Fase 1 - Sicuri)
FILES_TO_REMOVE=(
    "src/components/icons/ArenaIcon.tsx"
    "src/components/icons/GuideIcon.tsx"
    "src/AppRouter.tsx"
    "src/FeedbackStats.tsx"
    "src/components/EmbeddingModelSelector.tsx"
    "src/components/FeedbackResults.tsx"
    "src/components/FeedbackSurvey.tsx"
)

# Lista file opzionali da rimuovere (Fase 2)
OPTIONAL_FILES=(
    "src/components/FileUpload_old.tsx"
    "src/components/FileUpload_new.tsx"
)

# Controlla quali file esistono effettivamente per Fase 1
EXISTING_SAFE_FILES=()
TOTAL_LINES_SAFE=0
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        EXISTING_SAFE_FILES+=("$file")
        LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
        TOTAL_LINES_SAFE=$((TOTAL_LINES_SAFE + LINES))
    fi
done

# Controlla file opzionali
EXISTING_OPTIONAL_FILES=()
TOTAL_LINES_OPTIONAL=0
for file in "${OPTIONAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        EXISTING_OPTIONAL_FILES+=("$file")
        LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
        TOTAL_LINES_OPTIONAL=$((TOTAL_LINES_OPTIONAL + LINES))
    fi
done

# Se non ci sono file da rimuovere, esci subito
if [ ${#EXISTING_SAFE_FILES[@]} -eq 0 ] && [ ${#EXISTING_OPTIONAL_FILES[@]} -eq 0 ]; then
    echo "✅ FRONTEND GIÀ PULITO!"
    echo "======================"
    echo "Non ci sono file inutilizzati da rimuovere."
    echo "Tutti i file target sono già stati eliminati in precedenza."
    echo ""
    echo "💡 Per una nuova analisi completa, usa:"
    echo "   node ../cleaner/tools/analyze_react_imports.cjs src/"
    exit 0
fi

if [ ${#EXISTING_SAFE_FILES[@]} -gt 0 ]; then
    echo "📋 FASE 1 - File sicuri trovati da rimuovere:"
    for file in "${EXISTING_SAFE_FILES[@]}"; do
        LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
        echo "  ✓ $file ($LINES righe)"
    done
    echo ""
fi

if [ ${#EXISTING_OPTIONAL_FILES[@]} -gt 0 ]; then
    echo "📋 FASE 2 - File opzionali trovati:"
    for file in "${EXISTING_OPTIONAL_FILES[@]}"; do
        LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
        echo "  ⚪ $file ($LINES righe)"
    done
    echo ""
fi

echo ""
echo "📊 Riepilogo:"
echo "   • Fase 1 (sicura): ${#EXISTING_SAFE_FILES[@]} file, ~$TOTAL_LINES_SAFE righe"
echo "   • Fase 2 (opzionale): ${#EXISTING_OPTIONAL_FILES[@]} file, ~$TOTAL_LINES_OPTIONAL righe"
echo ""

# Selezione fase basata sui file disponibili
if [ ${#EXISTING_SAFE_FILES[@]} -gt 0 ] && [ ${#EXISTING_OPTIONAL_FILES[@]} -gt 0 ]; then
    # Entrambe le fasi disponibili
    echo "🤔 Quale fase eseguire?"
    echo "   1) Solo Fase 1 (sicura - ${#EXISTING_SAFE_FILES[@]} file)"
    echo "   2) Entrambe le fasi (include ${#EXISTING_OPTIONAL_FILES[@]} file backup)"
    echo "   3) Annulla"
    echo ""
    read -p "Scegli (1/2/3): " -n 1 -r
    echo

    case $REPLY in
        1)
            EXECUTE_PHASE2=false
            echo "✅ Eseguirò solo la Fase 1 (sicura)"
            ;;
        2)
            EXECUTE_PHASE2=true
            echo "✅ Eseguirò entrambe le fasi"
            ;;
        3|*)
            echo "❌ Operazione annullata"
            exit 0
            ;;
    esac
elif [ ${#EXISTING_SAFE_FILES[@]} -gt 0 ]; then
    # Solo fase 1 disponibile
    echo "🤔 Procedere con la pulizia dei ${#EXISTING_SAFE_FILES[@]} file sicuri?"
    read -p "Continuare? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Operazione annullata"
        exit 0
    fi
    EXECUTE_PHASE2=false
elif [ ${#EXISTING_OPTIONAL_FILES[@]} -gt 0 ]; then
    # Solo fase 2 disponibile
    echo "🤔 Procedere con la pulizia dei ${#EXISTING_OPTIONAL_FILES[@]} file backup?"
    read -p "Continuare? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Operazione annullata"
        exit 0
    fi
    EXECUTE_PHASE2=true
fi

echo ""
echo "🚀 Avvio pulizia..."
echo ""

# Backup Git automatico
echo "💾 Creazione backup Git..."
if git diff --staged --quiet && git diff --quiet; then
    echo "  (nessun cambio da committare)"
else
    git add -A && git commit -m "🧹 Backup automatico prima pulizia frontend" || echo "  (commit fallito, continuo)"
fi

# FASE 1: Rimuovi file sicuri
if [ ${#EXISTING_SAFE_FILES[@]} -gt 0 ]; then
    echo ""
    echo "🗑️  FASE 1 - Rimozione file sicuri..."
    REMOVED_SAFE=0
    for file in "${EXISTING_SAFE_FILES[@]}"; do
        echo "🗑️  Rimuovo $file..."
        rm "$file"
        REMOVED_SAFE=$((REMOVED_SAFE + 1))
    done
else
    REMOVED_SAFE=0
fi

# FASE 2: Rimuovi file opzionali (se richiesto)
REMOVED_OPTIONAL=0
if [ "$EXECUTE_PHASE2" = true ] && [ ${#EXISTING_OPTIONAL_FILES[@]} -gt 0 ]; then
    echo ""
    echo "🗑️  FASE 2 - Rimozione file opzionali..."
    for file in "${EXISTING_OPTIONAL_FILES[@]}"; do
        echo "🗑️  Rimuovo $file..."
        rm "$file"
        REMOVED_OPTIONAL=$((REMOVED_OPTIONAL + 1))
    done
fi

echo ""
echo "✅ PULIZIA COMPLETATA!"
echo "====================="
echo "📊 File rimossi Fase 1: $REMOVED_SAFE"
if [ "$EXECUTE_PHASE2" = true ]; then
    echo "📊 File rimossi Fase 2: $REMOVED_OPTIONAL"
fi
echo "📏 Righe eliminate: ~$((TOTAL_LINES_SAFE + (EXECUTE_PHASE2 && echo $TOTAL_LINES_OPTIONAL || echo 0)))"
echo ""

# Verifica che il progetto compili ancora
echo "🔍 Verifica build TypeScript..."
if npm run build >/dev/null 2>&1; then
    echo "✅ Build completata con successo!"
else
    echo "⚠️  Build fallita - controlla gli errori:"
    echo "   npm run build"
fi

# Analisi post-pulizia se disponibile
if [ -f "analyze_react_imports.cjs" ]; then
    echo ""
    echo "📊 STATISTICHE POST-PULIZIA"
    echo "========================="
    node analyze_react_imports.cjs src/ --format json 2>/dev/null | jq -r '"📁 File totali: " + (.summary.total_files | tostring) + "\n🗑️  File inutilizzati rimasti: " + (.summary.unused_files_count | tostring)' 2>/dev/null || echo "   (analisi non disponibile)"
fi

echo ""
echo "✨ Pulizia completata con successo!"
echo ""
echo "🔄 Prossimi passi consigliati:"
echo "   1. Testa l'applicazione completa:"
echo "      npm run dev"
echo "   2. Verifica tutte le funzionalità"
echo "   3. Committare le modifiche:"
echo "      git add -A && git commit -m '🧹 Rimossi file React inutilizzati'"
echo ""

# Suggerimenti per ulteriori pulizie
if [ -f "analyze_react_imports.cjs" ]; then
    echo "💡 Per ulteriori analisi:"
    echo "   • Analisi completa: node analyze_react_imports.cjs src/ --show-external"
    echo "   • Export JSON: node analyze_react_imports.cjs src/ --format json --output analysis.json"
    echo "   • Aiuto: node analyze_react_imports.cjs --help"
fi

echo ""

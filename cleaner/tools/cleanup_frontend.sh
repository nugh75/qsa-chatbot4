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

echo "📋 FASE 1 - File sicuri da rimuovere:"
TOTAL_LINES_SAFE=0
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
        echo "  ✓ $file ($LINES righe)"
        TOTAL_LINES_SAFE=$((TOTAL_LINES_SAFE + LINES))
    else
        echo "  ⚠️  $file (non trovato)"
    fi
done

echo ""
echo "📋 FASE 2 - File opzionali da rimuovere:"
TOTAL_LINES_OPTIONAL=0
for file in "${OPTIONAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
        echo "  ⚪ $file ($LINES righe)"
        TOTAL_LINES_OPTIONAL=$((TOTAL_LINES_OPTIONAL + LINES))
    else
        echo "  ⚠️  $file (non trovato)"
    fi
done

echo ""
echo "📊 Riepilogo:"
echo "   • Fase 1 (sicura): ${#FILES_TO_REMOVE[@]} file, ~$TOTAL_LINES_SAFE righe"
echo "   • Fase 2 (opzionale): ${#OPTIONAL_FILES[@]} file, ~$TOTAL_LINES_OPTIONAL righe"
echo ""

# Selezione fase
echo "🤔 Quale fase eseguire?"
echo "   1) Solo Fase 1 (sicura - file vuoti/icone non usate)"
echo "   2) Entrambe le fasi (include backup FileUpload)"
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
echo ""
echo "🗑️  FASE 1 - Rimozione file sicuri..."
REMOVED_SAFE=0
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        echo "🗑️  Rimuovo $file..."
        rm "$file"
        REMOVED_SAFE=$((REMOVED_SAFE + 1))
    else
        echo "⏩ $file già rimosso"
    fi
done

# FASE 2: Rimuovi file opzionali (se richiesto)
REMOVED_OPTIONAL=0
if [ "$EXECUTE_PHASE2" = true ]; then
    echo ""
    echo "🗑️  FASE 2 - Rimozione file opzionali..."
    for file in "${OPTIONAL_FILES[@]}"; do
        if [ -f "$file" ]; then
            echo "🗑️  Rimuovo $file..."
            rm "$file"
            REMOVED_OPTIONAL=$((REMOVED_OPTIONAL + 1))
        else
            echo "⏩ $file già rimosso"
        fi
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

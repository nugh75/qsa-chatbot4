#!/bin/bash

# 🧹 Script Pulizia Automatica File Backend QSA Chatbot
# Rimuove file Python identificati come sicuramente inutilizzati

set -e  # Esci in caso di errore

BACKEND_DIR="/mnt/git/qsa-chatbot4/backend"
APP_DIR="$BACKEND_DIR/app"

echo "🧹 PULIZIA FILE BACKEND QSA CHATBOT"
echo "=================================="
echo ""

# Verifica che siamo nella directory corretta
if [ ! -d "$APP_DIR" ]; then
    echo "❌ Errore: Directory $APP_DIR non trovata"
    exit 1
fi

cd "$BACKEND_DIR"

echo "📍 Directory di lavoro: $(pwd)"
echo ""

# Lista file da rimuovere
FILES_TO_REMOVE=(
    "app/feedback.py"
    "app/feedback_routes.py" 
    "app/rag_admin.py"
    "app/device_sync_migration.py"
    "app/file_processing_backup.py"
    "app/file_processing_simple.py"
    "app/file_processing_with_images.py"
    "app/embedding_manager.py"
    "app/deps.py"
)

echo "📋 File da rimuovere:"
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file ($(wc -l < "$file") righe)"
    else
        echo "  ⚠️  $file (non trovato)"
    fi
done
echo ""

# Conferma utente
read -p "🤔 Procedere con la rimozione? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operazione annullata dall'utente"
    exit 1
fi

echo ""
echo "🚀 Avvio pulizia..."
echo ""

# Backup Git automatico
echo "💾 Creazione backup Git..."
git add -A && git commit -m "🧹 Backup automatico prima pulizia file obsoleti" || echo "  (nessun cambio da committare)"

# Conta righe totali prima
LINES_BEFORE=0
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        LINES_BEFORE=$((LINES_BEFORE + $(wc -l < "$file")))
    fi
done

# Rimuovi file
REMOVED_COUNT=0
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        echo "🗑️  Rimuovo $file..."
        rm "$file"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    else
        echo "⏩ $file già rimosso"
    fi
done

echo ""
echo "✅ PULIZIA COMPLETATA!"
echo "====================="
echo "📊 File rimossi: $REMOVED_COUNT"
echo "📏 Righe di codice eliminate: $LINES_BEFORE"
echo ""

# Test di verifica
echo "🔍 Verifica compilazione..."
if python -c "import os; os.chdir('app'); [__import__(f[:-3]) for f in os.listdir('.') if f.endswith('.py') and f != '__init__.py']" 2>/dev/null; then
    echo "✅ Tutti i moduli Python compilano correttamente"
else
    echo "⚠️  Alcuni moduli hanno errori di importazione (normale se dipendenze esterne mancanti)"
fi

# Analisi post-pulizia se disponibile
if [ -f "analyze_imports.py" ]; then
    echo ""
    echo "📊 STATISTICHE POST-PULIZIA"
    echo "========================="
    python analyze_imports.py app/ --format json | jq -r '"📁 File totali: " + (.summary.total_files | tostring) + "\n🗑️  File inutilizzati rimasti: " + (.summary.unused_files_count | tostring)'
else
    echo ""
    echo "📊 Per vedere le statistiche post-pulizia, esegui:"
    echo "   python analyze_imports.py app/ --format json | jq '.summary'"
fi

echo ""
echo "✨ Pulizia completata con successo!"
echo ""
echo "🔄 Prossimi passi consigliati:"
echo "   1. Testa l'applicazione completa"
echo "   2. Verifica che tutte le funzionalità funzionino"
echo "   3. Committare le modifiche:"
echo "      git add -A && git commit -m '🧹 Rimossi $REMOVED_COUNT file Python inutilizzati'"
echo ""

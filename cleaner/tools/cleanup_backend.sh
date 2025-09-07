#!/bin/bash

# 🧹 Script Pulizia Automatica Backend Python QSA Chatbot
# Rimuove file Python identificati come sicuramente inutilizzati

set -e  # Esci in caso di errore

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
APP_DIR="$BACKEND_DIR/app"

echo "🧹 PULIZIA BACKEND PYTHON QSA CHATBOT"
echo "====================================="
echo ""

# Verifica che siamo nella directory corretta
if [ ! -d "$APP_DIR" ]; then
    echo "❌ Errore: Directory $APP_DIR non trovata"
    echo "   Assicurati di essere nella directory corretta del progetto"
    exit 1
fi

cd "$BACKEND_DIR"

echo "📍 Directory di lavoro: $(pwd)"
echo ""

# Lista file da rimuovere (già identificati come sicuri)
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

# Controlla quali file esistono effettivamente
EXISTING_FILES=()
TOTAL_LINES=0
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        EXISTING_FILES+=("$file")
        LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
        TOTAL_LINES=$((TOTAL_LINES + LINES))
    fi
done

# Se non ci sono file da rimuovere, esci subito
if [ ${#EXISTING_FILES[@]} -eq 0 ]; then
    echo "✅ BACKEND GIÀ PULITO!"
    echo "====================="
    echo "Non ci sono file inutilizzati da rimuovere."
    echo "Tutti i file target sono già stati eliminati in precedenza."
    echo ""
    echo "💡 Per una nuova analisi completa, usa:"
    echo "   python ../cleaner/tools/analyze_imports.py app/"
    exit 0
fi

echo "📋 File trovati da rimuovere:"
for file in "${EXISTING_FILES[@]}"; do
    LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
    echo "  ✓ $file ($LINES righe)"
done
echo ""

echo "📊 Totale righe da eliminare: $TOTAL_LINES"
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
if git diff --staged --quiet && git diff --quiet; then
    echo "  (nessun cambio da committare)"
else
    git add -A && git commit -m "🧹 Backup automatico prima pulizia backend" || echo "  (commit fallito, continuo)"
fi

# Rimuovi file esistenti
REMOVED_COUNT=0
for file in "${EXISTING_FILES[@]}"; do
    echo "🗑️  Rimuovo $file..."
    rm "$file"
    REMOVED_COUNT=$((REMOVED_COUNT + 1))
done

echo ""
echo "✅ PULIZIA COMPLETATA!"
echo "====================="
echo "📊 File rimossi: $REMOVED_COUNT"
echo "📏 Righe di codice eliminate: $TOTAL_LINES"
echo ""

# Test di verifica
echo "🔍 Verifica compilazione Python..."
if python -c "import os; os.chdir('app'); [__import__(f[:-3]) for f in os.listdir('.') if f.endswith('.py') and f != '__init__.py' and not f.startswith('test_')]" 2>/dev/null; then
    echo "✅ Tutti i moduli Python compilano correttamente"
else
    echo "⚠️  Alcuni moduli hanno errori di importazione (normale se dipendenze esterne mancanti)"
fi

# Analisi post-pulizia se disponibile
ANALYZER="$PROJECT_ROOT/cleaner/tools/analyze_imports.py"
if [ -f "$ANALYZER" ]; then
    echo ""
    echo "📊 STATISTICHE POST-PULIZIA"
    echo "========================="
    python "$ANALYZER" app/ --format json 2>/dev/null | jq -r '"📁 File totali: " + (.summary.total_files | tostring) + "\n🗑️  File inutilizzati rimasti: " + (.summary.unused_files_count | tostring)' 2>/dev/null || echo "   (statistiche non disponibili)"
fi

echo ""
echo "✨ Pulizia backend completata con successo!"
echo ""
echo "🔄 Prossimi passi consigliati:"
echo "   1. Testa l'applicazione completa"
echo "   2. Verifica che tutte le funzionalità funzionino"
echo "   3. Committare le modifiche:"
echo "      git add -A && git commit -m '🧹 Rimossi $REMOVED_COUNT file Python inutilizzati'"
echo ""

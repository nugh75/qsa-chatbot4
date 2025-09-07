# 🎯 QSA Chatbot Cleaner - Esempi di Utilizzo

## 📊 Scenario 1: Prima Analisi Completa

**Obiettivo**: Ottenere una panoramica completa dello stato del progetto

```bash
cd /path/to/qsa-chatbot4/cleaner
./clean.sh

# Nel menu scegli:
# 3) Analisi completa (Backend + Frontend)
```

**Output atteso**:
```
📊 ANALISI COMPLETA PROGETTO
===========================

🐍 Backend Python:
  📁 File totali: 54
  🗑️ File inutilizzati: 14 (25% riduzione possibile)

⚛️ Frontend React/TS:  
  📁 File totali: 87
  🗑️ File inutilizzati: 2 (2% riduzione possibile)

📈 TOTALE PROGETTO:
  📁 File totali: 141
  🗑️ File inutilizzati: 16 (11% riduzione possibile)
  💾 Spazio recuperabile: ~1500+ righe codice
```

---

## 🗑️ Scenario 2: Pulizia Graduale Sicura

**Obiettivo**: Pulire il progetto in step incrementali

### Step 1: Backend (più file inutilizzati)
```bash
./clean.sh
# Scegli: 5) Pulisci Backend (automatico)
# Conferma: y
```

### Step 2: Test funzionalità
```bash
cd ../backend
python -m app.main  # Test avvio backend
# Oppure esegui test suite completa
```

### Step 3: Frontend (se backend OK)
```bash
cd ../cleaner
./clean.sh
# Scegli: 6) Pulisci Frontend (automatico)
# Conferma: y
```

### Step 4: Test build
```bash
cd ../frontend
npm run build  # Verifica che compili
npm run dev    # Test development server
```

---

## 📄 Scenario 3: Analisi Dettagliata per Review

**Obiettivo**: Esaminare in dettaglio i file prima di rimuoverli

### Analisi Backend con dettagli
```bash
cd cleaner/tools
python analyze_imports.py ../backend/app/ --show-external --format both
```

**Output**: Albero completo dipendenze + JSON strutturato

### Analisi Frontend con dipendenze NPM
```bash
node analyze_react_imports.cjs ../frontend/src/ --show-external --format json | jq '.'
```

**Utilità**: Identifica anche dipendenze NPM non utilizzate

---

## 🔍 Scenario 4: Debug File Specifici

**Obiettivo**: Capire perché un file è marcato come "inutilizzato"

### Cerca utilizzi di un file specifico
```bash
# Esempi per file backend
grep -r "from.*embedding_manager" ../backend/
grep -r "import.*embedding_manager" ../backend/

# Esempi per file frontend  
grep -r "from.*ArenaIcon" ../frontend/src/
grep -r "import.*ArenaIcon" ../frontend/src/
```

### Analizza dipendenze inverse
```bash
python tools/analyze_imports.py ../backend/app/ --format json | \
  jq '.files["app/embedding_manager.py"].imported_by'
```

---

## 🚨 Scenario 5: Rollback dopo Pulizia

**Obiettivo**: Annullare pulizia se qualcosa non funziona

### Metodo 1: Git Reset (se recente)
```bash
cd ..  # alla root del progetto
git log --oneline -5  # Trova commit di backup
git reset --hard <commit_backup>
```

### Metodo 2: Git Revert (se già pushato)
```bash
git revert <commit_pulizia>
```

### Metodo 3: Ripristino selettivo
```bash
# Ripristina solo alcuni file
git checkout HEAD~1 -- backend/app/file_specifico.py
```

---

## 🤖 Scenario 6: Automazione CI/CD

**Obiettivo**: Integrazione in pipeline automatizzata

### GitHub Actions Workflow
```yaml
# .github/workflows/cleaner-check.yml
name: Code Cleanliness Check
on: [pull_request]

jobs:
  cleaner-analysis:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
        
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
          
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '16'
          
      - name: Run Cleaner Analysis
        run: |
          cd cleaner
          # Analisi completa senza interazione
          timeout 60 bash -c 'echo "3" | ./clean.sh' > analysis_report.txt
          
      - name: Parse Results
        run: |
          cd cleaner
          BACKEND_UNUSED=$(grep "File inutilizzati:" analysis_report.txt | head -1 | grep -o "[0-9]*")
          FRONTEND_UNUSED=$(grep "File inutilizzati:" analysis_report.txt | tail -1 | grep -o "[0-9]*")
          
          echo "Backend unused files: $BACKEND_UNUSED"
          echo "Frontend unused files: $FRONTEND_UNUSED"
          
          # Fail se troppi file inutilizzati (threshold)
          if [ "$BACKEND_UNUSED" -gt 20 ]; then
            echo "❌ Troppi file inutilizzati nel backend: $BACKEND_UNUSED"
            exit 1
          fi
          
      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: cleaner-analysis
          path: cleaner/reports/analysis/
```

### Pre-commit Hook
```bash
#!/bin/sh
# .git/hooks/pre-commit

cd cleaner 2>/dev/null || exit 0

# Check rapido senza bloccare il commit
if timeout 10 bash -c 'echo "4" | ./clean.sh' | grep -q "File inutilizzati"; then
    echo "ℹ️  Suggerimento: Esegui 'cd cleaner && ./clean.sh' per ottimizzare il codice"
fi

exit 0
```

---

## 📈 Scenario 7: Monitoraggio Continuo

**Obiettivo**: Tracciare evoluzione pulizia nel tempo

### Script di Monitoraggio
```bash
#!/bin/bash
# monitor_cleanliness.sh

DATE=$(date +%Y-%m-%d)
REPORT_FILE="cleanliness_history.csv"

cd cleaner

# Header se file non esiste
if [ ! -f "$REPORT_FILE" ]; then
    echo "Date,Backend_Total,Backend_Unused,Frontend_Total,Frontend_Unused,Total_Unused_Pct" > "$REPORT_FILE"
fi

# Esegui analisi e parsing
ANALYSIS=$(timeout 30 bash -c 'echo "3" | ./clean.sh' 2>/dev/null)

BACKEND_TOTAL=$(echo "$ANALYSIS" | grep "File totali:" | head -1 | grep -o "[0-9]*")
BACKEND_UNUSED=$(echo "$ANALYSIS" | grep "File inutilizzati:" | head -1 | grep -o "[0-9]*")
FRONTEND_TOTAL=$(echo "$ANALYSIS" | grep "File totali:" | tail -1 | grep -o "[0-9]*")  
FRONTEND_UNUSED=$(echo "$ANALYSIS" | grep "File inutilizzati:" | tail -1 | grep -o "[0-9]*")

TOTAL_FILES=$((BACKEND_TOTAL + FRONTEND_TOTAL))
TOTAL_UNUSED=$((BACKEND_UNUSED + FRONTEND_UNUSED))
UNUSED_PCT=$(( (TOTAL_UNUSED * 100) / TOTAL_FILES ))

# Salva record
echo "$DATE,$BACKEND_TOTAL,$BACKEND_UNUSED,$FRONTEND_TOTAL,$FRONTEND_UNUSED,$UNUSED_PCT" >> "$REPORT_FILE"

echo "📊 Cleanliness Score: $((100 - UNUSED_PCT))% (unused: $UNUSED_PCT%)"
```

### Visualizzazione Trend
```bash
# Visualizza trend ultimo mese
tail -30 cleaner/cleanliness_history.csv | \
  awk -F, 'NR>1 {print $1, (100-$6)"%"}' | \
  column -t
```

---

## 🔧 Scenario 8: Customizzazione Avanzata

**Obiettivo**: Adattare cleaner per esigenze specifiche

### Aggiungere Nuovo Pattern di Rilevamento
```python
# In tools/analyze_imports.py

def is_likely_obsolete(self, filepath, fileinfo):
    """Pattern personalizzati per file obsoleti"""
    filename = fileinfo.name.lower()
    
    # Pattern esistenti + nuovi
    obsolete_patterns = [
        'backup', 'old', 'temp', 'unused',
        # Nuovi pattern custom
        'legacy', 'deprecated', 'archive',
        'test_old', 'migration_'
    ]
    
    return any(pattern in filename for pattern in obsolete_patterns)
```

### Estendere Report con Metriche Custom
```javascript
// In tools/analyze_react_imports.cjs

generateCustomReport() {
    const metrics = {
        // Metriche standard
        ...this.getStandardMetrics(),
        
        // Metriche custom per QSA Chatbot
        admin_components: this.countComponentsByPrefix('Admin'),
        unused_icons: this.countUnusedIcons(),
        large_components: this.findLargeComponents(200), // >200 righe
        circular_deps: this.detectCircularDeps()
    };
    
    return metrics;
}
```

---

## 🎓 Scenario 9: Onboarding Nuovo Sviluppatore

**Obiettivo**: Far familiarizzare nuovo team member con stato progetto

### Quick Start Guide
```bash
# 1. Clone e setup
git clone <repo>
cd qsa-chatbot4

# 2. Primo check health
cd cleaner
./clean.sh
# Scegli: 4) Mostra statistiche progetti

# 3. Understand architecture  
./clean.sh
# Scegli: 1) Analizza dipendenze Backend
# Scegli: 2) Analizza dipendenze Frontend

# 4. Read documentation
ls docs/
cat docs/README_analyze_*.md
```

### Learning Path
1. **Comprendi metriche**: Cosa significano i numeri
2. **Esplora dipendenze**: Come sono collegati i moduli  
3. **Identifica pattern**: Perché certi file sono inutilizzati
4. **Pratica sicura**: Esegui analisi, mai pulizia automatica inizialmente

---

## 💡 Tips & Tricks

### Performance Optimization
```bash
# Analisi più veloce (skip external deps)
python tools/analyze_imports.py ../backend/app/ --format json

# Cache risultati per usage ripetuto
./clean.sh > last_analysis.txt
grep -A5 "STATISTICHE RAPIDE" last_analysis.txt
```

### Debug Avanzato
```bash
# Verbose mode per troubleshooting
bash -x tools/cleanup_backend.sh

# Dry-run simulation
export DRY_RUN=1  # Se implementato negli script
./clean.sh
```

### Integration con Altri Tools
```bash
# Combina con linting
./clean.sh  # Pulisci prima
cd ../backend && flake8 app/
cd ../frontend && npm run lint

# Combina con testing
./clean.sh
cd .. && make test  # Se hai Makefile per test
```

---

**🚀 Con questi esempi puoi padroneggiare completamente il QSA Chatbot Cleaner!**

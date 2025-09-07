# 🔄 IMPORT REORGANIZER - Guida Completa

## 📋 Panoramica

L'**Import Reorganizer** è uno strumento avanzato per riorganizzare automaticamente gli import nei file Python, spostandoli in cima ai file e organizzandoli secondo le best practices PEP 8.

## 🎯 Funzionalità

### ✨ Caratteristiche Principali
- **Rilevamento Intelligente**: Trova tutti gli import sparsi nel codice
- **Riorganizzazione Automatica**: Sposta gli import in cima al file
- **Categorizzazione**: Organizza import per tipologia (standard library, third-party, local)
- **Sicurezza**: Backup automatico e modalità dry-run
- **Parsing AST**: Analisi sicura del codice Python
- **Supporto File/Directory**: Processa singoli file o intere directory

### 📦 Organizzazione Import

Gli import vengono organizzati in questo ordine:

1. **Standard Library** (os, sys, json, datetime, ecc.)
2. **Third-party Packages** (fastapi, pydantic, sqlalchemy, ecc.)
3. **Import Locali** (moduli del progetto)

Ogni categoria è separata da una riga vuota per maggiore leggibilità.

## 🚀 Utilizzo

### 1️⃣ Tramite Menu Cleaner

```bash
cd /mnt/git/qsa-chatbot4/cleaner
./clean.sh
# Seleziona opzione 18) 🔄 Riorganizza Import Python
```

### 2️⃣ Interfaccia CLI Dedicata

```bash
cd /mnt/git/qsa-chatbot4/cleaner/tools
./reorganize_imports_cli.sh
```

### 3️⃣ Script Python Diretto

```bash
# Directory completa
python3 reorganize_imports.py /percorso/directory

# Singolo file
python3 reorganize_imports.py /percorso/file.py

# Modalità preview (dry-run)
python3 reorganize_imports.py /percorso --dry-run

# Senza backup
python3 reorganize_imports.py /percorso --no-backup
```

## 📚 Modalità Disponibili

### 👀 Preview Mode (Dry-run)
- Mostra cosa verrebbe modificato senza applicare cambiamenti
- Perfetto per controllare prima di applicare
- Attivabile con flag `--dry-run`

### 🔄 Backend Mode
- Riorganizza tutti i file Python in `backend/app/`
- Include backup automatico
- Statistiche dettagliate

### 🌐 Frontend Mode
- Analizza import TypeScript/JavaScript (non implementato)
- Preparazione per future funzionalità

### 📁 Custom Directory
- Permette di specificare directory personalizzate
- Supporta percorsi relativi e assoluti

### 🏠 Intero Progetto
- Processa tutti i file Python nel progetto
- Esclude automaticamente `__pycache__` e file `.bak`

## 💾 Sistema di Backup

### Backup Automatico
- Ogni file modificato viene backuppato come `.py.bak`
- Il backup mantiene timestamp e permessi originali
- Ripristino semplice: `mv file.py.bak file.py`

### Esclusioni Automatiche
- File in `__pycache__/`
- File già di backup (`.bak`)
- File con errori di sintassi

## 📊 Output e Statistiche

### Informazioni per File
```
📄 Analizzando: admin.py
  🔄 Import sparsi trovati: 5
  📦 Import totali: 12
  💾 Backup: admin.py.bak
  ✅ File aggiornato
```

### Statistiche Finali
```
📊 STATISTICHE FINALI:
   • File processati: 25
   • File modificati: 12
   • Import spostati: 45
   • Import organizzati: 120
```

## 🛡️ Sicurezza e Validazione

### Controlli Pre-modifica
- **Syntax Check**: Verifica che il file sia Python valido
- **AST Parsing**: Analisi sicura del codice sorgente
- **Backup Automatico**: Salvataggio prima delle modifiche
- **Error Handling**: Gestione sicura degli errori

### Pattern Riconosciuti
- `import module`
- `from module import item`
- `from . import module` (import relativi)
- Import con alias (`import module as alias`)
- Import multipli (`from module import a, b, c`)

## 🔧 Esempi Pratici

### Prima della Riorganizzazione
```python
#!/usr/bin/env python3
"""Modulo esempio."""

def function1():
    import os
    return os.getcwd()

# Commento
import sys

def function2():
    from datetime import datetime
    from pathlib import Path
    return datetime.now()

import json
```

### Dopo la Riorganizzazione
```python
#!/usr/bin/env python3
"""Modulo esempio."""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

def function1():
    return os.getcwd()

# Commento

def function2():
    return datetime.now()
```

## ⚙️ Configurazione Avanzata

### Standard Library Modules
Lo script include una lista predefinita dei moduli standard library Python 3.11:
- Core: `os`, `sys`, `json`, `ast`
- Utility: `pathlib`, `typing`, `collections`
- Network: `urllib`, `http`, `socket`, `ssl`
- Data: `datetime`, `csv`, `pickle`

### Personalizzazione
Per aggiungere moduli alla lista standard library, modifica `self.stdlib_modules` in `ImportReorganizer.__init__()`.

## 🚫 Limitazioni

### Cosa NON fa
- **Non modifica la logica**: Sposta solo import, non cambia il comportamento
- **Non rimuove import**: Mantiene tutti gli import esistenti
- **No TypeScript**: Al momento solo Python (TypeScript in sviluppo)

### Casi Particolari
- **Import condizionali**: Lasciati dove sono (es. `if condition: import module`)
- **Import in try/except**: Non spostati per sicurezza
- **Docstring**: Mantenute nella posizione corretta

## 🔍 Troubleshooting

### Problemi Comuni

#### File non modificato
```
✅ Import già in cima
```
**Soluzione**: Il file è già correttamente organizzato.

#### Errore di sintassi
```
⚠️  Errore syntax: unexpected token
```
**Soluzione**: Correggi prima gli errori di sintassi nel file.

#### Permessi
```
❌ Errore: Permission denied
```
**Soluzione**: Verifica i permessi di scrittura del file.

### File di Log
Gli errori vengono mostrati direttamente nell'output. Per logging avanzato, redireziona l'output:
```bash
python3 reorganize_imports.py directory 2>&1 | tee import_reorg.log
```

## 🎨 Personalizzazione

### Modifica Categorie
Per cambiare l'ordine delle categorie, modifica `_organize_imports()`:
```python
# Ordine personalizzato
organized = []
if categories['local']:      # Prima i locali
    organized.extend(categories['local'])
if categories['standard']:   # Poi standard library
    organized.extend(categories['standard'])
# ecc...
```

### Aggiunta Nuovi Pattern
Per supportare nuovi pattern di import, estendi `_categorize_import()`.

## 📈 Performance

### Tempi Tipici
- **Singolo file**: < 0.1s
- **Backend completo** (~50 file): ~2-3s
- **Progetto intero** (~200 file): ~8-10s

### Ottimizzazioni
- Usa `--dry-run` per test veloci
- Processa singoli file per modifiche mirate
- Il backup automatico aggiunge ~10% overhead

## 🔗 Integrazione

### Con Git
```bash
# Prima di commit
python3 reorganize_imports.py . --dry-run

# Applica modifiche
python3 reorganize_imports.py .

# Commit
git add -A
git commit -m "🔄 Riorganizzazione import"
```

### Con IDE
Lo script è compatibile con tutti gli IDE che supportano Python:
- Visual Studio Code
- PyCharm
- Sublime Text
- Vim/Neovim

## 🆘 Supporto

Per problemi o domande:
1. Controlla questa documentazione
2. Verifica i log di output
3. Testa con `--dry-run` prima
4. Usa i backup automatici per ripristino

---

*Creato per QSA Chatbot Project - Sistema Cleaner v1.0*

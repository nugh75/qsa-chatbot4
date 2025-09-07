# 🔍 Analizzatore Import Python

Script per analizzare le dipendenze tra file Python in una cartella e identificare file inutilizzati.

## Caratteristiche

- **Albero delle dipendenze**: Mostra chi importa cosa
- **File inutilizzati**: Identifica file che non sono importati
- **Import relativi**: Gestisce correttamente `from .module import ...`
- **Export JSON**: Esporta i risultati in formato strutturato
- **Import esterni**: Opzionalmente mostra le dipendenze esterne

## Installazione

```bash
# Copia lo script nella directory del progetto
cp analyze_imports.py /path/to/your/project/

# Rendi eseguibile (opzionale)
chmod +x analyze_imports.py
```

## Utilizzo

### Analisi base della cartella corrente
```bash
python analyze_imports.py
```

### Analizza una cartella specifica
```bash
python analyze_imports.py /path/to/backend/app
```

### Mostra anche gli import esterni
```bash
python analyze_imports.py --show-external
```

### Export in JSON
```bash
python analyze_imports.py --format json --output dependencies.json
```

### Output completo (albero + JSON)
```bash
python analyze_imports.py --format both --show-external --output deps.json
```

## Esempio di Output

```
🌳 ALBERO DELLE DIPENDENZE
==================================================

📍 ENTRY POINTS (non importati, ma probabilmente entry point):

🚀 main.py
    📛 Modulo: main
    📥 Importa: chat, auth_routes, admin, database
    🌐 Import esterni: fastapi, uvicorn, os

📦 FILE IMPORTATI:

📁 chat.py
    📛 Modulo: chat
    📥 Importa: database, llm
    📤 Importato da: main.py
    🌐 Import esterni: fastapi, pydantic

📁 database.py
    📛 Modulo: database
    📤 Importato da: main.py, chat.py, auth_routes.py
    🌐 Import esterni: sqlalchemy, psycopg2

🗑️ FILE NON UTILIZZATI:

❌ old_backup.py
    📛 Modulo: old_backup
    🌐 Import esterni: json, os

❌ unused_utils.py
    📛 Modulo: unused_utils
    📥 Importa: database
    🌐 Import esterni: datetime

📊 STATISTICHE:
   • Totale file: 15
   • Entry points: 1
   • File importati: 12
   • File inutilizzati: 2
```

## Formato JSON

Il formato JSON include informazioni dettagliate:

```json
{
  "directory": "/path/to/project",
  "analysis_date": "2025-01-07T10:30:00",
  "summary": {
    "total_files": 15,
    "unused_files_count": 2,
    "unused_files": ["old_backup.py", "unused_utils.py"]
  },
  "files": {
    "main.py": {
      "module_name": "main",
      "imports": ["chat", "auth_routes", "admin"],
      "imported_by": [],
      "external_imports": ["fastapi", "uvicorn", "os"]
    }
  }
}
```

## Casi d'uso

### 1. Pulizia codebase
Identifica file che possono essere rimossi in sicurezza:

```bash
python analyze_imports.py --format json | jq '.summary.unused_files[]'
```

### 2. Audit dipendenze
Trova moduli con troppe dipendenze:

```bash
python analyze_imports.py --show-external --format json | \
  jq '.files[] | select(.imports | length > 5)'
```

### 3. Entry points
Identifica i punti di ingresso dell'applicazione:

```bash
python analyze_imports.py --format json | \
  jq '.files[] | select(.imported_by | length == 0)'
```

## Limitazioni

- Non analizza import dinamici (`importlib`, `__import__`)
- Non segue import condizionali (`if CONDITION: import ...`)
- Non rileva utilizzi indiretti (es. attraverso `exec()`)

## Troubleshooting

### Errori di parsing
Se ci sono errori di sintassi nei file Python, lo script li segnala ma continua l'analisi.

### Import relativi complessi
Per strutture molto complesse con package annidati, alcuni import relativi potrebbero non essere risolti correttamente.

### Performance
Per progetti molto grandi (>1000 file), l'analisi potrebbe richiedere alcuni secondi.

## Esempi pratici

### Analizza backend QSA Chatbot
```bash
cd /path/to/qsa-chatbot4/backend
python analyze_imports.py app/ --show-external --output backend_deps.json
```

### Trova file sicuri da rimuovere
```bash
python analyze_imports.py app/ --format json | \
  jq -r '.summary.unused_files[]' | \
  while read file; do echo "Sicuro da rimuovere: $file"; done
```

### Statistiche rapide
```bash
python analyze_imports.py app/ --format json | \
  jq '.summary | "Totale: \(.total_files), Inutilizzati: \(.unused_files_count)"'
```

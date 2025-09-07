# 🧹 QSA Chatbot Cleaner v1.0

Sistema completo di analisi e pulizia del progetto QSA Chatbot per identificare e rimuovere file inutilizzati, backup obsoleti e migliorare la manutenibilità del codice.

## 🚀 Avvio Rapido

```bash
cd cleaner
./clean.sh
```

## � Struttura

```
cleaner/
├── 📁 tools/           # Script di analisi e pulizia
│   ├── analyze_imports.py         # Analizzatore Python/Backend
│   ├── analyze_react_imports.cjs  # Analizzatore React/Frontend  
│   ├── cleanup_backend.sh         # Pulizia automatica backend
│   └── cleanup_frontend.sh        # Pulizia automatica frontend
├── 📁 docs/            # Documentazione
│   ├── README_analyze_imports.md        # Manuale analizzatore Python
│   ├── README_analyze_react_imports.md  # Manuale analizzatore React
│   ├── CLEANUP_PLAN.md                 # Piano pulizia backend
│   └── CLEANUP_RESULT.md               # Risultati pulizia backend
├── 📁 reports/         # Report e analisi
│   └── 📁 analysis/    # File di analisi con naming standard
│       ├── back_data_analysis.json   # Analisi dipendenze backend
│       └── front_data_analysis.json  # Analisi dipendenze frontend
└── 📄 clean.sh         # Script principale interfaccia CLI
```

## 🚀 Utilizzo Rapido

### Script Principale (CLI Interattiva)
```bash
cd /mnt/git/qsa-chatbot4/cleaner
./clean.sh
```

### Analisi Diretta Backend
```bash
cd /mnt/git/qsa-chatbot4
python cleaner/tools/analyze_imports.py backend/app/
```

### Analisi Diretta Frontend  
```bash
cd /mnt/git/qsa-chatbot4  
node cleaner/tools/analyze_react_imports.cjs frontend/src/
```

### Pulizia Automatica
```bash
cd /mnt/git/qsa-chatbot4
./cleaner/tools/cleanup_backend.sh      # Backend
./cleaner/tools/cleanup_frontend.sh     # Frontend
```

## 📊 File di Analisi Standard

I file di analisi seguono la convenzione:
- **`back_data_analysis.json`** - Analisi completa backend (Python)
- **`front_data_analysis.json`** - Analisi completa frontend (React/TS)

Formato JSON standardizzato per entrambi:
```json
{
  "directory": "/path/to/analyzed",
  "analysis_date": "2025-09-07T10:22:00.000Z",
  "summary": {
    "total_files": 54,
    "unused_files_count": 14,
    "unused_files": ["file1.py", "file2.tsx"]
  },
  "files": { /* dettagli file */ },
  "unused_files": [ /* dettagli file inutilizzati */ ]
}
```

## 🎯 Funzionalità Principali

1. **Analisi Dipendenze**: Albero import completo per Python e React/TS
2. **File Inutilizzati**: Identificazione automatica con livelli di confidenza  
3. **Pulizia Sicura**: Rimozione automatica file obsoleti/backup
4. **Report Standardizzati**: JSON consistente per backend e frontend
5. **Interfaccia CLI**: Menu interattivo per tutte le operazioni

## 🔧 Personalizzazione

### Aggiungere Nuovi Analizzatori
Crea script in `tools/` seguendo il pattern esistente:
- Input: directory da analizzare
- Output: report JSON in `reports/analysis/`
- Naming: `<tipo>_data_analysis.json`

### Estendere Pulizia
Modifica `cleanup_*.sh` per aggiungere:
- Nuovi pattern di file da rimuovere
- Verifiche personalizzate
- Report post-pulizia

## 📈 Metriche Progetto (Ultima Analisi)

| Componente | File Totali | Inutilizzati | Riduzione |
|-----------|-------------|--------------|-----------|
| **Backend** | 54 | 14 | 26% |
| **Frontend** | 87 | 7 | 8% |
| **Totale** | 141 | 21 | 15% |

## 🚨 Note Sicurezza

- Tutti gli script creano backup Git automatici
- File rimossi solo dopo conferma utente
- Verifica sintassi/build prima della pulizia finale
- Livelli di confidenza per prevenire rimozioni errate

# 🔍 Analizzatore Import React/TypeScript

Script Node.js per analizzare le dipendenze tra file React/TypeScript e identificare componenti non utilizzati.

## Caratteristiche

- **Analisi AST completa**: Estrae import da file `.tsx`, `.ts`, `.jsx`, `.js`
- **Risoluzione path intelligente**: Gestisce import relativi, assoluti e con estensioni multiple
- **Identificazione entry points**: Riconosce automaticamente file principali (main.tsx, App.tsx, etc.)
- **Livelli di confidenza**: Calcola probabilità che un file sia veramente inutilizzato
- **Import esterni**: Traccia dipendenze NPM (React, Material-UI, etc.)
- **Export multipli**: Tree view, JSON, o entrambi

## Installazione

```bash
# Copia lo script nella directory del frontend
cp analyze_react_imports.cjs /path/to/your/frontend/

# Assicurati di avere Node.js installato
node --version  # Dovrebbe essere >= 14
```

## Utilizzo

### Analisi base della cartella src/
```bash
node analyze_react_imports.cjs src/
```

### Con dipendenze esterne NPM
```bash
node analyze_react_imports.cjs src/ --show-external
```

### Export in JSON
```bash
node analyze_react_imports.cjs src/ --format json --output analysis.json
```

### Output completo (tree + JSON)
```bash
node analyze_react_imports.cjs src/ --format both --show-external --output deps.json
```

## Esempio di Output

```
🌳 ALBERO DELLE DIPENDENZE REACT
==================================

📍 ENTRY POINTS:

🚀 App.tsx
    📛 Tipo: .tsx
    📏 2196 righe
    📥 Importa: components/ChatAvatar.tsx, AdminPanel.tsx, theme.tsx
    🌐 Dipendenze: react, @mui/material, react-markdown

📦 FILE IMPORTATI:

📁 components/ChatAvatar.tsx
    📛 Tipo: .tsx
    📏 18 righe
    📤 Importato da: App.tsx
    🌐 Dipendenze: react, @mui/material

🗑️ FILE NON UTILIZZATI:

❌ components/icons/OldIcon.tsx
    📛 Tipo: .tsx
    📏 Righe: 25
    💾 Dimensione: 800 bytes
    🎯 Confidenza: 100%
    🌐 Dipendenze: react

📊 STATISTICHE:
   • File totali: 87
   • Righe totali: 22933
   • File inutilizzati: 7
   • Righe inutilizzate: 245
   • Percentuale inutilizzata: 8.0%

🌐 TOP DIPENDENZE ESTERNE:
   • react: 66 utilizzi
   • @mui/material: 66 utilizzi
   • @mui/icons-material: 50 utilizzi
```

## Opzioni Avanzate

### File Extension
Supporta automaticamente:
- `.tsx` - React TypeScript
- `.ts` - TypeScript puro
- `.jsx` - React JavaScript  
- `.js` - JavaScript puro

### Pattern Ignorati
Per default ignora:
- `node_modules/`
- `dist/`, `build/`
- `.git/`
- File test (`.test.`, `.spec.`)

### Entry Points Automatici
Riconosce come entry point:
- `main.tsx`, `main.ts`
- `index.tsx`, `index.ts` 
- `App.tsx`, `App.ts`
- `*router*.tsx`, `*.config.ts`
- File nella root di `src/`

## Casi d'uso

### 1. Pulizia componenti inutilizzati
Identifica componenti React non importati:

```bash
node analyze_react_imports.cjs src/ --format json | jq '.unused_files[].path'
```

### 2. Audit dipendenze NPM
Trova package NPM più utilizzati:

```bash
node analyze_react_imports.cjs src/ --show-external --format json | \
  jq '.files | [.[].external_imports[]] | group_by(.) | map({package: .[0], count: length}) | sort_by(.count) | reverse'
```

### 3. Componenti con troppe dipendenze
Trova componenti complessi:

```bash
node analyze_react_imports.cjs src/ --format json | \
  jq '.files | to_entries[] | select(.value.imports | length > 10) | {file: .key, imports: .value.imports}'
```

### 4. Analisi import circolari
Il tool identifica automaticamente dipendenze circolari nell'output tree.

## Formato JSON Dettagliato

```json
{
  "directory": "/path/to/src",
  "analysis_date": "2025-01-07T15:30:00.000Z",
  "summary": {
    "total_files": 87,
    "unused_files_count": 7,
    "unused_files": ["components/icons/OldIcon.tsx", "..."]
  },
  "files": {
    "App.tsx": {
      "full_path": "/full/path/to/App.tsx",
      "extension": ".tsx",
      "lines": 2196,
      "size": 85432,
      "imports": ["components/ChatAvatar.tsx", "AdminPanel.tsx"],
      "imported_by": ["main.tsx"],
      "external_imports": ["react", "@mui/material"],
      "is_unused": false
    }
  },
  "unused_files": [
    {
      "path": "components/icons/OldIcon.tsx",
      "fullPath": "/full/path",
      "lines": 25,
      "size": 800,
      "confidence": 100
    }
  ]
}
```

## Livelli di Confidenza

### 100% - Sicuri da rimuovere
- File mai importati
- Non sono entry point
- Nome suggerisce sono obsoleti (backup, old, temp)

### 80% - Probabilmente sicuri
- Non importati ma potrebbero essere entry point
- File di configurazione

### 60% - Da valutare
- File grandi (>100 righe) non importati
- Potrebbero contenere logica importante

## Limitazioni

1. **Import dinamici complessi**: Non analizza `import()` con variabili
2. **JSX string refs**: Non traccia riferimenti attraverso stringhe
3. **Webpack aliases**: Non risolve alias personalizzati
4. **Conditional imports**: Ignora import dentro condizioni complesse

## Troubleshooting

### Errori di Parsing
Se ci sono errori di sintassi TypeScript, vengono segnalati ma l'analisi continua.

### False Positives
- File entry point potrebbero essere marcati come inutilizzati se non importati
- File utilizzati solo via webpack o configurazioni esterne

### Performance
- Progetti con >500 file potrebbero richiedere alcuni secondi
- L'analisi è ottimizzata per progetti React tipici

## Esempi Pratici QSA Chatbot

### Analisi completa frontend
```bash
cd /mnt/git/qsa-chatbot4/frontend
node analyze_react_imports.cjs src/ --show-external --output frontend_analysis.json
```

### Trova componenti icon non usati
```bash
node analyze_react_imports.cjs src/ --format json | \
  jq -r '.unused_files[] | select(.path | contains("icon")) | .path'
```

### Statistiche componenti per cartella
```bash
node analyze_react_imports.cjs src/components/ --format json | \
  jq '.summary | "Componenti: \(.total_files), Inutilizzati: \(.unused_files_count)"'
```

### Verifica post-pulizia
```bash
# Prima della pulizia
node analyze_react_imports.cjs src/ --format json > before.json

# Dopo la pulizia  
node analyze_react_imports.cjs src/ --format json > after.json

# Confronta risultati
diff <(jq '.summary' before.json) <(jq '.summary' after.json)
```

## Integrazione CI/CD

```yaml
# .github/workflows/unused-components.yml
name: Check Unused Components
on: [pull_request]
jobs:
  check-unused:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: |
          cd frontend
          node analyze_react_imports.cjs src/ --format json > analysis.json
          UNUSED=$(jq '.summary.unused_files_count' analysis.json)
          echo "Found $UNUSED unused files"
          if [ "$UNUSED" -gt 10 ]; then
            echo "Too many unused files!" && exit 1
          fi
```

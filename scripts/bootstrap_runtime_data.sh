#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_ROOT="${CHATBOT_DATA_ROOT:-${ROOT_DIR}/runtime-data}"
DEFAULT_STORAGE_ROOT="${ROOT_DIR}/backend"

mkdir -p "${DATA_ROOT}/models"
mkdir -p "${DATA_ROOT}/config"
rsync -a --delete "${DEFAULT_STORAGE_ROOT}/models/" "${DATA_ROOT}/models/" >/dev/null 2>&1 || true
rsync -a --delete "${DEFAULT_STORAGE_ROOT}/config/" "${DATA_ROOT}/config/" >/dev/null 2>&1 || true

for site in poggi pef counselorbot; do
  mkdir -p "${DATA_ROOT}/${site}/storage"
  SOURCE_DIR="${DEFAULT_STORAGE_ROOT}/storage-${site}"
  if [ -d "${SOURCE_DIR}" ]; then
    echo "[bootstrap] copying defaults for ${site}"
    if ! rsync -a "${SOURCE_DIR}/" "${DATA_ROOT}/${site}/storage/"; then
      echo "[bootstrap] warning: unable to copy ${SOURCE_DIR} (check permissions)" >&2
    fi
  fi
  mkdir -p "${DATA_ROOT}/${site}/backups"
  mkdir -p "${DATA_ROOT}/${site}/exports"
  done

python3 - "${DATA_ROOT}" <<'PY'
import json
from pathlib import Path
import sys

common_guide = {
    "id": "gd_common_user_features",
    "title": "Funzionalità del chatbot",
    "content": (
        "Questa guida riassume gli strumenti principali disponibili in ogni chatbot QSA.\n\n"
        "## Scelta della personalità\n"
        "- Usa il menù a tendina in alto (accanto all'avatar) per scegliere lo stile di assistente.\n"
        "- Ogni personalità cambia tono, livello di dettaglio e possibili suggerimenti.\n"
        "- Puoi cambiare personalità anche durante la conversazione: la chat prosegue con il nuovo stile.\n\n"
        "## Chat salvate\n"
        "- Dalla barra laterale sinistra puoi rivedere tutte le conversazioni: sono ordinate per data.\n"
        "- Clicca sul titolo per riaprire una chat e continuare da dove l'hai lasciata.\n"
        "- Usa il campo di ricerca in alto per trovare rapidamente messaggi o argomenti.\n\n"
        "## Esporta e scarica\n"
        "- Il pulsante **Scarica** consente di ottenere un report della chat in PDF/ZIP/TXT (a seconda dell'istanza).\n"
        "- Nel report trovi la trascrizione, eventuali fonti RAG e i metadati utili.\n"
        "- Per salvare solo la risposta corrente usa l'icona di copia veloce nell'angolo del messaggio.\n\n"
        "## Menù 'tre puntini'\n"
        "- Ogni messaggio dell'assistente offre azioni aggiuntive (es. valutare la risposta, rigenerarla, aprire le fonti).\n"
        "- Nel menù principale in alto a destra trovi anche impostazioni utente, logout e link informativi.\n\n"
        "## Pulsanti rapidi sotto la casella di testo\n"
        "- `Stop` per interrompere una risposta in streaming.\n"
        "- `Riproduci` (se presente) per ascoltare la risposta con sintesi vocale.\n"
        "- `Microfono` per inviare messaggi vocali (se abilitato).\n"
        "- `Nuova chat` per ripartire da zero mantenendo la personalità selezionata.\n\n"
        "## Questionari e allegati\n"
        "- Alcune istanze mostrano il pulsante **Questionari**: puoi caricare gli esiti per ricevere suggerimenti personalizzati.\n"
        "- Con l'icona **Clip** aggiungi file (PDF, testo, immagini) da usare come contesto durante la conversazione.\n"
        "- L'area **Documenti recenti** tiene traccia di ciò che hai caricato e ti permette di visualizzare o rimuovere gli allegati.\n\n"
        "Ricorda che ogni chatbot può offrire funzionalità extra dedicate: consulta le guide specifiche per approfondire."
    )
}

root = Path(sys.argv[1])
for guide_path in root.glob('*/storage/**/welcome-guide/welcome_guide.json'):
    data = json.loads(guide_path.read_text(encoding='utf-8'))
    guides = data.setdefault('guides', {})
    guide_list = guides.setdefault('guides', [])
    existing = next((g for g in guide_list if g.get('id') == common_guide['id']), None)
    if existing:
        existing.update(common_guide)
    else:
        guide_list.append(common_guide)
    # Ensure the shared guide is the active default unless another custom id is already active
    active_id = guides.get('active_id')
    if not active_id or active_id == 'gd_minimal':
        guides['active_id'] = common_guide['id']
    guide_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"[bootstrap] ensured common guide in {guide_path}")
PY

echo "Bootstrap completed. Runtime data root: ${DATA_ROOT}"

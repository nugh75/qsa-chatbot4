import re
from typing import Optional
ROUTES = [
  (r"\b(analisi.*secondo livello|sintesi trasversale|raggruppamenti|collega i fattori)\b", "analisi_secondo_livello"),
  (r"\b(fattori cognitivi|C[1-7]|A[1-7]|strategie|organizzatori|metacognizione)\b", "fattori_cognitivi"),
  (r"\b(artefice di (me|te|se) stess[oa]|\bautodeterminazione|autoregolazione|mindset)\b", "artefice_di_se_stessi"),
  (r"\b(FAQ|domande frequenti|domande e risposte|aiuto rapido|come fare)\b", "faq_qsa"),
]

def detect_topic(user_text: str) -> Optional[str]:
    t = user_text.lower()
    for pat, topic in ROUTES:
        if re.search(pat, t):
            return topic
    return None

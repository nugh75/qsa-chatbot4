# Guida Estesa: Regex per la Pipeline dei Topic

Questa guida (estesa) copre principi, casi avanzati, errori da evitare, performance, manutenzione e debugging dell'instradamento tramite espressioni regolari (regex) per i topic. Include una sezione di sintesi bilingue (IT/EN) e una FAQ operativa.

---
## 📌 Indice
1. [Obiettivi](#-obiettivi)
2. [Concetto di Routing Regex](#-concetto-di-routing-regex)
3. [Principi Fondamentali](#-principi-fondamentali)
4. [Errori Comuni](#-errori-comuni-da-evitare)
5. [Pattern Specifici vs Generici](#-pattern-specifici-vs-generici)
6. [Testing Interattivo](#-collaudo-rapido)
7. [Esempi di Buoni Pattern](#-esempi-di-buoni-pattern)
8. [Costruzione Progressiva di un Pattern](#-costruzione-progressiva-di-un-pattern)
9. [Gestione Varianti Morfologiche](#-gestione-varianti-morfologiche)
10. [Accenti e Normalizzazione](#-accenti-e-normalizzazione)
11. [Prestazioni e Scalabilità](#-prestazioni-e-scalabilità)
12. [Logging & Telemetria](#-debug-logging)
13. [Strategie di Refactoring](#-strategie-di-refactoring)
14. [Manutenzione & Versionamento](#-consigli-di-manutenzione)
15. [Checklist](#-checklist-prima-di-salvare)
16. [Troubleshooting Rapido](#-troubleshooting-rapido)
17. [FAQ](#-faq)
18. [Roadmap Miglioramenti](#-futuri-miglioramenti-possibili)
19. [Sintesi Bilingue](#-sintesi-bilingue)

---

## ✅ Obiettivi
- Riconoscere frasi / parole chiave in modo preciso.
- Evitare falsi positivi che catturano tutto.
- Rendere i pattern leggibili e manutenibili.
- Loggare quale pattern ha prodotto il match (già attivo: campo `pattern`).

## 🧱 Struttura minima di un pattern
Usa ancore e limiti di parola quando possibile:
```
\bmemoria di lavoro\b
```
Evita pattern vaghi come:
```
memoria|cognitivo|attenzione|
```
(Nota il `|` finale che crea un'alternativa vuota → match universale!)

## 🧠 Concetto di Routing Regex
Ogni **route** è una coppia `{pattern → topic}`. Il motore:
1. Normalizza il testo (minuscolo) senza rimuovere accenti.
2. Esegue i pattern in ordine di configurazione per `detect_topic` (singolo) e li raccoglie tutti per `detect_topics` (multi).
3. Ordina i match multi-topic per posizione di prima occorrenza e (a parità) per lunghezza pattern (più lungo prima).
4. Limita il numero massimo (default 5) per evitare rumore.

Implica che pattern troppo generici possono “contaminare” il set dei primi 5 se compaiono sempre: controlla i log.

## 🧩 Principi Fondamentali
| Principio | Spiegazione | Applicazione |
|-----------|-------------|--------------|
| Specificità | Più il pattern è preciso, meno falsi positivi | Usa frasi chiave complete |
| Stabilità | Evita pattern soggetti a drift linguistico | Evita slang temporanei |
| Isolamento | Un pattern deve identificare un concetto unico | Non unire domini distanti nello stesso pattern |
| Minimizzazione | Meno varianti possibili, più semplice mantenere | Usa gruppi `(x|y)` solo se necessario |
| Tracciabilità | Il pattern deve spiegare il match nei log | Niente pattern oscuri senza commento |

## ❌ Errori Comuni da Evitare
| Errore | Perché è un problema | Soluzione |
|--------|----------------------|-----------|
| Alternativa vuota (`foo|`) | Matcha anche stringa vuota → tutti i testi | Rimuovi il `|` finale |
| Doppio pipe `||` | Interpreta alternativa vuota | Elimina uno dei due |
| Pattern troppo generico (`scuola`) | Troppi falsi positivi | Restringi: `\bscuola primaria\b` |
| Mancate ancore | Matcha dentro parole più lunghe | Usa `\b` ai bordi |
| Uso eccessivo di `.*` | Match “goloso” | Preferisci `[^\n]{0,80}` o gruppi specifici |
| Case sensitive inatteso | Salta varianti maiuscole | Il backend usa flag `i`, non serve `[Mm]` |

## 🎯 Pattern Specifici vs Generici
Dichiara prima (o scrivi più specifici) pattern che identificano concetti composti e lascia quelli generali come fallback.

Esempio migliore:
```
\bmemoria di lavoro\b
\bmemoria a lungo termine\b
\bmemoria\b
```
(Nel multi-topic ordering interno vincono quelli che appaiono PRIMA nel testo; a parità, quello con pattern più lungo.)

## 🧪 Collaudo Rapido
Nel pannello Pipeline:
1. Inserisci un testo di prova in “Test regex”.
2. Verifica quali topic vengono evidenziati (riga verde).
3. Modifica i pattern fino a ridurre falsi positivi.

## 🧬 Esempi di Buoni Pattern
| Intento | Pattern consigliato |
|---------|---------------------|
| Funzioni esecutive | `\b(funzioni?|processi) esecutiv(e|i)\b` |
| Memoria di lavoro | `\bmemoria di lavoro\b` |
| Attenzione selettiva | `\battenzione selettiv(a|e)\b` |
| DSA generico | `\b(dislessia|discalculia|disgrafia|dsa)\b` |

## 🔨 Costruzione Progressiva di un Pattern
Esempio: topic “funzioni esecutive legate alla pianificazione scolastica”.
1. Bozza ingenua: `funzioni esecutive` (ok ma generico)
2. Aggiungo contesto facoltativo: `funzioni esecutive(?:.*pianificazion(e|i))?`
3. Limito la distanza: `funzioni esecutive[^\n]{0,80}pianificazion(e|i)`
4. Refinement finale con bordi: `\bfunzioni esecutive[^\n]{0,80}pianificazion(e|i)\b`

## 🔡 Gestione Varianti Morfologiche
Italiano variabile: plurali, femminile/maschile, suffissi. Usa gruppi minimali:
```
\bstrategi(e|a) metacognitiv(e|a)\b
\b(difficolt[aà]|problem[ai]) di (lettura|scrittura)\b
```
Evitare: `(strategia|strategie|strategico|strategicamente)` se bastano le prime due.

## é / è / Accenti e Normalizzazione
Se l'utente può omettere accenti:
```
\bmemori(a|e) di lavor(o|\b)
```
Per tolleranza più ampia, includi set: `[àa]`. Non esagerare: ogni carattere extra aumenta combinazioni.

## ⚙️ Prestazioni e Scalabilità
| Fattore | Impatto | Raccomandazione |
|---------|---------|-----------------|
| Numero pattern | Lineare | Mantienilo < 150 |
| Pattern “.*” lunghi | Potenziale backtracking | Usa classi limitate `[^
]{0,120}` |
| Alternanze grandi `(a|b|c|...)` | Più rami | Raggruppa per prefisso comune |
| Look-around annidati | Costosi | Evitali se non indispensabili |

Benchmark mentale: un singolo `re.finditer` su testo medio (<3K chars) con 100 pattern puliti è trascurabile.

## 🔍 Debug Logging
Ogni risposta registra:
```
"topics_multi": [ {"topic":"memoria", "pattern":"\\bmemoria\\b"}, ... ]
"topics_patterns": ["\\bmemoria\\b", ...]
```
Se vedi topic ricorrenti in tutti i messaggi:
- Controlla se un pattern contiene `|` finale o `||`.
- Assicurati che non esista un pattern banale tipo `.*` o `.`.

## ♻️ Strategie di Refactoring
1. Raccogli log ultimi 7 giorni → estrai pattern con >90% match rate.
2. Per ciascuno: è davvero necessario? Riducilo o specializzalo.
3. Unisci pattern ridondanti: `\bmemoria di (lavoro|breve termine)\b`.
4. Spezza pattern multi-concetto in due se i file associati differiscono.

## 🛠 Consigli di Manutenzione
- Rivedi periodicamente i log per eliminare pattern non più utili.
- Mantieni i topic coerenti con i file associati (contenuti didattici mirati).
- Limita i pattern a ciò che serve davvero (<= 100 idealmente) per prestazioni.

## ✅ Checklist Prima di Salvare
- [ ] Nessun `|` finale o `||`.
- [ ] Uso di `\b` dove serve.
- [ ] Pattern testato nel box “Test regex”.
- [ ] Nessun carattere speciale non intenzionale (es: parentesi non chiuse).
- [ ] Niente `.*` superflui.

## 🆘 Troubleshooting Rapido
| Sintomo | Possibile causa | Azione |
|---------|-----------------|--------|
| Tutti i messaggi matchano stesso topic | Alternativa vuota o pattern generico | Cerca `|)` o `||` o `.*` nel file config |
| Topic atteso assente | Pattern troppo restrittivo | Rimuovi quantificatori, prova senza `\b` finale |
| Performance degradata | Pattern lunghi con backtracking | Sostituisci `.*` con classi limitate |
| Overlap eccessivo | Pattern sovrapposti semanticamente | Decidi un “owner” concettuale |
| Log confusi | Pattern poco leggibili | Aggiungi commenti o rinomina topic/file |

## ❓ FAQ
**D: Devo mettere flag `i`?**  R: No, il backend usa ricerca case-insensitive.

**D: Posso usare look-behind?**  R: Sì (Python lo supporta) ma evita look-behind variabile per complessità.

**D: Posso usare Unicode class (\p{...})?**  R: Il modulo `re` standard non supporta `\p{}`: usa classi esplicite o `regex` (non adottato qui).

**D: Cosa succede se due pattern matchano stessa posizione?**  R: Ordinamento: prima occorrenza, poi pattern più lungo.

**D: Come limito la distanza fra due parole?**  R: `parola1[^\n]{0,60}parola2`.

**D: Posso commentare pattern?**  R: Nel JSON no (commenti non standard). Crea un file markdown associato.

## 🚀 Futuri Miglioramenti Possibili
- Validatore automatico (segnala pattern sospetti).
- Evidenziazione match live nel testo di prova.
- Suggerimenti generati dall'LLM per pattern migliori.

---
## 🌐 Sintesi Bilingue
| IT | EN |
|----|----|
| Usa `\b` per limiti parola e evita alternative vuote | Use `\b` for word boundaries; avoid empty alternations |
| Limita `.*` e preferisci classi con range | Limit `.*`; prefer bounded character classes |
| Analizza i log `topics_patterns` per pulizia | Inspect `topics_patterns` logs for cleanup |
| Specifica prima i pattern più lunghi | Put longer, specific patterns first |
| Meno di 150 pattern per performance | Keep pattern count < 150 for performance |

---
Per dubbi aggiungi una nota nel file o proponi un refactoring incrementale.

# Come funziona il chatbot (versione per profani)

Questo chatbot e supervisionato: significa che ha imparato da esempi guidati e non improvvisa a
caso. Il suo compito e dare risposte chiare e utili, usando sia regole semplici sia i documenti
che ha a disposizione.

La supervisione e anche umana: le conversazioni possono essere viste da un tutor. Se una risposta
del chatbot va corretta, un tutor puo contattarti per chiarire o integrare.

## Spiegazione breve e discorsiva

Quando fai una domanda, il sistema prova prima a capire se e una richiesta molto comune. In quel
caso usa delle regole (regex) per rispondere in modo diretto e coerente. Se invece la domanda e piu
specifica, il chatbot cerca nei documenti disponibili e usa le parti piu rilevanti per costruire
una risposta precisa. Questo metodo si chiama RAG, ma puoi pensarlo come "cerca e riassume".

Alla fine ti mostra anche le fonti, cosi puoi vedere da dove arrivano le informazioni.

Durante la raccolta dei risultati, il chatbot chiede i punteggi del questionario in due momenti:
prima i fattori C1–C7 e poi quelli A1–A7. Questo passaggio aiuta a capire meglio il profilo e a
dare consigli piu mirati, sempre con parole semplici.

## Le parole chiave in modo semplice

- Supervisionato: ha imparato da esempi corretti, quindi segue un percorso gia definito.
- Regex: piccole regole che riconoscono domande ricorrenti e danno risposte immediate.
- RAG: prima cerca nei documenti, poi usa quello che ha trovato per rispondere.
- Fonti: i documenti usati vengono mostrati con link e nomi file.

## Limiti, in parole chiare

- Se nei documenti non c'e la risposta, il chatbot potrebbe essere generico.
- Le regole non coprono tutte le varianti possibili di una domanda.
- Non sostituisce un parere professionale: e un supporto informativo.

## In sintesi

Il chatbot unisce regole semplici e ricerca nei documenti per dare risposte piu affidabili,
sempre in modo supervisionato.

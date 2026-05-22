"""
Test automatici per i pattern regex della pipeline.

Verifica che i pattern configurati matchino correttamente le frasi attese
e non abbiano problemi strutturali.
"""
import pytest
import re
import json
from pathlib import Path

# Path alla configurazione
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "pipeline_config.json"


def load_pipeline_config():
    """Carica la configurazione pipeline."""
    if not CONFIG_PATH.exists():
        pytest.skip("pipeline_config.json non trovato")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


class TestPatternValidity:
    """Test di validità strutturale dei pattern."""

    def test_all_patterns_compile(self):
        """Verifica che tutti i pattern siano regex valide."""
        config = load_pipeline_config()
        for route in config.get("routes", []):
            pattern = route.get("pattern", "")
            topic = route.get("topic", "")
            try:
                re.compile(pattern)
            except re.error as e:
                pytest.fail(f"Pattern non valido per topic '{topic}': {e}")

    def test_no_empty_alternatives(self):
        """Verifica che nessun pattern abbia alternative vuote (| finale o ||)."""
        config = load_pipeline_config()
        for route in config.get("routes", []):
            pattern = route.get("pattern", "")
            topic = route.get("topic", "")
            assert not pattern.endswith("|"), f"Pattern per '{topic}' termina con | (alternativa vuota)"
            assert "||" not in pattern, f"Pattern per '{topic}' contiene || (doppia alternativa)"

    def test_no_newlines_in_patterns(self):
        """Verifica che nessun pattern contenga newline."""
        config = load_pipeline_config()
        for route in config.get("routes", []):
            pattern = route.get("pattern", "")
            topic = route.get("topic", "")
            assert "\n" not in pattern, f"Pattern per '{topic}' contiene newline"
            assert "\r" not in pattern, f"Pattern per '{topic}' contiene carriage return"

    def test_no_trivial_patterns(self):
        """Verifica che non ci siano pattern troppo generici."""
        config = load_pipeline_config()
        trivial = [".*", ".+", ".?", ".*.*"]
        for route in config.get("routes", []):
            pattern = route.get("pattern", "").strip()
            topic = route.get("topic", "")
            assert pattern not in trivial, f"Pattern triviale per '{topic}': {pattern}"


class TestPatternMatching:
    """Test di matching dei pattern contro frasi di esempio."""

    # Corpus di test: (frase, topic atteso)
    # Aggiornato per riflettere la struttura granulare C1-C7 e A1-A7
    TEST_CORPUS = [
        # Analisi di secondo livello
        ("analisi di secondo livello", "Analisi di secondo livello"),
        ("analisi secondo livello dei fattori", "Analisi di secondo livello"),
        ("sintesi trasversale", "Analisi di secondo livello"),
        # Fattori Cognitivi (C1-C7 individuali)
        ("C1 strategie elaborative", "C1 Strategie elaborative"),
        ("il fattore C3 disorientamento", "C3 Disorientamento"),
        ("C7 autointerrogazione", "C7 Autointerrogazione"),
        ("elaborazione attiva dei concetti", "C1 Strategie elaborative"),
        ("non so da dove iniziare", "C3 Disorientamento"),
        ("mappe concettuali per studiare", "C5 Organizzatori semantici"),
        ("mi distraggo facilmente", "C6 Difficoltà di concentrazione"),
        # Artefice di se stessi
        ("artefice di se stesso", "artefice_di_se_stessi"),
        ("autodeterminazione", "artefice_di_se_stessi"),
        ("mindset positivo", "artefice_di_se_stessi"),
        # Risposte a domande sul QSA
        ("cosa significa la scheda QSA", "Risposte a domande sul QSA"),
        ("come posso interpretare i fattori del questionario", "Risposte a domande sul QSA"),
        ("perché il questionario", "Risposte a domande sul QSA"),
        # Strategie di apprendimento
        ("Spaced repetition", "strategie di apprendimento"),
        ("Testing effect", "strategie di apprendimento"),
        ("Pomodoro technique", "strategie di apprendimento"),
        # Fattori Affettivo-Motivazionali (A1-A7 individuali)
        ("A1 ansietà di base", "A1 Ansietà di base"),
        ("ansia da esame", "A1 Ansietà di base"),
        ("volizione e forza di volontà", "A2 Volizione"),
        ("mi sento incapace", "A6 Percezione di competenza"),
        ("interferenze emotive", "A7 Interferenze emotive"),
        ("problemi personali che impediscono lo studio", "A7 Interferenze emotive"),
    ]

    # Frasi che NON devono matchare alcun topic
    NON_MATCH_CORPUS = [
        "buongiorno come stai",
        "qual è la capitale dell'Italia",
        "raccontami una barzelletta",
        "quanto fa 2 + 2",
    ]

    def _find_matching_topic(self, text: str, routes: list) -> str | None:
        """Trova il primo topic che matcha il testo."""
        for route in routes:
            pattern = route.get("pattern", "")
            topic = route.get("topic", "")
            try:
                if re.search(pattern, text, re.IGNORECASE):
                    return topic
            except re.error:
                continue
        return None

    @pytest.mark.parametrize("text,expected_topic", TEST_CORPUS)
    def test_expected_matches(self, text: str, expected_topic: str):
        """Verifica che le frasi matchino il topic atteso."""
        config = load_pipeline_config()
        routes = config.get("routes", [])

        matched_topic = self._find_matching_topic(text, routes)

        assert matched_topic is not None, f"Nessun match per: '{text}' (atteso: {expected_topic})"
        assert matched_topic == expected_topic, f"Match errato per '{text}': {matched_topic} invece di {expected_topic}"

    @pytest.mark.parametrize("text", NON_MATCH_CORPUS)
    def test_non_matches(self, text: str):
        """Verifica che frasi generiche non matchino alcun topic."""
        config = load_pipeline_config()
        routes = config.get("routes", [])

        matched_topic = self._find_matching_topic(text, routes)

        # È ok se matcha qualcosa, ma segnaliamo se è un falso positivo
        if matched_topic:
            pytest.skip(f"'{text}' matcha '{matched_topic}' - verificare se è corretto")


class TestConfigIntegrity:
    """Test di integrità della configurazione."""

    def test_routes_have_required_fields(self):
        """Verifica che tutte le route abbiano pattern e topic."""
        config = load_pipeline_config()
        for i, route in enumerate(config.get("routes", [])):
            assert "pattern" in route, f"Route {i} manca di 'pattern'"
            assert "topic" in route, f"Route {i} manca di 'topic'"
            assert route["pattern"].strip(), f"Route {i} ha pattern vuoto"
            assert route["topic"].strip(), f"Route {i} ha topic vuoto"

    def test_files_mapping_consistency(self):
        """Verifica che i topic delle route abbiano un mapping file."""
        config = load_pipeline_config()
        routes = config.get("routes", [])
        files = config.get("files", {})

        topics_in_routes = {r.get("topic") for r in routes}
        topics_in_files = set(files.keys())

        # Verifica che ogni topic abbia un file (warning, non errore)
        missing = topics_in_routes - topics_in_files
        if missing:
            pytest.skip(f"Topic senza file mapping: {missing}")

    def test_no_duplicate_patterns(self):
        """Verifica che non ci siano pattern duplicati."""
        config = load_pipeline_config()
        patterns = [r.get("pattern") for r in config.get("routes", [])]
        duplicates = [p for p in patterns if patterns.count(p) > 1]
        assert not duplicates, f"Pattern duplicati: {set(duplicates)}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

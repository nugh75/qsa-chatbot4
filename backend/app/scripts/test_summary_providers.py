import asyncio, os, json, sys
from datetime import datetime
from typing import List, Dict

# Ensure 'app' package is importable both when run as script and via -m
CURRENT_DIR = os.path.dirname(__file__)
APP_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..'))          # /.../app
PARENT_DIR = os.path.abspath(os.path.join(APP_DIR, '..'))           # backend root
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

try:
    from app.llm import chat_with_provider  # type: ignore
    from app.admin import load_config       # type: ignore
except ImportError as e:
    print(f"[IMPORT ERROR] {e}\nSuggerimento: esegui con 'python -m app.scripts.test_summary_providers' dalla cartella backend.")
    raise

TEST_MESSAGES: List[Dict] = [
    {"role": "user", "content": "Ciao, questo è un test per riassunto. Parliamo del questionario QSA e dei punteggi."},
    {"role": "assistant", "content": "Certamente, dimmi cosa vuoi analizzare."},
    {"role": "user", "content": "Voglio un riassunto sintetico."}
]

async def test_provider(provider: str, model: str | None) -> Dict:
    start = datetime.utcnow()
    try:
        reply = await chat_with_provider(TEST_MESSAGES, provider=provider, model=model, is_summary_request=True)
        ok = True
        note = "ok"
        if not reply or not reply.strip():
            ok = False
            note = "empty reply"
        elif "fallback" in reply.lower():
            note = "fallback string"
        return {
            "provider": provider,
            "model": model,
            "ok": ok,
            "chars": len(reply or ""),
            "preview": (reply or "")[:160],
            "note": note,
            "duration_s": (datetime.utcnow() - start).total_seconds()
        }
    except Exception as e:
        return {
            "provider": provider,
            "model": model,
            "ok": False,
            "error": str(e),
            "duration_s": (datetime.utcnow() - start).total_seconds()
        }

async def main():
    cfg = load_config()
    ai = cfg.get("ai_providers", {})
    summary = cfg.get("summary_settings", {})
    wanted = summary.get("provider")
    print(f"Summary config provider: {wanted}")
    # Env diagnostics
    env_needed = {
        'OPENAI_API_KEY': 'openai',
        'OPENROUTER_API_KEY': 'openrouter',
        'GOOGLE_API_KEY': 'gemini',
        'ANTHROPIC_API_KEY': 'claude'
    }
    print("\n[ENV CHECK]")
    for var, prov in env_needed.items():
        val = os.getenv(var)
        print(f"  {var:20s} => {'SET' if val else 'MISSING'}")
    force = os.getenv('FORCE_PROVIDER')
    if force:
        print(f"\n[FILTER] Eseguirò solo il provider forzato: {force}")
    results = []
    for p, info in ai.items():
        if not info.get("enabled"): continue
        if force and p != force:
            continue
        sel_model = info.get("selected_model") or None
        print(f"\n--- Testing provider={p} model={sel_model} ---")
        res = await test_provider(p, sel_model)
        results.append(res)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    print("\n=== Compact Report ===")
    for r in results:
        status = "OK" if r.get("ok") else "FAIL"
        print(f"{r['provider']:10s} {status:4s} {r.get('chars',0):5d}ch note={r.get('note') or r.get('error')}")

if __name__ == "__main__":
    # Permetti forzare un provider singolo: python ... test_summary_providers.py openrouter
    if len(sys.argv) > 1:
        os.environ['FORCE_PROVIDER'] = sys.argv[1]
    asyncio.run(main())

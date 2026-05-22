#!/usr/bin/env python3
"""
Download required local models for QSA Chatbot:
- Whisper (default: small) saved under backend/models/whisper
- Sentence-Transformers embeddings (default: paraphrase-multilingual-MiniLM-L12-v2)
- Piper voice (default: it_IT-riccardo-x_low) under backend/models/piper

This script is idempotent and safe to run multiple times.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
import urllib.request


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def download_file(url: str, dest: Path) -> bool:
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url) as r, open(dest, "wb") as f:
            f.write(r.read())
        return True
    except Exception as e:
        print(f"WARN: failed to download {url}: {e}")
        return False


def download_whisper(model_name: str, whisper_dir: Path) -> None:
    ensure_dir(whisper_dir)
    model_path = whisper_dir / f"{model_name}.pt"
    if model_path.exists():
        print(f"Whisper model already present: {model_path}")
        return
    print(f"Downloading Whisper model '{model_name}' into {model_path} ...")
    import whisper  # lazy import
    import torch

    m = whisper.load_model(model_name)
    torch.save(m.state_dict(), model_path)
    print("Whisper model saved.")


def resolve_piper_urls(voice: str) -> list[str]:
    # Try Hugging Face mirror first (more stable than GH release assets)
    # Example voice: it_IT-riccardo-x_low -> lang=it, locale=it_IT, base=it_IT-riccardo
    parts = voice.split("-")
    lang = parts[0].split("_")[0] if parts and "_" in parts[0] else "it"
    locale = parts[0] if parts else "it_IT"
    base = "-".join(parts[:2]) if len(parts) >= 2 else voice
    hf_base = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{lang}/{locale}/{base}/{voice}"
    gh_base = f"https://github.com/rhasspy/piper/releases/download/v0.0.2/{voice}"
    return [
        hf_base + ".onnx",
        hf_base + ".onnx.json",
        gh_base + ".onnx",
        gh_base + ".onnx.json",
    ]


def download_piper(voice: str, piper_dir: Path) -> None:
    ensure_dir(piper_dir)
    model_path = piper_dir / f"{voice}.onnx"
    cfg_path = piper_dir / f"{voice}.onnx.json"
    if model_path.exists() and cfg_path.exists():
        print(f"Piper voice already present: {voice}")
        return
    print(f"Attempting to download Piper voice '{voice}' ...")
    urls = resolve_piper_urls(voice)
    ok_model = False
    ok_cfg = False
    for url in urls:
        if url.endswith(".onnx") and not ok_model:
            ok_model = download_file(url, model_path)
        if url.endswith(".json") and not ok_cfg:
            ok_cfg = download_file(url, cfg_path)
        if ok_model and ok_cfg:
            break
    if ok_model and ok_cfg:
        print("Piper voice downloaded.")
    else:
        print("WARN: Piper voice not fully downloaded; you can place files manually in 'backend/models/piper'.")


def warmup_sentence_transformers(model_name: str, cache_dir: Path) -> None:
    ensure_dir(cache_dir)
    # Direct Sentence-Transformers cache
    os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(cache_dir))
    # Hugging Face cache
    os.environ.setdefault("HF_HOME", str(cache_dir / "hf_cache"))
    print(f"Warming up embeddings model '{model_name}' (cache at {cache_dir}) ...")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_name)
    _ = model.encode(["warmup"])  # force weights load
    print("Embeddings model cached.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download local models for QSA Chatbot")
    parser.add_argument("--whisper", default="small", help="Whisper model name (tiny|base|small|medium|large)")
    parser.add_argument("--piper", action="append", default=["it_IT-riccardo-x_low"], help="Piper voice id (repeatable)")
    parser.add_argument(
        "--embeddings",
        default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        help="Sentence-Transformers model id",
    )
    parser.add_argument("--base", default=str(Path(__file__).parent.parent), help="Backend app base dir")
    args = parser.parse_args()

    base_dir = Path(args.base).resolve().parent  # move from app/ to backend/
    models_dir = base_dir / "models"
    whisper_dir = models_dir / "whisper"
    piper_dir = models_dir / "piper"
    st_cache = models_dir / "sentence-transformers"

    try:
        download_whisper(args.whisper, whisper_dir)
    except Exception as e:
        print(f"WARN: Whisper download failed: {e}")

    try:
        warmup_sentence_transformers(args.embeddings, st_cache)
    except Exception as e:
        print(f"WARN: Embeddings warmup failed: {e}")

    for voice in args.piper:
        try:
            download_piper(voice, piper_dir)
        except Exception as e:
            print(f"WARN: Piper download failed ({voice}): {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())


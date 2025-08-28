import os
import json
import logging
from datetime import datetime
from pathlib import Path
from logging.handlers import RotatingFileHandler

BASE_DIR = Path(__file__).parent.parent
LOG_DIR = BASE_DIR / "storage" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

_system_logger = None

def get_system_logger() -> logging.Logger:
    global _system_logger
    if _system_logger:
        return _system_logger
    logger = logging.getLogger("qsa_system")
    logger.setLevel(logging.INFO)
    # Evita duplicazione messaggi
    logger.propagate = False

    log_file = LOG_DIR / "system.log"
    handler = RotatingFileHandler(log_file, maxBytes=2_000_000, backupCount=5, encoding='utf-8')
    fmt = logging.Formatter(fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    handler.setFormatter(fmt)
    logger.addHandler(handler)

    _system_logger = logger
    return logger

def log_system(level: int, message: str):
    logger = get_system_logger()
    logger.log(level, message)

def _interactions_file_path() -> Path:
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    return LOG_DIR / f"interactions_{date_str}.jsonl"

def log_interaction(data: dict):
    """Append a single JSON line with interaction details.
    The function ensures the directory exists.
    """
    try:
        path = _interactions_file_path()
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        # Enrich with server timestamp if missing
        if "ts" not in data:
            data["ts"] = datetime.utcnow().isoformat() + 'Z'
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")
    except Exception as e:
        # Last resort: log to system logger
        get_system_logger().error(f"Failed to log interaction: {e}")


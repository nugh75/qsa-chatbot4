from __future__ import annotations

import os
from typing import Dict, Optional


def build_openai_headers(api_key: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Return base headers for OpenAI HTTP requests.

    Supports optional OPENAI_PROJECT_ID / OPENAI_PROJECT and OPENAI_ORG_ID / OPENAI_ORGANIZATION
    environment variables so project-scoped keys work without additional configuration.
    """
    headers: Dict[str, str] = {"Authorization": f"Bearer {api_key}"}
    project = os.getenv("OPENAI_PROJECT_ID") or os.getenv("OPENAI_PROJECT")
    organization = os.getenv("OPENAI_ORG_ID") or os.getenv("OPENAI_ORGANIZATION")
    if project:
        headers["OpenAI-Project"] = project
    if organization:
        headers["OpenAI-Organization"] = organization
    if extra:
        headers.update(extra)
    return headers


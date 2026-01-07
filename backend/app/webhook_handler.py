"""Handler per chiamate webhook esterne (es. n8n).

Quando una personalità ha webhook_enabled=True e webhook_url configurato,
i messaggi vengono inoltrati al webhook invece di usare il provider LLM interno.
"""

import httpx
import json
import logging
from typing import Optional, List, Dict, Any, AsyncGenerator
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class WebhookConfig:
    """Configurazione webhook per una personalità."""
    url: str
    timeout: int = 60
    auth_header: Optional[str] = None
    include_history: bool = True


@dataclass
class WebhookRequest:
    """Dati da inviare al webhook."""
    message: str
    session_id: str
    conversation_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None
    personality_id: Optional[str] = None
    personality_name: Optional[str] = None
    user_id: Optional[str] = None
    attachments: Optional[List[Dict]] = None


def _build_payload(config: WebhookConfig, request: WebhookRequest, stream: bool = False) -> Dict[str, Any]:
    """Costruisce il payload JSON da inviare al webhook."""
    payload = {
        "message": request.message,
        "session_id": request.session_id,
        "conversation_id": request.conversation_id,
        "personality_id": request.personality_id,
        "personality_name": request.personality_name,
        "user_id": request.user_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stream": stream,
    }

    if config.include_history and request.history:
        payload["history"] = request.history

    if request.attachments:
        payload["attachments"] = request.attachments

    return payload


def _build_headers(config: WebhookConfig, accept_sse: bool = False) -> Dict[str, str]:
    """Costruisce gli headers HTTP per la richiesta."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream, application/json" if accept_sse else "application/json",
    }

    if config.auth_header:
        headers["Authorization"] = config.auth_header

    return headers


def _extract_response_text(data: Any) -> str:
    """Estrae il testo della risposta da vari formati JSON."""
    if isinstance(data, dict):
        # Supporta vari formati comuni
        for key in ["response", "reply", "message", "text", "content", "answer", "output"]:
            if key in data and data[key]:
                return str(data[key])
        return str(data)
    return str(data)


async def call_webhook(
    config: WebhookConfig,
    request: WebhookRequest
) -> str:
    """Chiama il webhook e restituisce la risposta testuale.

    Per risposte non-streaming. Attende la risposta completa.

    Args:
        config: Configurazione webhook (url, timeout, auth, etc.)
        request: Dati della richiesta (messaggio, sessione, history, etc.)

    Returns:
        Testo della risposta dal webhook

    Raises:
        Exception: Se il webhook fallisce o va in timeout
    """
    payload = _build_payload(config, request, stream=False)
    headers = _build_headers(config, accept_sse=False)

    logger.info(f"[webhook] Calling {config.url} with timeout={config.timeout}s")

    async with httpx.AsyncClient(timeout=float(config.timeout)) as client:
        try:
            response = await client.post(
                config.url,
                json=payload,
                headers=headers
            )
            response.raise_for_status()

            # Prova a parsare come JSON
            try:
                data = response.json()
                return _extract_response_text(data)
            except json.JSONDecodeError:
                # Fallback a testo puro
                return response.text.strip()

        except httpx.TimeoutException:
            logger.error(f"[webhook] Timeout calling {config.url}")
            raise Exception(f"Webhook timeout dopo {config.timeout} secondi")
        except httpx.HTTPStatusError as e:
            logger.error(f"[webhook] HTTP error {e.response.status_code}: {e.response.text[:200]}")
            raise Exception(f"Errore webhook: HTTP {e.response.status_code}")
        except Exception as e:
            logger.error(f"[webhook] Error: {e}")
            raise


async def call_webhook_streaming(
    config: WebhookConfig,
    request: WebhookRequest
) -> AsyncGenerator[str, None]:
    """Chiama il webhook e produce chunks di risposta via SSE.

    Supporta due formati di risposta dal webhook:
    1. SSE standard: data: {"delta": "..."}\n\n
    2. Testo puro chunked (fallback)

    Args:
        config: Configurazione webhook
        request: Dati della richiesta

    Yields:
        Chunks di testo della risposta
    """
    payload = _build_payload(config, request, stream=True)
    headers = _build_headers(config, accept_sse=True)

    logger.info(f"[webhook-stream] Calling {config.url} with timeout={config.timeout}s")

    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream(
                "POST",
                config.url,
                json=payload,
                headers=headers,
                timeout=float(config.timeout)
            ) as response:
                response.raise_for_status()

                content_type = response.headers.get("content-type", "")

                if "text/event-stream" in content_type:
                    # SSE format
                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        while "\n\n" in buffer:
                            event, buffer = buffer.split("\n\n", 1)
                            for line in event.split("\n"):
                                if line.startswith("data:"):
                                    data_str = line[5:].strip()
                                    if data_str and data_str != "[DONE]":
                                        try:
                                            data = json.loads(data_str)
                                            if isinstance(data, dict):
                                                # Supporta vari formati di delta
                                                for key in ["delta", "text", "content", "chunk"]:
                                                    if key in data:
                                                        yield data[key]
                                                        break
                                            else:
                                                yield str(data)
                                        except json.JSONDecodeError:
                                            # Non è JSON, usa come testo
                                            yield data_str
                else:
                    # Non-SSE: accumula e restituisci tutto insieme
                    full_response = ""
                    async for chunk in response.aiter_text():
                        full_response += chunk

                    # Prova JSON
                    try:
                        data = json.loads(full_response)
                        yield _extract_response_text(data)
                    except json.JSONDecodeError:
                        yield full_response.strip()

        except httpx.TimeoutException:
            logger.error(f"[webhook-stream] Timeout calling {config.url}")
            yield f"[Errore: Webhook timeout dopo {config.timeout} secondi]"
        except httpx.HTTPStatusError as e:
            logger.error(f"[webhook-stream] HTTP error {e.response.status_code}")
            yield f"[Errore: HTTP {e.response.status_code}]"
        except Exception as e:
            logger.error(f"[webhook-stream] Error: {e}")
            yield f"[Errore webhook: {str(e)}]"

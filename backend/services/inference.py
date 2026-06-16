"""Async HTTP client that proxies chat-completion requests to llama-server.

The primary function :func:`stream_chat_completion` sends a request to
the OpenAI-compatible ``/v1/chat/completions`` endpoint and yields the
raw SSE chunks back to the caller as an async generator so that
:class:`~starlette.responses.StreamingResponse` can proxy them
directly to the frontend.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

logger = logging.getLogger("belirix.inference")

# Re-usable timeout configuration
_CONNECT_TIMEOUT = 10.0   # seconds to establish the connection
_READ_TIMEOUT = 120.0     # generous — model inference can be slow
_WRITE_TIMEOUT = 10.0


class InferenceClient:
    """Thin async wrapper around llama-server's chat-completion API."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 8080,
    ) -> None:
        self._base_url = f"http://{host}:{port}"
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(
                connect=_CONNECT_TIMEOUT,
                read=_READ_TIMEOUT,
                write=_WRITE_TIMEOUT,
                pool=_CONNECT_TIMEOUT,
            ),
        )
        logger.info("InferenceClient ready — target %s", self._base_url)

    async def stop(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        logger.info("InferenceClient closed")

    async def stream_chat_completion(
        self,
        *,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        """Send a chat-completion request and yield raw SSE lines.

        Each yielded string is a complete SSE event line
        (e.g. ``data: {...}\\n\\n``) ready to be forwarded to the client.

        Raises:
            httpx.HTTPError: If the connection to llama-server fails.
        """
        if self._client is None:
            raise RuntimeError("InferenceClient has not been started")

        payload: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        logger.debug(
            "Sending chat completion — %d messages, temp=%.2f, max_tokens=%d",
            len(messages),
            temperature,
            max_tokens,
        )

        async with self._client.stream(
            "POST",
            "/v1/chat/completions",
            json=payload,
            headers={"Accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                # llama-server sends lines like:
                #   data: {"id":"...","choices":[...]}
                #   data: [DONE]
                if not line:
                    continue
                yield f"{line}\n\n"

    async def chat_completion(
        self,
        *,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> dict[str, Any]:
        """Send a non-streaming chat-completion request."""
        if self._client is None:
            raise RuntimeError("InferenceClient has not been started")

        payload: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }

        resp = await self._client.post(
            "/v1/chat/completions",
            json=payload,
        )
        resp.raise_for_status()
        result: dict[str, Any] = resp.json()
        return result

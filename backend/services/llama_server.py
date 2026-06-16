"""Health-check client for the llama-server subprocess.

Polls ``/health`` on the llama-server (OpenAI-compatible API) and
tracks its availability so the rest of the application can degrade
gracefully when the model backend is unreachable.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Literal

import httpx

logger = logging.getLogger("belirix.llama_server")


class LlamaServerMonitor:
    """Async health monitor for llama-server.

    Attributes:
        status: Current observed status of the llama-server.
        last_checked: Unix timestamp of the most recent successful check.
    """

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 8080,
        poll_interval: float = 10.0,
        timeout: float = 5.0,
    ) -> None:
        self._base_url = f"http://{host}:{port}"
        self._poll_interval = poll_interval
        self._timeout = timeout

        self.status: Literal["ok", "degraded", "unavailable"] = "unavailable"
        self.last_checked: float | None = None

        self._client: httpx.AsyncClient | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Create the HTTP client and begin polling in the background."""
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
        )
        self._task = asyncio.create_task(
            self._poll_loop(), name="llama-server-health"
        )
        logger.info(
            "LlamaServerMonitor started — polling %s every %.0fs",
            self._base_url,
            self._poll_interval,
        )

    async def stop(self) -> None:
        """Cancel the polling task and close the HTTP client."""
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        logger.info("LlamaServerMonitor stopped")

    async def check_health(self) -> Literal["ok", "degraded", "unavailable"]:
        """Probe the ``/health`` endpoint once and return the status."""
        if self._client is None:
            return "unavailable"

        try:
            resp = await self._client.get("/health")
            if resp.status_code == 200:
                self.status = "ok"
            else:
                # llama-server returns 503 while loading
                self.status = "degraded"
            self.last_checked = time.time()
        except httpx.HTTPError as exc:
            logger.warning("llama-server health check failed: %s", exc)
            self.status = "unavailable"
        except Exception:
            logger.exception("Unexpected error during health check")
            self.status = "unavailable"

        return self.status

    async def _poll_loop(self) -> None:
        """Periodically check llama-server health."""
        while True:
            await self.check_health()
            logger.debug("llama-server status: %s", self.status)
            await asyncio.sleep(self._poll_interval)

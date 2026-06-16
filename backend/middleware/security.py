from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("belirix.security")

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory sliding-window rate limiter.

    No Redis needed — Belirix is a single-server deployment.
    """

    def __init__(
        self,
        app,
        requests_per_minute: int = 60,
        path_prefix: str = "/api/",
    ) -> None:
        super().__init__(app)
        self._limit = requests_per_minute
        self._window = 60.0
        self._prefix = path_prefix
        # IP → list of timestamps
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Only rate-limit API paths
        if not request.url.path.startswith(self._prefix):
            return await call_next(request)

        # Skip health endpoint from rate limiting
        if request.url.path == "/api/health":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()

        # Prune timestamps outside the window
        timestamps = self._hits[client_ip]
        cutoff = now - self._window
        self._hits[client_ip] = [t for t in timestamps if t > cutoff]

        if len(self._hits[client_ip]) >= self._limit:
            logger.warning("Rate limit exceeded for %s", client_ip)
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please wait before trying again.",
                },
                headers={"Retry-After": "60"},
            )

        self._hits[client_ip].append(now)
        return await call_next(request)

class RequestIDMiddleware(BaseHTTPMiddleware):
    """Injects a unique X-Request-ID into every request/response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        # Store on request state for downstream logging
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds defensive headers to every response.

    Nginx also sets these, but defense-in-depth means we set them at
    the application layer too.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Cache-Control", "no-store, no-cache, must-revalidate"
        )
        response.headers.setdefault("Pragma", "no-cache")
        return response

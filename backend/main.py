"""Belirix — FastAPI application entry point.

Wires up routing, middleware, CORS, and the llama-server health monitor.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from middleware.security import (
    RateLimitMiddleware,
    RequestIDMiddleware,
    SecurityHeadersMiddleware,
)
from routers.chat import router as chat_router
from services.inference import InferenceClient
from services.llama_server import LlamaServerMonitor

load_dotenv()

LLAMA_HOST = os.getenv("LLAMA_SERVER_HOST", "127.0.0.1")
LLAMA_PORT = int(os.getenv("LLAMA_SERVER_PORT", "8080"))
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("belirix")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown of background services."""
    logger.info("Starting Belirix backend...")

    # Inference client
    inference_client = InferenceClient(
        host=LLAMA_HOST,
        port=LLAMA_PORT,
    )
    app.state.inference_client = inference_client
    await inference_client.start()

    # Health monitor for llama-server
    monitor = LlamaServerMonitor(
        host=LLAMA_HOST,
        port=LLAMA_PORT,
        poll_interval=10.0,
    )
    app.state.llama_monitor = monitor
    await monitor.start()

    logger.info("Belirix backend ready — llama-server at %s:%s", LLAMA_HOST, LLAMA_PORT)
    yield

    # Shutdown
    logger.info("Shutting down Belirix backend...")
    await monitor.stop()
    await inference_client.stop()
    logger.info("Belirix backend stopped.")


app = FastAPI(
    title="Belirix",
    description="Local-first conversational image recognition chatbot API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

# Middleware (applied bottom-to-top, so order matters)

# 1. Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# 2. Request ID tracking
app.add_middleware(RequestIDMiddleware)

# 3. Rate limiting on /api/ paths
app.add_middleware(RateLimitMiddleware, requests_per_minute=120, path_prefix="/api/")

# 4. CORS — allow the configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

app.include_router(chat_router)

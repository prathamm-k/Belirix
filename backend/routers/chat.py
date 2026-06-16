"""API router for Belirix chat, upload, and health endpoints."""

from __future__ import annotations

import base64
import logging
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from models.schemas import (
    ChatRequest,
    HealthResponse,
    LlamaServerHealth,
    UploadResponse,
)
from services.inference import InferenceClient
from services.llama_server import LlamaServerMonitor

logger = logging.getLogger("belirix.router")

router = APIRouter(prefix="/api", tags=["chat"])

# Maximum upload size in bytes (10 MB)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Allowed MIME types mapped from magic bytes
MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
    b"RIFF": "image/webp",  # WebP starts with RIFF....WEBP
}


def _detect_mime(header: bytes) -> str | None:
    """Detect MIME type from the first few bytes of a file."""
    if header[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if header[:4] == b"\x89PNG":
        return "image/png"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "image/webp"
    return None

def _get_inference(request: Request) -> InferenceClient:
    return request.app.state.inference_client


def _get_monitor(request: Request) -> LlamaServerMonitor:
    return request.app.state.llama_monitor

@router.post("/chat")
async def chat(body: ChatRequest, request: Request):
    """Forward a chat completion request to llama-server and stream back SSE."""
    client = _get_inference(request)
    monitor = _get_monitor(request)

    # Check model availability before forwarding
    if monitor.status == "unavailable":
        raise HTTPException(
            status_code=503,
            detail="Model server is not available. It may still be loading.",
        )

    # System instructions to define the model identity and its maker (Pratham Kairamkonda)
    system_prompt = (
        "You are Belirix, a local-first conversational image recognition chatbot "
        "designed and built by Pratham Kairamkonda. "
        "Your purpose is to help users photograph unfamiliar components, "
        "equipment, or documents and ask natural language questions. "
        "When asked about yourself or who made you, always state clearly that you are "
        "the Belirix model, created by Pratham Kairamkonda, and that your purpose is "
        "to assist with local-first image recognition and diagnostics."
    )

    # Prepend the system instructions to the first user message in the history
    # to avoid formatting bugs in llama-server's chat template for multimodal models.
    api_messages = []
    first_user_processed = False

    for msg in body.messages:
        if msg.role == "system":
            continue

        msg_dict = msg.model_dump()

        if msg.role == "user" and not first_user_processed:
            first_user_processed = True

            # If content is a simple text string
            if isinstance(msg_dict["content"], str):
                msg_dict["content"] = f"[System Instructions: {system_prompt}]\n\nUser Request: {msg_dict['content']}"
            
            # If content is a list of parts (text + images)
            elif isinstance(msg_dict["content"], list):
                text_part_found = False
                for part in msg_dict["content"]:
                    if part.get("type") == "text":
                        part["text"] = f"[System Instructions: {system_prompt}]\n\nUser Request: {part['text']}"
                        text_part_found = True
                        break
                
                if not text_part_found:
                    msg_dict["content"].append({
                        "type": "text",
                        "text": f"[System Instructions: {system_prompt}]"
                    })

        api_messages.append(msg_dict)

    if not body.stream:
        # Non-streaming fallback
        try:
            result = await client.chat_completion(
                messages=api_messages,
                temperature=body.temperature,
                max_tokens=body.max_tokens,
            )
            return result
        except Exception as exc:
            logger.exception("Non-streaming inference failed")
            raise HTTPException(status_code=502, detail=str(exc))

    async def event_generator():
        async for chunk in client.stream_chat_completion(
            messages=api_messages,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
        ):
            # Check if client disconnected
            if await request.is_disconnected():
                logger.info("Client disconnected, aborting stream")
                return
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Tell Nginx not to buffer
        },
    )

@router.post("/upload", response_model=UploadResponse)
async def upload_image(
    image: Annotated[UploadFile, File(description="Image file to upload")],
):
    """Accept an image upload, validate it, and return base64-encoded data."""
    # Read file contents
    contents = await image.read()
    size = len(contents)

    # Validate file size
    if size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    # Validate via magic bytes (not just Content-Type header which can be spoofed)
    header = contents[:12]
    mime_type = _detect_mime(header)

    if mime_type is None:
        raise HTTPException(
            status_code=415,
            detail="Unsupported image format. Only JPEG, PNG, and WebP are allowed.",
        )

    # Encode to base64
    encoded = base64.b64encode(contents).decode("ascii")

    logger.info("Image uploaded: %s, %d bytes", mime_type, size)

    return UploadResponse(
        base64=encoded,
        mime_type=mime_type,
        size_bytes=size,
    )


@router.get("/health", response_model=HealthResponse)
async def health(request: Request):
    """Return the health status of FastAPI and llama-server."""
    monitor = _get_monitor(request)

    llama_health = LlamaServerHealth(
        status=monitor.status,
        last_checked=monitor.last_checked,
    )

    overall = "ok" if monitor.status == "ok" else "degraded"

    return HealthResponse(
        status=overall,
        llama_server=llama_health,
    )

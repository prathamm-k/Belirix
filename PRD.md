# Belirix — Product Requirements Document

**Version:** 1.0  
**Date:** June 2026  
**Author:** Pratham Kairamkonda  
**IDE:** Antigravity IDE (Claude Opus 4.6, Thinking enabled)  
**Status:** Ready for Development

---

## 1. Overview

**Belirix** is a local-first, offline-capable conversational image recognition chatbot designed for hardware technicians at **BHEL Hyderabad**. It enables technicians to photograph unfamiliar components, equipment, or documents and ask natural language questions about them — receiving intelligent answers without needing a senior person's intervention. It is deployed as a single Docker container, runs entirely on the local network, and requires no internet connection after initial setup.

---

## 2. Problem Statement

At BHEL's Hyderabad workshop, hardware technicians — especially new joinees and trainees — frequently encounter situations where they:

- Do not recognize a component, part, or assembly they are working on
- Need to extract information from physical labels, nameplates, or technical diagrams
- Have trivial questions that do not warrant interrupting a senior engineer
- Need quick reference without leaving the workshop floor

Currently these gaps are filled by senior engineers, which wastes both parties' time on questions that are small and repetitive. There is no self-service knowledge tool available in the workshop environment.

---

## 3. Goals

### Primary Goals
- Allow technicians to photograph any hardware component and ask "What is this?"
- Enable OCR extraction from nameplates, labels, and printed spec sheets
- Support multi-turn conversation — technician can ask follow-up questions in the same session
- Work fully offline on the local BHEL network — zero internet dependency after deployment

### Secondary Goals
- Deployable with a single `docker run` command by any IT person at BHEL
- Fast enough for practical workshop use (response begins within 3–5 seconds)
- Intuitive UI that requires no training — built for non-technical users
- Support image capture via mobile camera directly in browser (no app install needed)

### Non-Goals (Out of Scope for v1)
- User authentication / login system
- Multi-user session isolation
- Training or fine-tuning the model on BHEL-specific data
- Integration with BHEL's internal ERP or document systems
- Voice input or audio output

---

## 4. Target Users

| User Type | Description | Primary Need |
|---|---|---|
| New Joinee / Trainee | First 0–6 months, unfamiliar with equipment | "What is this component?" |
| Junior Technician | Knows basics but encounters unfamiliar parts | Quick identification + specs |
| Workshop Supervisor | Needs to verify or cross-reference quickly | OCR from labels + Q&A |

**Device context:** Users may access via workshop desktop/laptop browsers OR via personal smartphones on the local WiFi. Both must work.

---

## 5. Tech Stack

### Inference Engine
**llama-server** (C++ binary, official llama.cpp)

- Serves MiniCPM-V 4.6 Q8_0 via OpenAI-compatible `/v1/chat/completions` API
- Only working path for MiniCPM-V 4.6 with GGUF — Python bindings (`MiniCPMv26ChatHandler`) are broken for v4.6's SSM/Mamba hybrid architecture
- Full Metal (Apple Silicon) and CPU support — no CUDA required
- `--reasoning-budget 0 --reasoning off` flags disable chain-of-thought for faster workshop responses

**Models (volume-mounted):**
- `MiniCPM-V-4_6-Q8_0.gguf` (~812 MB) — language + reasoning model
- `mmproj-model-f16.gguf` (~1.11 GB) — vision projector

### Backend
**FastAPI** (Python 3.11)

- Async-native — required for SSE (Server-Sent Events) streaming of LLM tokens
- Manages llama-server as a subprocess (start on app boot, health check, restart on crash)
- Accepts multipart image uploads from frontend, encodes to base64, forwards to llama-server
- Proxies llama-server's SSE stream back to the frontend
- Single `/api/chat` endpoint handles all conversation turns

### Frontend
**React 18 + Vite**

- Vite for instant HMR during development and optimized production builds
- No SSR needed — Belirix is not a public web app, no SEO requirements
- `navigator.mediaDevices.getUserMedia` for direct camera capture in browser (critical for mobile workshop use)
- `FileReader` API for image upload and base64 encoding before sending to backend

**Tailwind CSS** — utility-first, zero runtime overhead, full control over industrial UI aesthetic without opinionated component library constraints

**Zustand** — lightweight global state for conversation history, image attachment state, loading/streaming status. Redux is overkill, raw `useState` chains become unmanageable with multi-image conversation state.

### Streaming
**Server-Sent Events (SSE)**

- llama-server natively streams tokens via SSE on `stream: true`
- FastAPI proxies this stream using `StreamingResponse`
- Frontend reads with `fetch` + `ReadableStream` reader
- WebSockets are overkill — SSE is unidirectional (server → client) which is exactly what token streaming needs

### Containerization
**Docker + Nginx + Supervisord** (single container pattern)

- **Supervisord**: runs and monitors three processes inside one container — llama-server, FastAPI (via Uvicorn), and Nginx. Docker's one-process-per-container rule is satisfied because Supervisord is the one process Docker sees.
- **Nginx**: reverse proxy / receptionist — single public door at port 80. Routes `/api/*` to FastAPI (port 8000), everything else serves the React static build. Internal ports 8000 and 8080 are never exposed publicly.
- **Model volume**: model files (`/models/`) are mounted as a Docker volume, not baked into the image. This keeps the Docker image small and allows model updates without rebuilding.

### Project Directory Structure
```
Belirix/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx
│   │   │   ├── MessageBubble.jsx
│   │   │   ├── ImageUploader.jsx
│   │   │   ├── CameraCapture.jsx
│   │   │   └── StreamingIndicator.jsx
│   │   ├── store/
│   │   │   └── useChatStore.js       # Zustand store
│   │   ├── hooks/
│   │   │   └── useStreamingChat.js   # SSE fetch hook
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/
│   ├── main.py                       # FastAPI app entry point
│   ├── routers/
│   │   └── chat.py                   # /api/chat endpoint
│   ├── services/
│   │   ├── llama_server.py           # Subprocess manager
│   │   └── inference.py              # llama-server HTTP client
│   ├── models/
│   │   └── schemas.py                # Pydantic request/response models
│   └── requirements.txt
│
├── nginx/
│   └── nginx.conf
│
├── supervisord/
│   └── supervisord.conf
│
├── models/                           # Git-ignored, volume-mounted in Docker
│   ├── MiniCPM-V-4_6-Q8_0.gguf
│   └── mmproj-model-f16.gguf
│
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## 6. Core Features — MVP (v1.0)

### F1 — Image Upload + Question
- User uploads one or more images via drag-and-drop or file picker
- Thumbnail preview shown before sending
- User types a natural language question about the image(s)
- Example: "What component is this?" / "What does this label say?"

### F2 — Camera Capture (Mobile)
- "Take Photo" button triggers `getUserMedia` camera stream
- User captures frame directly in browser — no app install
- Captured image treated identically to uploaded image
- Critical for workshop floor use where technicians use phones

### F3 — Streaming Response
- Model response streams token by token into the UI (not a loading spinner then a wall of text)
- Streaming indicator (typing dots or blinking cursor) shown while model generates
- User can see partial answer in real time

### F4 — Multi-turn Conversation
- Conversation history maintained in Zustand store for the session
- Each new message includes full prior history in the API call
- User can ask follow-up questions about the same image: "What is the voltage rating?" → "Is this rated for outdoor use?"
- "New Chat" button clears session and starts fresh

### F5 — Multi-image Input
- User can attach up to 3 images per message (MiniCPM-V 4.6 natively supports multi-image)
- Images referenced positionally in prompt ("first image", "second image")
- Primary use case: compare two components, or send a diagram + a photo together

### F6 — OCR Mode
- "Extract Text" shortcut button sets the prompt to: `"Extract and transcribe all text from this image exactly as it appears."`
- Temperature automatically set to 0.1 for deterministic text extraction
- Output formatted as a clean copyable block

### F7 — One-command Deployment
```bash
docker run -d \
  -p 80:80 \
  -v $(pwd)/models:/models \
  --name belirix \
  belirix:latest
```
- Single command starts everything (Supervisord → llama-server + FastAPI + Nginx)
- Health check endpoint `/api/health` returns server + model status
- llama-server startup can take 10–20 seconds (model load) — frontend shows a loading state until `/api/health` returns OK

---

## 7. API Contract

### POST `/api/chat`
```json
// Request
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } },
        { "type": "text", "text": "What is this component?" }
      ]
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": true
}

// Response: SSE stream
data: {"choices":[{"delta":{"content":"This"}}]}
data: {"choices":[{"delta":{"content":" is"}}]}
...
data: [DONE]
```

### POST `/api/upload`
```json
// Multipart form: image file
// Response
{
  "base64": "...",
  "mime_type": "image/jpeg"
}
```

### GET `/api/health`
```json
{
  "status": "ok",
  "llama_server": "running",
  "model": "MiniCPM-V-4_6-Q8_0"
}
```

---

## 8. llama-server Configuration

```bash
llama-server \
  -m /models/MiniCPM-V-4_6-Q8_0.gguf \
  --mmproj /models/mmproj-model-f16.gguf \
  -c 8192 \
  --host 127.0.0.1 \
  --port 8080 \
  --reasoning-budget 0 \
  --reasoning off \
  -np 1
```

**Flags explained:**
- `-c 8192` — context window, handles multi-turn with multiple images
- `--host 127.0.0.1` — only accessible internally, Nginx proxies to it
- `--reasoning-budget 0 --reasoning off` — disables chain-of-thought (MiniCPM-V 4.6 has thinking capability, but it's slow and unnecessary for workshop Q&A)
- `-np 1` — one parallel slot; workshop use is low-concurrency

---

## 9. Nginx Configuration (Key Routes)

```nginx
server {
    listen 80;

    # Serve React frontend
    location / {
        root /app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;           # Critical for SSE streaming
        chunked_transfer_encoding on;
    }
}
```

---

## 10. Supervisord Configuration

```ini
[supervisord]
nodaemon=true

[program:llama-server]
command=llama-server -m /models/MiniCPM-V-4_6-Q8_0.gguf --mmproj /models/mmproj-model-f16.gguf -c 8192 --host 127.0.0.1 --port 8080 --reasoning-budget 0 --reasoning off -np 1
autostart=true
autorestart=true
priority=1

[program:fastapi]
command=uvicorn main:app --host 127.0.0.1 --port 8000
directory=/app/backend
autostart=true
autorestart=true
priority=2
startsecs=15          ; wait for llama-server to finish loading model

[program:nginx]
command=nginx -g "daemon off;"
autostart=true
autorestart=true
priority=3
```

---

## 11. Docker Setup

```dockerfile
FROM python:3.11-slim

# Install system deps: nginx, supervisord, llama-server binary
RUN apt-get update && apt-get install -y nginx supervisor curl \
    && curl -L https://github.com/ggerganov/llama.cpp/releases/latest/download/llama-server-linux-x64 \
       -o /usr/local/bin/llama-server && chmod +x /usr/local/bin/llama-server

# Copy and build frontend (or copy pre-built dist)
COPY frontend/dist /app/frontend/dist

# Install backend
COPY backend /app/backend
RUN pip install -r /app/backend/requirements.txt

# Config files
COPY nginx/nginx.conf /etc/nginx/sites-enabled/default
COPY supervisord/supervisord.conf /etc/supervisor/conf.d/belirix.conf

# Models are mounted at runtime, not baked in
VOLUME ["/models"]

EXPOSE 80
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
```

---

## 12. UI/UX Guidelines

**Aesthetic direction:** Industrial utility — not a SaaS dashboard. Dark-neutral background (#1A1B1E), high-contrast text, minimal decoration. Think of a diagnostic terminal, not a consumer chat app. The UI must be readable in harsh workshop lighting conditions.

**Key UI states:**
- **Startup loading**: "Belirix is starting up... (loading model)" with a progress indicator while `/api/health` polls
- **Image preview**: Thumbnails shown above the input box before sending
- **Streaming**: Token-by-token text rendering, blinking cursor at end
- **Error**: Clear inline error messages — "Model is not responding", "Image too large" — never silent failures
- **Mobile**: Full-width layout, large tap targets, camera button prominent

**No unnecessary animations** — workshop users need information fast, not a fancy UI.

---

## 13. Non-Functional Requirements

| Requirement | Target |
|---|---|
| First token latency | < 5 seconds after sending |
| Offline capability | 100% — zero outbound network calls at runtime |
| Mobile browser support | Chrome/Safari on Android and iOS |
| Docker image size | < 500 MB (excluding model volume) |
| Model cold start | < 30 seconds (llama-server loading Q8_0) |
| Concurrent users | 1–5 (single `-np 1` slot; low-concurrency workshop use) |
| OS support | Linux (Docker host), macOS (dev) |

---

## 14. Development Phases

### Phase 1 — Core Inference (Done ✅)
- Model selection (MiniCPM-V 4.6 Q8_0 + mmproj)
- llama-server working with correct flags
- Python HTTP client for inference confirmed working

### Phase 2 — Backend
- FastAPI app skeleton
- `/api/chat` endpoint with SSE streaming
- `/api/upload` for image handling
- `/api/health` endpoint
- llama-server subprocess manager

### Phase 3 — Frontend
- React + Vite + Tailwind setup
- Zustand store for conversation state
- Chat UI with streaming rendering
- Image upload + camera capture
- OCR shortcut button

### Phase 4 — Integration
- Frontend ↔ Backend ↔ llama-server end-to-end
- Streaming working in browser
- Multi-turn conversation working
- Multi-image support verified

### Phase 5 — Containerization
- Dockerfile
- Nginx config
- Supervisord config
- docker-compose.yml for local dev
- Single `docker run` verified working

### Phase 6 — Polish
- Loading states and error handling
- Mobile UI testing
- README with deployment instructions for BHEL IT team

---

## 15. Environment Variables

```env
# .env.example
LLAMA_SERVER_HOST=127.0.0.1
LLAMA_SERVER_PORT=8080
LLAMA_MODEL_PATH=/models/MiniCPM-V-4_6-Q8_0.gguf
LLAMA_MMPROJ_PATH=/models/mmproj-model-f16.gguf
FASTAPI_HOST=127.0.0.1
FASTAPI_PORT=8000
MAX_IMAGES_PER_MESSAGE=3
MAX_IMAGE_SIZE_MB=10
DEFAULT_TEMPERATURE=0.7
OCR_TEMPERATURE=0.1
MAX_TOKENS=1024
CONTEXT_LENGTH=8192
```

---

## 16. Out of Scope (v1)

- User accounts or authentication
- Conversation persistence across sessions (no database)
- Fine-tuning on BHEL-specific data
- Voice input / TTS output
- Admin panel or usage analytics
- Integration with BHEL ERP/SAP systems
- Multi-language support (English only for v1)
- Model hot-swapping without restart

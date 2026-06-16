# Belirix

*Local-first conversational image recognition chatbot for BHEL Hyderabad.*

Belirix enables hardware technicians to photograph unfamiliar components, equipment, or documents and ask natural language questions — receiving intelligent answers without needing a senior engineer's help. It runs entirely on your local network with zero internet dependency, ensuring maximum privacy and security for internal BHEL hardware data.

---

## Architecture for Monolithic Docker Build

```
                    Port 80
                      |
               +------+------+
               |    Nginx    |  ← Static files + reverse proxy
               +------+------+
                 /          \
        Static files    /api/*
        (React SPA)       |
                    +-----+-----+
                    |  FastAPI  |  ← Python backend (port 9002)
                    +-----+-----+
                          |
                    +-----+-----+
                    | llama-srv |  ← MiniCPM-V 4.6 inference (port 8080)
                    +-----------+

    All three processes run inside a single Docker container,
    managed by Supervisord.
```

---

## Challenges Faced

Building this robust local AI pipeline presented several complex engineering challenges:

1.  **Architectural Evolution (Monolith vs. Microservices):**
    Initially, building an image that runs 3 different commands (`llama-server`, backend, and frontend) using `supervisord` was conceptually challenging. I struggled with the idea of serving the frontend as a static build (`npm run build`) via Nginx within the same container, rather than using a dedicated port. However, I learned that I can run the frontend on a different port dynamically if the situation demands non-static frontends. This realization directly led to our modern dual-architecture setup: a monolith for non-technical users, and a 3-container docker-compose setup for developers.
2.  **Cross-Compiling for Windows CUDA from an ARM64 Mac:**
    We had to compile `llama.cpp` for a GTX 1650 (CUDA 75) on a Windows machine while actually building the Docker image from an ARM64 Mac using Buildx. This resulted in frustrating `libcuda.so.1` linking errors, which we elegantly solved by dynamically linking NVIDIA stub libraries during the cross-platform CMake build process.
3.  **Docker Context Bloat & Build Times:**
    Because the models were stored in the root directory, sending 6GB of `.gguf` files to the Docker daemon caused the build to take an eternity and consume massive disk space. Implementing strict `.dockerignore` files across the root and subdirectories solved this instantly, reducing context upload times from minutes to milliseconds.
4.  **Streaming & Server-Sent Events (SSE):**
    Getting the Nginx reverse proxy to correctly pass SSE for token-by-token streaming required careful configuration (`proxy_buffering off`, `proxy_cache off`) so the UI could update natively instead of waiting for the massive Vision-Language Model to finish computing the full response.
5.  **Python Lifecycle & HTTPX Connection Pools:**
    We encountered a tricky `TypeError` when forwarding payloads in `stream_chat_completion` by passing positional arguments instead of keyword arguments to the inference client. Furthermore, we resolved a `RuntimeError` by properly managing the `httpx.AsyncClient` connection pool within FastAPI's modern `@asynccontextmanager` lifespan.

---

## Setup & Installation

First, clone the repository to your local machine:
```bash
git clone https://github.com/prathamm-k/belirix.git
cd belirix
```

### Option A: Developer Setup (Recommended for Coding)
This setup spins up 3 isolated containers and maps your local source code directly into them. **Changes to the code will instantly reflect in the running containers!**

1. Run the developer compose file:
```bash
docker compose up --build
```
2. The frontend development server will launch at [http://localhost:2002](http://localhost:2002).
3. The FastAPI backend will run at [http://localhost:9002](http://localhost:9002).
4. The C++ `llama-server` (inference engine) will run at [http://localhost:8080](http://localhost:8080).

### Option B: Monolithic Production Setup (For End-Users)
If you want to deploy the application exactly as an end-user would experience it (everything running seamlessly on port 80):

1. Build the monolithic image:
```bash
docker build -t prathammk01/belirix:latest .
```

2. Run the container. The model files are massive (6GB+), so we map a folder on your host machine to store them permanently. 

**For Windows Users:**
*(Creates a folder at the root of your C: drive `C:\Belirix\model`)*
```bash
docker run -d \
  -p 9002:80 \
  -v "C:\Belirix\model:/models" \
  --gpus all \
  --name belirix-prod \
  prathammk01/belirix:latest
```

**For Mac / Linux Users:**
*(Creates a folder in your home directory `~/Belirix/model`)*
```bash
docker run -d \
  -p 9002:80 \
  -v ~/Belirix/model:/models \
  --gpus all \
  --name belirix-prod \
  prathammk01/belirix:latest
```
3. Open [http://localhost:9002](http://localhost:9002) in your browser.

---

## Project Structure
```
belirix/
├── backend/
│   ├── main.py               # FastAPI entrypoint and lifespan manager
│   ├── routers/              # API endpoints (chat, health, upload)
│   ├── services/             # HTTPX InferenceClient communicating with llama-server
│   ├── Dockerfile            # Developer Dockerfile (Python 3.12 slim)
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/                  # React application components
│   ├── Dockerfile            # Developer Dockerfile (Node 20)
│   ├── package.json          # Frontend npm package settings
│   └── vite.config.js        # Vite config (proxies /api to backend)
├── llama-server/
│   └── Dockerfile            # Developer Dockerfile (Compiles CUDA inference engine)
├── nginx/
│   └── nginx.conf            # Monolith reverse proxy and static file server config
├── supervisord/
│   └── supervisord.conf      # Monolith multi-process manager
├── Dockerfile                # The monolithic production Dockerfile
├── docker-compose.yml        # The 3-container Developer orchestration file
├── entrypoint.sh             # Auto-downloads HuggingFace models before starting
└── README.md                 # Project documentation
```

---

## API Endpoints Reference

### FastAPI Backend (`/api`)
*   **`GET /api/health`**
    *   Returns the health status of the API and the underlying `llama-server`. Returns `503` gracefully if the model is still loading into VRAM.
*   **`POST /api/chat`**
    *   Accepts multimodal messages (base64 images + text). Streams back the vision-language model's response using Server-Sent Events (SSE).

---

## Troubleshooting & FAQ

*   **UI shows "Loading model..." forever:** 
    Check Docker logs: `docker logs <container_name>`. `llama-server` takes 15-30 seconds to load the 6GB model into the GPU VRAM. The UI will automatically connect once it is ready.
*   **CUDA Out of Memory:**
    Ensure you have at least 4-6GB of VRAM available. MiniCPM-V 4.6 is heavily quantized but still requires significant memory. Adjust the `-ngl` (Number of GPU Layers) parameter in `docker-compose.yml` or `Dockerfile` if it crashes.
*   **Image upload fails:** 
    Ensure the image is JPEG, PNG, or WebP and under 10 MB.
*   **Build taking too long / crashing Docker daemon:**
    Make sure you haven't deleted the `.dockerignore` file. If the 6GB `model/` folder isn't ignored, Docker will try to upload it to the build context, which freezes the system.

---

## Contributing
Contributions are welcome! Please submit issues or open pull requests to suggest enhancements, optimization patterns, or new features.

## License
Internal BHEL project. Not for public distribution.

---

## Repository
GitHub: [prathamm-k/belirix](https://github.com/prathamm-k/belirix)

## Contact
Created by [prathamm-k](https://github.com/prathamm-k) — feel free to reach out via GitHub.

# Stage 1: Frontend Build
FROM node:20-alpine AS frontend-build

WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci --production=false

COPY frontend/ .
RUN npm run build

# Stage 2: Runtime
FROM nvidia/cuda:12.9.0-devel-ubuntu24.04

LABEL maintainer="Pratham Kairamkonda"
LABEL description="Belirix — Local-first conversational image recognition chatbot"
LABEL version="1.0"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        curl \
        ca-certificates \
        git \
        cmake \
        build-essential \
        python3 \
        python3-pip \
        python3-venv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/llama.cpp
RUN git clone https://github.com/ggml-org/llama.cpp.git . \
    && ln -s /usr/local/cuda/lib64/stubs/libcuda.so /usr/local/cuda/lib64/stubs/libcuda.so.1 \
    && export LD_LIBRARY_PATH=/usr/local/cuda/lib64/stubs:$LD_LIBRARY_PATH \
    && cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=75 -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -j$(nproc) \
    && cmake --install build

ENV LD_LIBRARY_PATH="/usr/local/lib:${LD_LIBRARY_PATH}"

RUN mkdir -p /app/frontend/dist /app/backend /models

COPY --from=frontend-build /build/dist /app/frontend/dist

COPY backend/ /app/backend/
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

RUN rm -f /etc/nginx/sites-enabled/default \
    && rm -f /etc/nginx/sites-available/default
COPY nginx/nginx.conf /etc/nginx/nginx.conf

COPY supervisord/supervisord.conf /etc/supervisor/conf.d/belirix.conf

VOLUME ["/models"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost/api/health || exit 1

ENV LLAMA_MODEL_PATH="/models/MiniCPM-V-4_6-Q4_K_M.gguf"
ENV LLAMA_MMPROJ_PATH="/models/mmproj-model-f16.gguf"
ENV LLAMA_CONTEXT_LENGTH="8192"
ENV LLAMA_SERVER_HOST="127.0.0.1"
ENV LLAMA_SERVER_PORT="8080"
ENV LLAMA_NGL="15"

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/belirix.conf"]

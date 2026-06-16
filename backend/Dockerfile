# Development Dockerfile for Backend (Hot-Reloading)
FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies (leverage Docker caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Expose FastAPI port
EXPOSE 8000

# The source code is mounted dynamically in docker-compose.yml,
# so we run the FastAPI dev server (Uvicorn) with auto-reload.
CMD ["fastapi", "dev", "main.py", "--host", "0.0.0.0", "--port", "9002"]

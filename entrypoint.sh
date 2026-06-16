#!/bin/bash
set -e

MODEL_FILE="MiniCPM-V-4_6-Q4_K_M.gguf"
MMPROJ_FILE="mmproj-model-f16.gguf"

if [ -n "$LLAMA_MODEL_PATH" ]; then
    MODEL_FILE=$(basename "$LLAMA_MODEL_PATH")
fi

if [ -n "$LLAMA_MMPROJ_PATH" ]; then
    MMPROJ_FILE=$(basename "$LLAMA_MMPROJ_PATH")
fi

mkdir -p /models


if [ ! -f "/models/$MODEL_FILE" ]; then
    echo "=========================================================="
    echo "Model $MODEL_FILE not found in /models."
    echo "Downloading from HuggingFace... (This may take a while)"
    echo "=========================================================="
    curl -L "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/$MODEL_FILE" -o "/models/$MODEL_FILE"
fi

if [ ! -f "/models/$MMPROJ_FILE" ]; then
    echo "=========================================================="
    echo "Vision Projector $MMPROJ_FILE not found in /models."
    echo "Downloading from HuggingFace... (This may take a while)"
    echo "=========================================================="
    curl -L "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/$MMPROJ_FILE" -o "/models/$MMPROJ_FILE"
fi

echo "=========================================================="
echo "Models are ready. Starting services..."
echo "=========================================================="

exec "$@"

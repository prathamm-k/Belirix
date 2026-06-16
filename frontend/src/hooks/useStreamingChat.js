import { useCallback, useRef } from 'react';
import useChatStore from '../store/useChatStore';

export default function useStreamingChat() {
  const abortRef = useRef(null);

  const sendMessage = useCallback(async (text, images = []) => {
    const store = useChatStore.getState();

    const contentParts = [];

    for (const img of images) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      });
    }

    contentParts.push({ type: 'text', text });

    const userMessage = {
      role: 'user',
      content: contentParts.length === 1 && images.length === 0 ? text : contentParts,
      images: images.map((img) => ({ preview: `data:${img.mimeType};base64,${img.base64}`, mimeType: img.mimeType })),
    };

    store.addMessage(userMessage);
    store.clearImages();
    store.setError(null);
    store.setStreaming(true);
    store.setStreamingContent('');

    const allMessages = [...useChatStore.getState().messages];
    const apiMessages = allMessages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content.filter(
            (p) => p.type === 'text' || p.type === 'image_url'
          ),
        };
      }
      return { role: msg.role, content: msg.content };
    });

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: 1024,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let detail = `Server error (${response.status})`;
        try {
          const parsed = JSON.parse(errorBody);
          detail = parsed.detail || detail;
        } catch {
        }
        store.setError(detail);
        store.setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed === 'data: [DONE]') {
            useChatStore.getState().finalizeStreaming();
            return;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));

              if (json.error) {
                store.setError(json.error);
                store.setStreaming(false);
                return;
              }

              const delta = json.choices?.[0]?.delta;
              if (delta?.content) {
                useChatStore.getState().appendStreamingContent(delta.content);
              }
            } catch {
            }
          }
        }
      }
      useChatStore.getState().finalizeStreaming();
    } catch (err) {
      if (err.name === 'AbortError') {
        store.setStreaming(false);
        store.setStreamingContent('');
        return;
      }
      console.error('Streaming chat error:', err);
      store.setError('Failed to connect to the server. Please try again.');
      store.setStreaming(false);
    }
  }, []);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { sendMessage, cancelStream };
}

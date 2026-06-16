import { useRef, useEffect, useState, useCallback } from 'react';
import { PaperPlaneRight, TextT, Stop, Scan, Warning, CircleNotch, X } from '@phosphor-icons/react';
import useChatStore from '../store/useChatStore';
import useStreamingChat from '../hooks/useStreamingChat';
import MessageBubble from './MessageBubble';
import StreamingIndicator from './StreamingIndicator';
import ImageUploader from './ImageUploader';
import CameraCapture from './CameraCapture';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import safeUUID from '../utils/uuid';

export default function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const images = useChatStore((s) => s.images);
  const removeImage = useChatStore((s) => s.removeImage);
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);

  const { sendMessage, cancelStream } = useStreamingChat();
  const [inputText, setInputText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const chatAreaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [inputText]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    const currentImages = useChatStore.getState().images;

    // Don't send if empty and no images, or if any image is still uploading
    if (!text && currentImages.length === 0) return;
    if (currentImages.some((img) => img.isLoading)) return;
    if (isStreaming) return;

    setInputText('');
    sendMessage(text || 'Describe this image.', currentImages);
  }, [inputText, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleOCR = useCallback(() => {
    if (isStreaming) return;
    const currentImages = useChatStore.getState().images;
    if (currentImages.length === 0) {
      useChatStore.getState().setError('Attach an image first, then use Extract Text.');
      return;
    }
    if (currentImages.some((img) => img.isLoading)) return;

    setInputText('');
    sendMessage(
      'Extract and transcribe all text from this image exactly as it appears.',
      currentImages
    );
  }, [isStreaming, sendMessage]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      );

      const store = useChatStore.getState();
      const currentCount = store.images.length;
      const allowedCount = Math.max(0, 3 - currentCount);
      const filesToProcess = files.slice(0, allowedCount);

      if (files.length > allowedCount) {
        store.setError('Maximum 3 images per message.');
      }

      // Add placeholders immediately in order
      const placeholders = filesToProcess.map((file) => {
        const tempId = safeUUID();
        const preview = URL.createObjectURL(file);
        store.addPendingPlaceholder(tempId, preview);
        return { tempId, file };
      });

      // Upload and update placeholders
      await Promise.all(
        placeholders.map(async ({ tempId, file }) => {
          try {
            const formData = new FormData();
            formData.append('image', file);
            const resp = await fetch('/api/upload', { method: 'POST', body: formData });
            if (resp.ok) {
              const data = await resp.json();
              store.updatePendingImage(tempId, data.base64, data.mime_type);
            } else {
              store.setPendingImageError(tempId);
            }
          } catch {
            store.setPendingImageError(tempId);
          }
        })
      );
    },
    []
  );

  const isEmpty = messages.length === 0 && !streamingContent;
  const isSendDisabled =
    (!inputText.trim() && images.length === 0) ||
    images.some((img) => img.isLoading) ||
    isStreaming;

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-surface-950/85 border-2 border-dashed border-accent-500 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Scan size={48} className="text-accent-500 mx-auto mb-3 animate-pulse-soft" weight="duotone" />
            <p className="text-accent-400 text-lg font-semibold">Drop images here</p>
            <p className="text-zinc-500 text-xs mt-1">JPEG, PNG, or WebP — up to 10 MB</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={chatAreaRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center min-h-[55vh] animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center mb-6 shadow-md relative">
                <Scan size={32} className="text-accent-500" weight="duotone" />
                <div className="absolute inset-0 rounded-2xl bg-accent-500/5 blur-[4px] -z-10 animate-pulse-soft" />
              </div>
              <h2 className="text-2xl md:text-3xl font-semibold text-zinc-100 tracking-tight mb-3">
                Belirix
              </h2>
              <p className="text-zinc-500 text-center max-w-md leading-relaxed mb-8">
                Upload or photograph a component, label, or document.
                Ask any question — get an instant answer.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {[
                  { q: 'What component is this?' },
                  { q: 'Read the nameplate text' },
                  { q: 'Compare these two parts' },
                  { q: 'Describe the wiring diagram' },
                ].map((hint) => (
                  <button
                    key={hint.q}
                    onClick={() => setInputText(hint.q)}
                    className="text-left px-4 py-3 rounded-xl border border-surface-700 bg-surface-900
                               text-sm text-zinc-400 hover:text-zinc-200 hover:border-surface-600
                               hover:bg-surface-850 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {hint.q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Streaming content */}
          {isStreaming && streamingContent && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface-800 border border-surface-750 flex items-center justify-center text-zinc-400 shadow-sm">
                <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M200,48H136V16a8,8,0,0,0-16,0V48H56A32,32,0,0,0,24,80V192a32,32,0,0,0,32,32H200a32,32,0,0,0,32-32V80A32,32,0,0,0,200,48Zm16,144a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V80A16,16,0,0,1,56,64H200a16,16,0,0,1,16,16ZM104,120a12,12,0,1,1-12-12A12,12,0,0,1,104,120Zm72,0a12,12,0,1,1-12-12A12,12,0,0,1,176,120Zm-56,40a44,44,0,0,0,36-18.71,8,8,0,0,1,13.09,9.22A60,60,0,0,1,128,176a60,60,0,0,1-41.09-25.49,8,8,0,0,1,13.09-9.22A44,44,0,0,0,120,160Z"/>
                </svg>
              </div>
              <div className="max-w-[75%] min-w-0 rounded-xl px-4 py-3 bg-surface-800 border border-surface-700 text-zinc-200 shadow-md">
                <div className="prose-belirix text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingContent}
                  </ReactMarkdown>
                  <StreamingIndicator />
                </div>
              </div>
            </div>
          )}

          {/* Streaming skeleton (before first token arrives) */}
          {isStreaming && !streamingContent && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface-805 border border-surface-750 flex items-center justify-center">
                <div className="w-4.5 h-4.5 rounded-full bg-accent-500/40 animate-pulse-soft" />
              </div>
              <div className="max-w-[75%] rounded-xl px-4 py-3 bg-surface-800 border border-surface-700 shadow-md">
                <div className="space-y-2">
                  <div className="skeleton h-4 w-48 rounded" />
                  <div className="skeleton h-4 w-64 rounded" />
                  <div className="skeleton h-4 w-36 rounded" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between animate-slide-up">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={clearError}
            className="text-red-400/60 hover:text-red-400 ml-3 flex-shrink-0 cursor-pointer"
            aria-label="Dismiss error"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Pending images preview container (grows above chat box) */}
      {images.length > 0 && (
        <div className="max-w-3xl mx-auto w-full px-4 mb-2.5 flex gap-3 animate-fade-in select-none">
          {images.map((img, i) => (
            <div
              key={img.id || i}
              className="relative group w-20 h-20 rounded-xl overflow-hidden border border-surface-800 bg-surface-900 shadow-lg"
            >
              {img.isLoading ? (
                <div className="w-full h-full flex items-center justify-center bg-surface-850">
                  <CircleNotch size={20} className="text-accent-500 animate-spin" />
                </div>
              ) : img.error ? (
                <div className="w-full h-full flex items-center justify-center bg-red-950/20 text-red-400">
                  <Warning size={20} />
                </div>
              ) : (
                <img
                  src={img.preview}
                  alt={`Pending attachment ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              )}

              {/* Number tag for sequence indicator */}
              <div className="absolute bottom-1 left-1 bg-surface-950/70 backdrop-blur-xs text-[9px] font-bold text-zinc-300 w-4 h-4 rounded flex items-center justify-center border border-surface-800">
                {i + 1}
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5.5 h-5.5 rounded-full
                           bg-surface-950/80 backdrop-blur-xs border border-surface-700 text-zinc-400
                           flex items-center justify-center
                           opacity-0 group-hover:opacity-100 transition-opacity
                           hover:text-red-400 hover:border-red-400/50 cursor-pointer shadow"
                aria-label={`Remove image ${i + 1}`}
              >
                <X size={10} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-surface-850 bg-surface-950 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-surface-900 border border-surface-800 rounded-xl px-3 py-2 focus-within:border-surface-700 transition-colors">
            {/* Image upload + Camera */}
            <div className="flex items-center gap-0.5 pb-0.5">
              <ImageUploader />
              <CameraCapture />
            </div>

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the image..."
              rows={1}
              className="flex-1 bg-transparent text-zinc-100 text-sm placeholder-zinc-655
                         resize-none outline-none py-1.5 min-h-[36px] max-h-[160px]
                         leading-relaxed"
              disabled={isStreaming}
            />

            {/* Action buttons */}
            <div className="flex items-center gap-1 pb-0.5">
              {/* OCR shortcut */}
              <button
                type="button"
                onClick={handleOCR}
                disabled={isStreaming || images.length === 0 || images.some(img => img.isLoading)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                           text-zinc-500 hover:text-accent-400 hover:bg-surface-800
                           transition-colors active:scale-[0.95] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Extract text from image (OCR)"
              >
                <TextT size={16} weight="bold" />
                <span className="hidden sm:inline">OCR</span>
              </button>

              {/* Send / Stop */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={cancelStream}
                  className="flex items-center justify-center w-9 h-9 rounded-lg
                             bg-red-500/15 text-red-400 hover:bg-red-500/25
                             transition-colors active:scale-[0.93] cursor-pointer"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Stop size={18} weight="fill" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSendDisabled}
                  className="flex items-center justify-center w-9 h-9 rounded-lg
                             bg-accent-500 text-white hover:bg-accent-600
                             transition-colors active:scale-[0.93]
                             disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Send message"
                  aria-label="Send message"
                >
                  <PaperPlaneRight size={18} weight="fill" />
                </button>
              )}
            </div>
          </div>

          <p className="text-[10px] text-zinc-650 mt-2 text-center">
            Belirix is a local-first conversational image recognition chatbot. Created by Pratham Kairamkonda.
          </p>
        </div>
      </div>
    </div>
  );
}

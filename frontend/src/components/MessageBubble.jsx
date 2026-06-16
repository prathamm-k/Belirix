import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Robot } from '@phosphor-icons/react';


export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const [expandedImage, setExpandedImage] = useState(null);

  // Extract text content
  const textContent = (() => {
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      const textPart = message.content.find((p) => p.type === 'text');
      return textPart?.text || '';
    }
    return '';
  })();

  // Extract image previews (only for user messages)
  const imageList = message.images || [];

  const handleImageClick = useCallback((preview) => {
    setExpandedImage(preview);
  }, []);

  return (
    <>
      <div
        className={`flex gap-3 animate-slide-up ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            isUser
              ? 'bg-accent-500/15 text-accent-500'
              : 'bg-surface-700 text-zinc-400'
          }`}
        >
          {isUser ? <User size={18} weight="bold" /> : <Robot size={18} weight="bold" />}
        </div>

        {/* Bubble */}
        <div
          className={`max-w-[75%] min-w-0 ${
            isUser ? 'ml-auto' : 'mr-auto'
          }`}
        >
          {/* Image thumbnails */}
          {imageList.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {imageList.map((img, i) => (
                <button
                  key={i}
                  onClick={() => handleImageClick(img.preview)}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-surface-700 
                             hover:border-accent-500/50 transition-colors cursor-pointer
                             active:scale-[0.97] transition-transform"
                >
                  <img
                    src={img.preview}
                    alt={`Attached image ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Text content */}
          <div
            className={`rounded-xl px-4 py-3 ${
              isUser
                ? 'bg-accent-500/12 border border-accent-500/20 text-zinc-100'
                : 'bg-surface-800 border border-surface-700 text-zinc-200'
            }`}
          >
            {isUser ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{textContent}</p>
            ) : (
              <div className="prose-belirix text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {textContent}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded image modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Expanded view"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}

import { useRef, useCallback } from 'react';
import { ImageSquare } from '@phosphor-icons/react';
import useChatStore from '../store/useChatStore';
import safeUUID from '../utils/uuid';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ImageUploader() {
  const inputRef = useRef(null);
  const images = useChatStore((s) => s.images);
  const addPendingPlaceholder = useChatStore((s) => s.addPendingPlaceholder);
  const updatePendingImage = useChatStore((s) => s.updatePendingImage);
  const setPendingImageError = useChatStore((s) => s.setPendingImageError);
  const setError = useChatStore((s) => s.setError);

  const processFiles = useCallback(
    async (files) => {
      const currentCount = images.length;
      const allowedCount = Math.max(0, 3 - currentCount);
      const filesToProcess = files.slice(0, allowedCount);

      if (files.length > allowedCount) {
        setError('Maximum 3 images per message.');
      }

      // 1. Create placeholders immediately in the exact order selected
      const placeholders = filesToProcess.map((file) => {
        const tempId = safeUUID();
        const preview = URL.createObjectURL(file);
        addPendingPlaceholder(tempId, preview);
        return { tempId, file };
      });

      // 2. Upload them asynchronously and update placeholders in place
      await Promise.all(
        placeholders.map(async ({ tempId, file }) => {
          if (!ALLOWED_TYPES.includes(file.type)) {
            setPendingImageError(tempId);
            setError('Unsupported format. Use JPEG, PNG, or WebP.');
            return;
          }

          if (file.size > MAX_FILE_SIZE) {
            setPendingImageError(tempId);
            setError('Image too large. Maximum size is 10 MB.');
            return;
          }

          try {
            const formData = new FormData();
            formData.append('image', file);

            const resp = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });

            if (!resp.ok) {
              setPendingImageError(tempId);
              const body = await resp.json().catch(() => ({}));
              setError(body.detail || `Upload failed (${resp.status})`);
              return;
            }

            const data = await resp.json();
            updatePendingImage(tempId, data.base64, data.mime_type);
          } catch (err) {
            console.error('Upload error:', err);
            setPendingImageError(tempId);
            setError('Failed to upload image. Is the server running?');
          }
        })
      );
    },
    [images.length, addPendingPlaceholder, updatePendingImage, setPendingImageError, setError]
  );

  const handleFileChange = useCallback(
    (e) => {
      const files = Array.from(e.target.files || []);
      processFiles(files);
      if (inputRef.current) inputRef.current.value = '';
    },
    [processFiles]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div className="flex items-center">
      {/* File input (hidden) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload image"
      />

      {/* Upload button */}
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center justify-center w-9 h-9 rounded-lg
                   text-zinc-400 hover:text-accent-500 hover:bg-surface-800
                   transition-all active:scale-[0.95] cursor-pointer"
        title="Attach image"
        aria-label="Attach image"
      >
        <ImageSquare size={20} weight="bold" />
      </button>
    </div>
  );
}

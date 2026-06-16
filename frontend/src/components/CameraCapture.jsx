import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, X, Aperture } from '@phosphor-icons/react';
import useChatStore from '../store/useChatStore';
import safeUUID from '../utils/uuid';


export default function CameraCapture() {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const addPendingPlaceholder = useChatStore((s) => s.addPendingPlaceholder);
  const updatePendingImage = useChatStore((s) => s.updatePendingImage);
  const setPendingImageError = useChatStore((s) => s.setPendingImageError);
  const images = useChatStore((s) => s.images);

  const openCamera = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      setIsOpen(true);
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permissions.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Could not access camera.');
      }
    }
  }, []);

  const closeCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsOpen(false);
    setError(null);
  }, [stream]);


  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isOpen]);

  
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (images.length >= 3) {
      setError('Maximum 3 images per message.');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const tempId = safeUUID();

    
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        
        const preview = URL.createObjectURL(blob);
        addPendingPlaceholder(tempId, preview);

        
        closeCamera();

        try {
          const formData = new FormData();
          formData.append('image', blob, 'camera-capture.jpg');

          const resp = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!resp.ok) {
            setPendingImageError(tempId);
            useChatStore.getState().setError('Failed to process captured image.');
            return;
          }

          const data = await resp.json();
          updatePendingImage(tempId, data.base64, data.mime_type);
        } catch (err) {
          console.error(err);
          setPendingImageError(tempId);
          useChatStore.getState().setError('Failed to upload captured image.');
        }
      },
      'image/jpeg',
      0.9
    );
  }, [addPendingPlaceholder, updatePendingImage, setPendingImageError, closeCamera, images.length]);

  return (
    <>
      {/* Camera trigger button */}
      <button
        type="button"
        onClick={openCamera}
        className="flex items-center justify-center w-9 h-9 rounded-lg
                   text-zinc-400 hover:text-accent-500 hover:bg-surface-800
                   transition-all active:scale-[0.95] cursor-pointer"
        title="Take photo"
        aria-label="Take photo with camera"
      >
        <Camera size={20} weight="bold" />
      </button>

      {/* Camera error (inline) */}
      {error && !isOpen && (
        <span className="text-xs text-red-400 ml-1">{error}</span>
      )}

      {/* Camera modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          {/* Close button */}
          <button
            onClick={closeCamera}
            className="absolute top-4 right-4 w-10 h-10 rounded-full
                       bg-surface-800/80 text-zinc-300 flex items-center justify-center
                       hover:bg-surface-700 transition-colors cursor-pointer"
            aria-label="Close camera"
          >
            <X size={22} weight="bold" />
          </button>

          {/* Video preview */}
          <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden border border-surface-700">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-950/80">
                <p className="text-red-400 text-sm text-center px-4">{error}</p>
              </div>
            )}
          </div>

          {/* Capture button */}
          <button
            onClick={captureFrame}
            className="mt-6 w-16 h-16 rounded-full bg-white flex items-center justify-center
                       hover:bg-zinc-200 transition-colors active:scale-[0.93]
                       ring-4 ring-white/20 cursor-pointer"
            aria-label="Capture photo"
          >
            <Aperture size={32} weight="fill" className="text-surface-950" />
          </button>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </>
  );
}

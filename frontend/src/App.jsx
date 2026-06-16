import { useEffect, useRef } from 'react';
import { CircleNotch, List } from '@phosphor-icons/react';
import useChatStore from './store/useChatStore';
import ChatWindow from './components/ChatWindow';
import Sidebar from './components/Sidebar';

export default function App() {
  const isModelReady = useChatStore((s) => s.isModelReady);
  const setModelReady = useChatStore((s) => s.setModelReady);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const resp = await fetch('/api/health');
        if (resp.ok) {
          const data = await resp.json();
          if (data.status === 'ok' && data.llama_server?.status === 'ok') {
            setModelReady(true);
            return;
          }
        }
      } catch {
      }

      if (!cancelled) {
        pollRef.current = setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [setModelReady]);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-surface-950 text-zinc-100">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-surface-950">
        <header className="flex-shrink-0 border-b border-surface-850 bg-surface-950/95 backdrop-blur-sm sticky top-0 z-30 w-full">
          <div className="w-full px-6 py-3.5 flex items-center justify-between">
            {/* Left: Menu Toggle + Logo */}
            <div className="flex items-center gap-3">
              {/* Sidebar toggle button (visible on both mobile and desktop) */}
              <button
                onClick={toggleSidebar}
                className="p-1.5 -ml-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface-900 cursor-pointer"
                aria-label="Toggle sidebar"
              >
                <List size={20} weight="bold" />
              </button>

              <div>
                <h1 className="text-sm md:text-base font-bold tracking-tight text-zinc-100">
                  Belirix
                </h1>
                <p className="text-[9px] md:text-[10px] text-zinc-500 font-medium -mt-0.5">
                  Image Recognition Assistant
                </p>
              </div>
            </div>

            {/* Right: Model Status */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-surface-900/50 border border-surface-850 px-2.5 py-1.5 rounded-xl">
                {isModelReady ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-45" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-500" />
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400 tracking-wider uppercase">
                      Server Online
                    </span>
                  </>
                ) : (
                  <>
                    <CircleNotch size={12} className="text-amber-500 animate-spin" weight="bold" />
                    <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase animate-pulse-soft">
                      Loading Model...
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Loading overlay — shown before model is ready */}
        {!isModelReady && (
          <div className="flex-1 flex items-center justify-center p-6 bg-surface-950">
            <div className="text-center max-w-sm animate-fade-in">
              <div className="relative w-16 h-16 rounded-2xl bg-surface-900 border border-surface-800 flex items-center justify-center mx-auto mb-6 shadow-xl">
                <CircleNotch size={32} className="text-accent-500 animate-spin" weight="bold" />
                <div className="absolute inset-0 rounded-2xl bg-accent-500/10 blur-[8px] -z-10 animate-pulse-soft" />
              </div>
              <h2 className="text-lg font-bold text-zinc-100 tracking-tight mb-2">
                Initializing Belirix Server
              </h2>
              <p className="text-zinc-500 text-xs leading-relaxed">
                Loading the multimodal vision model on this device.
                This process takes about 15-30 seconds.
              </p>
              <div className="mt-6 flex justify-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-accent-500/50 animate-pulse-soft"
                    style={{ animationDelay: `${i * 300}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main chat window */}
        {isModelReady && (
          <main className="flex-1 relative overflow-hidden bg-surface-950">
            <ChatWindow />
          </main>
        )}
      </div>
    </div>
  );
}

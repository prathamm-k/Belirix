import { useCallback } from 'react';
import { Chat, Trash, Plus, CircleNotch, Aperture, X } from '@phosphor-icons/react';
import useChatStore from '../store/useChatStore';


export default function Sidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const isModelReady = useChatStore((s) => s.isModelReady);
  const newConversation = useChatStore((s) => s.newConversation);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const isOpen = useChatStore((s) => s.isSidebarOpen);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);

  const handleNewChat = useCallback(() => {
    newConversation();
  }, [newConversation]);

  const handleSelectChat = useCallback(
    (id) => {
      selectConversation(id);
    },
    [selectConversation]
  );

  const handleDeleteChat = useCallback(
    (e, id) => {
      e.stopPropagation(); // Prevent selection when deleting
      deleteConversation(id);
    },
    [deleteConversation]
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={toggleSidebar}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 md:z-20 bg-surface-950 border-r border-surface-800
                   flex flex-col transition-all duration-300 ease-in-out
                   md:static md:flex-shrink-0 h-full
                   ${isOpen ? 'translate-x-0 w-72 border-r opacity-100' : '-translate-x-full w-72 md:translate-x-0 md:w-0 md:border-r-0 md:overflow-hidden md:opacity-0'}`}
      >
        {/* Mobile close button */}
        <button
          onClick={toggleSidebar}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 md:hidden cursor-pointer"
          aria-label="Close sidebar"
        >
          <X size={20} weight="bold" />
        </button>

        {/* Brand Header */}
        <div className="p-5 flex items-center gap-3 border-b border-surface-850 flex-shrink-0">
          <div className="relative flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-tr from-accent-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-accent-500/10">
            <Aperture size={22} className="text-zinc-950 animate-spin-slow" weight="bold" />
            <div className="absolute inset-0 rounded-xl bg-accent-500/20 blur-[6px] -z-10 animate-pulse-soft" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-300 bg-clip-text text-transparent">
              Belirix
            </h1>
            <p className="text-[10px] text-zinc-500 font-medium truncate">
              Designed by Pratham Kairamkonda
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-4 flex-shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       bg-surface-900 border border-surface-800 text-sm font-semibold text-zinc-200
                       hover:text-accent-400 hover:border-accent-500/30 hover:bg-surface-850
                       transition-all active:scale-[0.98] cursor-pointer shadow-md group"
          >
            <Plus size={16} weight="bold" className="group-hover:rotate-90 transition-transform duration-200" />
            New Chat
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1">
          <div className="px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">
            History
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-600">No chats yet</div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeConversationId;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectChat(c.id)}
                  className={`group relative flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer
                             transition-all duration-200 select-none
                             ${
                               isActive
                                 ? 'bg-surface-850 border border-surface-750 text-accent-400 shadow-sm'
                                 : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-900/50 border border-transparent'
                             }`}
                >
                  <Chat size={16} className={isActive ? 'text-accent-500' : 'text-zinc-500'} />
                  
                  <span className="text-xs font-medium truncate pr-6 flex-1">
                    {c.title || 'New Chat'}
                  </span>

                  {/* Delete button (shows on hover) */}
                  <button
                    onClick={(e) => handleDeleteChat(e, c.id)}
                    className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity
                               p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-surface-800 cursor-pointer"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-850 bg-surface-950/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            {/* Diagnostic system dot */}
            <div className="flex items-center gap-2">
              {isModelReady ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-45" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-500" />
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Ready
                  </span>
                </>
              ) : (
                <>
                  <CircleNotch size={12} className="text-amber-500 animate-spin" weight="bold" />
                  <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                    Loading
                  </span>
                </>
              )}
            </div>

            {/* Version label */}
            <div className="text-[10px] font-mono text-zinc-500 font-medium">
              V1.0
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

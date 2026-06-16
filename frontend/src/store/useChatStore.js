import { create } from 'zustand';
import safeUUID from '../utils/uuid';
const loadLocalData = () => {
  try {
    const saved = localStorage.getItem('belirix_conversations');
    const activeId = localStorage.getItem('belirix_active_id');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const active = parsed.find((c) => c.id === activeId) || parsed[0];
        return {
          conversations: parsed,
          activeConversationId: active.id,
          messages: active.messages || [],
        };
      }
    }
  } catch (e) {
    console.error('Error loading conversations from localStorage:', e);
  }

  const defaultId = safeUUID();
  const defaultConv = {
    id: defaultId,
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
  };
  return {
    conversations: [defaultConv],
    activeConversationId: defaultId,
    messages: [],
  };
};

const saveLocalData = (conversations, activeId) => {
  try {
    localStorage.setItem('belirix_conversations', JSON.stringify(conversations));
    localStorage.setItem('belirix_active_id', activeId);
  } catch (e) {
    console.error('Error saving conversations to localStorage:', e);
  }
};

const useChatStore = create((set, get) => {
  const initialData = loadLocalData();

  return {
    conversations: initialData.conversations,
    activeConversationId: initialData.activeConversationId,
    messages: initialData.messages,

    newConversation: () =>
      set((state) => {
        const newId = safeUUID();
        const newConv = {
          id: newId,
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
        };
        const updatedConversations = [newConv, ...state.conversations];
        saveLocalData(updatedConversations, newId);
        return {
          conversations: updatedConversations,
          activeConversationId: newId,
          messages: [],
          streamingContent: '',
          isStreaming: false,
          error: null,
        };
      }),

    selectConversation: (id) =>
      set((state) => {
        const selected = state.conversations.find((c) => c.id === id);
        if (!selected) return {};
        saveLocalData(state.conversations, id);
        return {
          activeConversationId: id,
          messages: selected.messages || [],
          streamingContent: '',
          isStreaming: false,
          error: null,
        };
      }),

    deleteConversation: (id) =>
      set((state) => {
        let updatedConversations = state.conversations.filter((c) => c.id !== id);
        let newActiveId = state.activeConversationId;

        if (updatedConversations.length === 0) {
          const defaultId = safeUUID();
          const defaultConv = {
            id: defaultId,
            title: 'New Chat',
            messages: [],
            createdAt: Date.now(),
          };
          updatedConversations = [defaultConv];
          newActiveId = defaultId;
        } else if (state.activeConversationId === id) {
          newActiveId = updatedConversations[0].id;
        }

        const selected = updatedConversations.find((c) => c.id === newActiveId);
        saveLocalData(updatedConversations, newActiveId);

        return {
          conversations: updatedConversations,
          activeConversationId: newActiveId,
          messages: selected ? selected.messages || [] : [],
          streamingContent: '',
          isStreaming: false,
          error: null,
        };
      }),

    addMessage: (message) =>
      set((state) => {
        const newMessage = { id: safeUUID(), ...message };
        const updatedMessages = [...state.messages, newMessage];

        const updatedConversations = state.conversations.map((c) => {
          if (c.id === state.activeConversationId) {
            let title = c.title;
            if (c.messages.length === 0 && message.role === 'user') {
              const textContent =
                typeof message.content === 'string'
                  ? message.content
                  : message.content.find((p) => p.type === 'text')?.text || 'Image Chat';
              title = textContent.length > 24 ? textContent.substring(0, 24) + '...' : textContent;
            }
            return { ...c, title, messages: updatedMessages };
          }
          return c;
        });

        saveLocalData(updatedConversations, state.activeConversationId);
        return {
          messages: updatedMessages,
          conversations: updatedConversations,
        };
      }),

    clearMessages: () =>
      set((state) => {
        const updatedConversations = state.conversations.map((c) => {
          if (c.id === state.activeConversationId) {
            return { ...c, messages: [] };
          }
          return c;
        });
        saveLocalData(updatedConversations, state.activeConversationId);
        return {
          messages: [],
          conversations: updatedConversations,
          streamingContent: '',
          error: null,
        };
      }),

    images: [], 

    addPendingPlaceholder: (id, preview) =>
      set((state) => {
        if (state.images.length >= 3) return {};
        return {
          images: [
            ...state.images,
            { id, preview, isLoading: true, base64: null, mimeType: null, error: false },
          ],
        };
      }),

    updatePendingImage: (id, base64, mimeType) =>
      set((state) => ({
        images: state.images.map((img) =>
          img.id === id ? { ...img, base64, mimeType, isLoading: false } : img
        ),
      })),

    setPendingImageError: (id) =>
      set((state) => ({
        images: state.images.map((img) =>
          img.id === id ? { ...img, error: true, isLoading: false } : img
        ),
      })),

    removeImage: (index) =>
      set((state) => {
        const updated = [...state.images];
        if (updated[index]?.preview) {
          URL.revokeObjectURL(updated[index].preview);
        }
        updated.splice(index, 1);
        return { images: updated };
      }),

    clearImages: () =>
      set((state) => {
        state.images.forEach((img) => {
          if (img.preview) URL.revokeObjectURL(img.preview);
        });
        return { images: [] };
      }),

    isStreaming: false,
    streamingContent: '',

    setStreaming: (val) => set({ isStreaming: val }),
    setStreamingContent: (val) => set({ streamingContent: val }),
    appendStreamingContent: (chunk) =>
      set((state) => ({ streamingContent: state.streamingContent + chunk })),

    finalizeStreaming: () =>
      set((state) => {
        if (!state.streamingContent) return { isStreaming: false };
        const assistantMessage = {
          id: safeUUID(),
          role: 'assistant',
          content: state.streamingContent,
        };
        const updatedMessages = [...state.messages, assistantMessage];
        const updatedConversations = state.conversations.map((c) => {
          if (c.id === state.activeConversationId) {
            return { ...c, messages: updatedMessages };
          }
          return c;
        });

        saveLocalData(updatedConversations, state.activeConversationId);
        return {
          messages: updatedMessages,
          conversations: updatedConversations,
          streamingContent: '',
          isStreaming: false,
        };
      }),

    isModelReady: false,
    setModelReady: (val) => set({ isModelReady: val }),

    isSidebarOpen: true,
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setSidebarOpen: (val) => set({ isSidebarOpen: val }),

    error: null,
    setError: (err) => set({ error: err }),
    clearError: () => set({ error: null }),
  };
});

export default useChatStore;

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: any[];
  follow_up_suggestions?: string[];
  document_context?: any;
  token_count?: number;
  created_at?: string;
  intent_eval?: any;
  attachments?: any[];
  imageUrls?: string[]; // blob URLs for optimistic UI before upload completes
}

export interface StreamingState {
  isStreaming: boolean;
  streamedContent: string;
  error: string | null;
  evidence: any[];
  status: string;
}

interface ChatState {
  // Messages
  messages: Message[];
  currentConversationId: string | null;
  messageCache: Record<string, { messages: Message[]; timestamp: number }>;
  isLoadingMessages: boolean;

  // Streaming state
  streaming: StreamingState;

  // Document context
  attachedDocument: any | null;
  attachedImages: { id: string; url: string; file: File }[];

  // Actions
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  updateMessageSuggestions: (messageId: string, suggestions: string[]) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;

  setCurrentConversationId: (id: string | null) => void;

  setStreaming: (streaming: Partial<StreamingState>) => void;
  resetStreaming: () => void;
  appendStreamedContent: (content: string) => void;
  setStreamingEvidence: (evidence: any[]) => void;
  setStreamingStatus: (status: string) => void;

  setAttachedDocument: (doc: any | null) => void;
  setAttachedImages: (images: { id: string; url: string; file: File }[]) => void;
  addAttachedImages: (images: { id: string; url: string; file: File }[]) => void;
  removeAttachedImage: (id: string) => void;
  clearAttachedImages: () => void;
  clearAttachedDocument: () => void;

  // Suggestions
  currentSuggestions: string[];
  setCurrentSuggestions: (suggestions: string[]) => void;
  clearSuggestions: () => void;
  setLoadingMessages: (isLoading: boolean) => void;

  // Cache actions
  getCachedMessages: (conversationId: string) => Message[] | null;
  setCachedMessages: (conversationId: string, messages: Message[]) => void;
  clearCachedMessages: (conversationId: string) => void;
  clearCache: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      // Initial state
      messages: [],
      currentConversationId: null,
      messageCache: {},
      isLoadingMessages: false,
      streaming: {
        isStreaming: false,
        streamedContent: '',
        error: null,
        evidence: [],
        status: '',
      },
      attachedDocument: null,
      attachedImages: [],
      currentSuggestions: [],

      // Actions
      addMessage: (message) => {
        set((state) => {
          // Ensure ID is truly unique and non-empty
          const finalId = (message.id && message.id.trim() !== '')
            ? message.id
            : crypto.randomUUID();

          return {
            messages: [...state.messages, { ...message, id: finalId }],
          };
        });
      },

      updateLastMessage: (content) => {
        set((state) => {
          const messages = [...state.messages];
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === 'assistant') {
              messages[messages.length - 1] = {
                ...lastMessage,
                content,
              };
            }
          }
          return { messages };
        });
      },

      updateMessageSuggestions: (messageId, suggestions) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId ? { ...msg, follow_up_suggestions: suggestions } : msg
          ),
        }));
      },

      setMessages: (messages) => {
        // Optimization: Only validate and assign UUIDs to messages without valid IDs
        const validatedMessages = messages.map(msg => {
          if (msg.id && msg.id.trim() !== '') {
            return msg; // Skip validation for messages with valid IDs
          }
          return { ...msg, id: crypto.randomUUID() };
        });
        set({ messages: validatedMessages });
      },

      clearMessages: () => {
        set({
          messages: [],
          currentSuggestions: [],
          attachedDocument: null,
          attachedImages: [],
        });
      },

      setCurrentConversationId: (id) => {
        set({ currentConversationId: id });
      },

      setStreaming: (streaming) => {
        set((state) => ({
          streaming: { ...state.streaming, ...streaming },
        }));
      },

      resetStreaming: () => {
        set({
          streaming: {
            isStreaming: false,
            streamedContent: '',
            error: null,
            evidence: [],
            status: '',
          },
        });
      },

      appendStreamedContent: (content) => {
        set((state) => ({
          streaming: {
            ...state.streaming,
            streamedContent: state.streaming.streamedContent + content,
          },
        }));
      },

      setStreamingEvidence: (evidence) => {
        set((state) => ({
          streaming: { ...state.streaming, evidence },
        }));
      },

      setStreamingStatus: (status) => {
        set((state) => ({
          streaming: { ...state.streaming, status },
        }));
      },

      setAttachedDocument: (doc) => {
        set({ attachedDocument: doc });
      },

      setAttachedImages: (images) => {
        set({ attachedImages: images });
      },

      addAttachedImages: (images) => {
        set((state) => ({
          attachedImages: [...state.attachedImages, ...images].slice(0, 5),
        }));
      },

      removeAttachedImage: (id) => {
        set((state) => {
          const removed = state.attachedImages.find(img => img.id === id);
          if (removed) URL.revokeObjectURL(removed.url);
          return {
            attachedImages: state.attachedImages.filter((img) => img.id !== id),
          };
        });
      },

      clearAttachedImages: () => {
        // Note: We don't revoke blob URLs here because they may be referenced
        // by messages that are already added to the chat. The URLs will be
        // cleaned up when the message component unmounts or when the images
        // are uploaded and replaced with Cloudinary URLs.
        set({ attachedImages: [] });
      },

      clearAttachedDocument: () => {
        set({ attachedDocument: null });
      },

      setCurrentSuggestions: (suggestions) => {
        set({ currentSuggestions: suggestions });
      },

      clearSuggestions: () => {
        set({ currentSuggestions: [] });
      },

      setLoadingMessages: (isLoading) => {
        set({ isLoadingMessages: isLoading });
      },

      // Cache actions
      getCachedMessages: (id) => {
        const state = (useChatStore.getState() as any);
        const cached = state.messageCache[id];
        if (!cached) return null;

        // Check TTL (5 minutes = 300000ms)
        const CACHE_TTL = 5 * 60 * 1000;
        const now = Date.now();
        if (now - cached.timestamp > CACHE_TTL) {
          // Cache expired, return null
          return null;
        }

        return cached.messages;
      },

      setCachedMessages: (id, messages) => {
        set((state) => ({
          messageCache: {
            ...state.messageCache,
            [id]: { messages, timestamp: Date.now() },
          },
        }));
      },

      clearCachedMessages: (id) => {
        set((state) => {
          const newCache = { ...state.messageCache };
          delete newCache[id];
          return { messageCache: newCache };
        });
      },

      clearCache: () => {
        set({ messageCache: {} });
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        currentConversationId: state.currentConversationId,
        messageCache: state.messageCache,
      }),
    }
  )
);

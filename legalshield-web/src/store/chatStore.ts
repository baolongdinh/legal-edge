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
}

export interface StreamingState {
  isStreaming: boolean;
  streamedContent: string;
  error: string | null;
}

interface ChatState {
  // Messages
  messages: Message[];
  currentConversationId: string | null;
  messageCache: Record<string, Message[]>;
  isLoadingMessages: boolean;

  // Streaming state
  streaming: StreamingState;

  // Document context
  attachedDocument: any | null;

  // Actions
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  setMessages: (messages: Message[]) => void;
  clearMessages: () => void;

  setCurrentConversationId: (id: string | null) => void;

  setStreaming: (streaming: Partial<StreamingState>) => void;
  resetStreaming: () => void;
  appendStreamedContent: (content: string) => void;

  setAttachedDocument: (doc: any | null) => void;

  // Suggestions
  currentSuggestions: string[];
  setCurrentSuggestions: (suggestions: string[]) => void;
  clearSuggestions: () => void;
  setLoadingMessages: (isLoading: boolean) => void;

  // Cache actions
  getCachedMessages: (conversationId: string) => Message[] | null;
  setCachedMessages: (conversationId: string, messages: Message[]) => void;
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
      },
      attachedDocument: null,
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

      setMessages: (messages) => {
        // Validation pass to ensure all messages have IDs
        const validatedMessages = messages.map(msg => ({
          ...msg,
          id: (msg.id && msg.id.trim() !== '') ? msg.id : crypto.randomUUID()
        }));
        set({ messages: validatedMessages });
      },

      clearMessages: () => {
        set({
          messages: [],
          currentSuggestions: [],
          attachedDocument: null,
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

      setAttachedDocument: (doc) => {
        set({ attachedDocument: doc });
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
        return state.messageCache[id] || null;
      },

      setCachedMessages: (id, messages) => {
        set((state) => ({
          messageCache: {
            ...state.messageCache,
            [id]: messages,
          },
        }));
      },

      clearCache: () => {
        set({ messageCache: {} });
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        currentConversationId: state.currentConversationId,
      }),
    }
  )
);

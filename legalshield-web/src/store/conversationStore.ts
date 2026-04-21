import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  is_archived: boolean;
  is_starred: boolean;
  folder: string | null;
  summary_level_1: string | null;
  summary_level_2: string | null;
  summary_level_3: string | null;
  summary_last_updated: string | null;
  message_count: number;
  total_tokens: number;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

type FilterType = 'all' | 'starred' | 'archived';

interface ConversationState {
  // List state
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;

  // Selected state
  selectedConversation: Conversation | null;

  // Filter state
  filter: FilterType;
  searchQuery: string;
  selectedFolder: string | null;

  // Pagination
  page: number;
  hasMore: boolean;

  // Available folders
  availableFolders: string[];

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;

  setSelectedConversation: (conversation: Conversation | null) => void;

  setFilter: (filter: FilterType) => void;
  setSearchQuery: (query: string) => void;
  setSelectedFolder: (folder: string | null) => void;

  setPage: (page: number) => void;
  setHasMore: (hasMore: boolean) => void;

  setAvailableFolders: (folders: string[]) => void;

  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed
  filteredConversations: () => Conversation[];
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      // Initial state
      conversations: [],
      isLoading: false,
      error: null,
      selectedConversation: null,
      filter: 'all',
      searchQuery: '',
      selectedFolder: null,
      page: 1,
      hasMore: false,
      availableFolders: [],

      // Actions
      setConversations: (conversations) => {
        set({ conversations });
      },

      addConversation: (conversation) => {
        set((state) => ({
          conversations: [conversation, ...state.conversations],
        }));
      },

      updateConversation: (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, ...updates } : conv
          ),
          selectedConversation:
            state.selectedConversation?.id === id
              ? { ...state.selectedConversation, ...updates }
              : state.selectedConversation,
        }));
      },

      removeConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.filter((conv) => conv.id !== id),
          selectedConversation:
            state.selectedConversation?.id === id
              ? null
              : state.selectedConversation,
        }));
      },

      setSelectedConversation: (conversation) => {
        set({ selectedConversation: conversation });
      },

      setFilter: (filter) => {
        set({ filter, page: 1 });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query, page: 1 });
      },

      setSelectedFolder: (folder) => {
        set({ selectedFolder: folder, page: 1 });
      },

      setPage: (page) => {
        set({ page });
      },

      setHasMore: (hasMore) => {
        set({ hasMore });
      },

      setAvailableFolders: (folders) => {
        set({ availableFolders: folders });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },

      setError: (error) => {
        set({ error });
      },

      // Computed
      filteredConversations: () => {
        const state = get();
        let filtered = state.conversations;

        // Apply filter
        switch (state.filter) {
          case 'starred':
            filtered = filtered.filter((c) => c.is_starred);
            break;
          case 'archived':
            filtered = filtered.filter((c) => c.is_archived);
            break;
          case 'all':
          default:
            filtered = filtered.filter((c) => !c.is_archived);
            break;
        }

        // Apply folder filter
        if (state.selectedFolder) {
          filtered = filtered.filter((c) => c.folder === state.selectedFolder);
        }

        // Apply search
        if (state.searchQuery.trim()) {
          const query = state.searchQuery.toLowerCase();
          filtered = filtered.filter(
            (c) =>
              c.title.toLowerCase().includes(query)
          );
        }

        return filtered;
      },
    }),
    {
      name: 'conversation-storage',
      partialize: (state) => ({
        selectedConversation: state.selectedConversation,
        filter: state.filter,
      }),
    }
  )
);

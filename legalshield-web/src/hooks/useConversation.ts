import { useCallback, useEffect, useState } from 'react';
import { useConversationStore, type Conversation } from '@/store/conversationStore';
import { useChatStore } from '@/store/chatStore';
import { conversationApi, messageApi } from '@/lib/conversation-api';

interface UseConversationReturn {
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
  selectedConversation: Conversation | null;
  filter: 'all' | 'starred' | 'archived';
  searchQuery: string;
  availableFolders: string[];

  // Actions
  fetchConversations: () => Promise<void>;
  createConversation: (title?: string, folder?: string) => Promise<Conversation | null>;
  selectConversation: (conversation: Conversation | null) => Promise<void>;
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  unarchiveConversation: (id: string) => Promise<void>;
  starConversation: (id: string) => Promise<void>;
  unstarConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  moveToFolder: (id: string, folder: string | null) => Promise<void>;

  // Filter actions
  setFilter: (filter: 'all' | 'starred' | 'archived') => void;
  setSearchQuery: (query: string) => void;
}

export function useConversation(): UseConversationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    conversations,
    selectedConversation,
    filter,
    searchQuery,
    availableFolders,
    setConversations,
    addConversation,
    updateConversation: updateStoreConversation,
    removeConversation,
    setSelectedConversation,
    setFilter: setStoreFilter,
    setSearchQuery: setStoreSearchQuery,
    setAvailableFolders,
  } = useConversationStore();

  const {
    setMessages,
    setCurrentConversationId,
    clearMessages,
    getCachedMessages,
    setCachedMessages,
    setLoadingMessages,
  } = useChatStore();

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await conversationApi.list({
        filter,
        search: searchQuery || undefined,
      });

      if (response.success) {
        setConversations(response.conversations);
        setAvailableFolders(response.filters?.available_folders || []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch conversations';
      setError(message);
      console.error('Fetch conversations error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filter, searchQuery, setConversations, setAvailableFolders]);

  // Create conversation
  const createConversation = useCallback(async (title?: string, folder?: string) => {
    try {
      const response = await conversationApi.create(title, folder);

      if (response.success) {
        addConversation(response.conversation);
        return response.conversation;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create conversation';
      setError(message);
      console.error('Create conversation error:', err);
    }
    return null;
  }, [addConversation]);

  const selectConversation = useCallback(async (conversation: Conversation | null) => {
    setSelectedConversation(conversation);

    if (conversation) {
      setCurrentConversationId(conversation.id);

      // Try cache first
      const cached = getCachedMessages(conversation.id);
      if (cached) {
        setMessages(cached);
      } else {
        // Clear if not in cache to show loading state
        setMessages([]);
      }

      setLoadingMessages(true);
      try {
        const response = await messageApi.getForConversation(conversation.id);

        if (response.success) {
          setMessages(response.messages);
          setCachedMessages(conversation.id, response.messages);
        }
      } catch (err) {
        console.error('Load messages error:', err);
        if (!cached) clearMessages();
      } finally {
        setLoadingMessages(false);
      }
    } else {
      setCurrentConversationId(null);
      clearMessages();
    }
  }, [setSelectedConversation, setCurrentConversationId, setMessages, getCachedMessages, setCachedMessages, clearMessages, setLoadingMessages]);

  // Update conversation
  const updateConversation = useCallback(async (id: string, updates: Partial<Conversation>) => {
    try {
      const response = await conversationApi.update(id, updates);

      if (response.success) {
        updateStoreConversation(id, updates);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update conversation';
      setError(message);
      console.error('Update conversation error:', err);
    }
  }, [updateStoreConversation]);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    try {
      await conversationApi.delete(id);
      removeConversation(id);

      // Clear selection if deleted conversation was selected
      if (selectedConversation?.id === id) {
        setSelectedConversation(null);
        clearMessages();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete conversation';
      setError(message);
      console.error('Delete conversation error:', err);
    }
  }, [removeConversation, selectedConversation, setSelectedConversation, clearMessages]);

  // Archive conversation
  const archiveConversation = useCallback(async (id: string) => {
    try {
      await conversationApi.archive(id);
      updateStoreConversation(id, { is_archived: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive conversation';
      setError(message);
      console.error('Archive conversation error:', err);
    }
  }, [updateStoreConversation]);

  // Unarchive conversation
  const unarchiveConversation = useCallback(async (id: string) => {
    try {
      await conversationApi.unarchive(id);
      updateStoreConversation(id, { is_archived: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unarchive conversation';
      setError(message);
      console.error('Unarchive conversation error:', err);
    }
  }, [updateStoreConversation]);

  // Star conversation
  const starConversation = useCallback(async (id: string) => {
    const original = conversations.find(c => c.id === id);
    updateStoreConversation(id, { is_starred: true });

    try {
      await conversationApi.star(id);
    } catch (err) {
      if (original) updateStoreConversation(id, { is_starred: original.is_starred });
      const message = err instanceof Error ? err.message : 'Failed to star conversation';
      setError(message);
    }
  }, [updateStoreConversation, conversations]);

  // Unstar conversation
  const unstarConversation = useCallback(async (id: string) => {
    const original = conversations.find(c => c.id === id);
    updateStoreConversation(id, { is_starred: false });

    try {
      await conversationApi.unstar(id);
    } catch (err) {
      if (original) updateStoreConversation(id, { is_starred: original.is_starred });
      const message = err instanceof Error ? err.message : 'Failed to unstar conversation';
      setError(message);
    }
  }, [updateStoreConversation, conversations]);

  // Rename conversation
  const renameConversation = useCallback(async (id: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const original = conversations.find(c => c.id === id);
    updateStoreConversation(id, { title: trimmedTitle });

    try {
      await conversationApi.rename(id, trimmedTitle);
    } catch (err) {
      if (original) updateStoreConversation(id, { title: original.title });
      const message = err instanceof Error ? err.message : 'Failed to rename conversation';
      setError(message);
    }
  }, [updateStoreConversation, conversations]);

  // Move to folder
  const moveToFolder = useCallback(async (id: string, folder: string | null) => {
    try {
      await conversationApi.moveToFolder(id, folder);
      updateStoreConversation(id, { folder });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move conversation';
      setError(message);
      console.error('Move conversation error:', err);
    }
  }, [updateStoreConversation]);

  // Set filter
  const setFilter = useCallback((newFilter: 'all' | 'starred' | 'archived') => {
    setStoreFilter(newFilter);
  }, [setStoreFilter]);

  // Set search query
  const setSearchQueryCallback = useCallback((query: string) => {
    setStoreSearchQuery(query);
  }, [setStoreSearchQuery]);

  // Auto-fetch when filter or search changes
  useEffect(() => {
    fetchConversations();
  }, [filter, searchQuery]);

  return {
    conversations,
    isLoading,
    error,
    selectedConversation,
    filter,
    searchQuery,
    availableFolders,

    fetchConversations,
    createConversation,
    selectConversation,
    updateConversation,
    deleteConversation,
    archiveConversation,
    unarchiveConversation,
    starConversation,
    unstarConversation,
    renameConversation,
    moveToFolder,

    setFilter,
    setSearchQuery: setSearchQueryCallback,
  };
}

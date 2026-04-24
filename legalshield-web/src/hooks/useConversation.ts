import { useCallback, useEffect, useState, useRef } from 'react';
import { useConversationStore, type Conversation } from '@/store/conversationStore';
import { useChatStore } from '@/store/chatStore';
import { conversationApi, messageApi } from '@/lib/conversation-api';
import { useDebounce } from './useDebounce';

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

  // AbortController for cancelling in-flight message fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Track if a conversation selection is in progress to prevent concurrent selections
  const isSelectingRef = useRef(false);

  // Track if conversations have been fetched on mount
  const hasFetchedConversationsRef = useRef(false);

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
    // Generate a temporary ID for optimistic update
    const tempId = `temp-${crypto.randomUUID()}`;
    const tempConv: Conversation = {
      id: tempId,
      user_id: '', // Will be set by server
      title: title || 'Đang khởi tạo...',
      is_archived: false,
      is_starred: false,
      folder: folder || null,
      message_count: 0,
      total_tokens: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      summary_level_1: null,
      summary_level_2: null,
      summary_level_3: null,
      summary_last_updated: null,
    };

    addConversation(tempConv);

    try {
      const response = await conversationApi.create(title, folder);

      if (response.success) {
        // Remove temp and add real one
        removeConversation(tempId);
        addConversation(response.conversation);
        return response.conversation;
      } else {
        removeConversation(tempId);
        setError('Failed to create conversation');
      }
    } catch (err) {
      removeConversation(tempId);
      const message = err instanceof Error ? err.message : 'Failed to create conversation';
      setError(message);
      console.error('Create conversation error:', err);
    }
    return null;
  }, [addConversation, removeConversation]);

  const selectConversation = useCallback(async (conversation: Conversation | null) => {
    // Prevent concurrent selections
    if (isSelectingRef.current) {
      console.log('[selectConversation] Selection already in progress, skipping');
      return;
    }

    // Cancel any in-flight message fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 1. Update store synchronously for instant UI feedback in sidebar
    setSelectedConversation(conversation);

    if (conversation) {
      setCurrentConversationId(conversation.id);
      isSelectingRef.current = true;

      // 2. Try cache first to show messages immediately
      const cached = getCachedMessages(conversation.id);
      if (cached) {
        setMessages(cached);
      } else {
        setMessages([]);
      }

      // 3. Background fetch for latest messages with AbortController
      setLoadingMessages(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await messageApi.getForConversation(conversation.id);
        // Only update if this request wasn't cancelled
        if (!abortController.signal.aborted && response.success) {
          const mappedMessages = (response.messages || []).map((msg: any) => ({
            ...msg,
            attachments: msg.attachments || msg.message_attachments || []
          }));
          setMessages(mappedMessages);
          setCachedMessages(conversation.id, mappedMessages);
        }
      } catch (err) {
        // Ignore errors from aborted requests
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Load messages error:', err);
          if (!cached) clearMessages();
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingMessages(false);
        }
        abortControllerRef.current = null;
        isSelectingRef.current = false;
      }
    } else {
      setCurrentConversationId(null);
      clearMessages();
    }
  }, [setSelectedConversation, setCurrentConversationId, setMessages, getCachedMessages, setCachedMessages, clearMessages, setLoadingMessages]);

  // Update conversation
  const updateConversation = useCallback(async (id: string, updates: Partial<Conversation>) => {
    const original = conversations.find(c => c.id === id);
    updateStoreConversation(id, updates);

    try {
      const response = await conversationApi.update(id, updates);
      if (!response.success && original) {
        // Rollback on failure
        updateStoreConversation(id, original);
        setError('Cập nhật không thành công. Vui lòng thử lại.');
      }
    } catch (err) {
      if (original) updateStoreConversation(id, original);
      const message = err instanceof Error ? err.message : 'Failed to update conversation';
      setError(message);
      console.error('Update conversation error:', err);
    }
  }, [updateStoreConversation, conversations]);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    const original = conversations.find(c => c.id === id);
    if (!original) return;

    // 1. Optimistically remove from store
    removeConversation(id);
    if (selectedConversation?.id === id) {
      setSelectedConversation(null);
      clearMessages();
    }

    try {
      const response = await conversationApi.delete(id);
      if (!response.success) {
        // Rollback
        addConversation(original);
        setError('Xóa không thành công. Vui lòng thử lại.');
      }
    } catch (err) {
      // Rollback
      addConversation(original);
      const message = err instanceof Error ? err.message : 'Failed to delete conversation';
      setError(message);
      console.error('Delete conversation error:', err);
    }
  }, [removeConversation, selectedConversation, setSelectedConversation, clearMessages, conversations, addConversation]);

  // Archive conversation
  const archiveConversation = useCallback(async (id: string) => {
    const original = conversations.find(c => c.id === id);
    updateStoreConversation(id, { is_archived: true });

    try {
      const response = await conversationApi.archive(id);
      if (!response.success && original) {
        updateStoreConversation(id, { is_archived: original.is_archived });
      }
    } catch (err) {
      if (original) updateStoreConversation(id, { is_archived: original.is_archived });
      const message = err instanceof Error ? err.message : 'Failed to archive conversation';
      setError(message);
      console.error('Archive conversation error:', err);
    }
  }, [updateStoreConversation, conversations]);

  // Unarchive conversation
  const unarchiveConversation = useCallback(async (id: string) => {
    const original = conversations.find(c => c.id === id);
    updateStoreConversation(id, { is_archived: false });

    try {
      const response = await conversationApi.unarchive(id);
      if (!response.success && original) {
        updateStoreConversation(id, { is_archived: original.is_archived });
      }
    } catch (err) {
      if (original) updateStoreConversation(id, { is_archived: original.is_archived });
      const message = err instanceof Error ? err.message : 'Failed to unarchive conversation';
      setError(message);
      console.error('Unarchive conversation error:', err);
    }
  }, [updateStoreConversation, conversations]);

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
    const original = conversations.find(c => c.id === id);
    updateStoreConversation(id, { folder });

    try {
      const response = await conversationApi.moveToFolder(id, folder);
      if (!response.success && original) {
        updateStoreConversation(id, { folder: original.folder });
      }
    } catch (err) {
      if (original) updateStoreConversation(id, { folder: original.folder });
      const message = err instanceof Error ? err.message : 'Failed to move conversation';
      setError(message);
      console.error('Move conversation error:', err);
    }
  }, [updateStoreConversation, conversations]);

  // Set filter
  const setFilter = useCallback((newFilter: 'all' | 'starred' | 'archived') => {
    setStoreFilter(newFilter);
  }, [setStoreFilter]);

  // Set search query
  const setSearchQueryCallback = useCallback((query: string) => {
    setStoreSearchQuery(query);
  }, [setStoreSearchQuery]);

  // Debounce search query to prevent excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Auto-fetch conversations on mount and when filter/search changes (debounced)
  useEffect(() => {
    // Only fetch on mount or when filter/search actually changes
    if (!hasFetchedConversationsRef.current) {
      fetchConversations();
      hasFetchedConversationsRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  // Separate effect for filter/search changes
  useEffect(() => {
    // Only fetch if filter or search query changes after initial mount
    if (hasFetchedConversationsRef.current) {
      fetchConversations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedSearchQuery]);

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

import { invokeEdgeFunction, getAccessToken } from './supabase';
import { dedupeRequest } from './request-cache';
import { withQueue } from './request-queue';
import type { Conversation } from '@/store/conversationStore';
import type { Message } from '@/store/chatStore';

// Generate cache key for deduplication
const createCacheKey = (prefix: string, params: Record<string, unknown>): string => {
  return `${prefix}:${JSON.stringify(params)}`;
};

// Conversations API
export const conversationApi = {
  async list(params?: {
    filter?: 'all' | 'starred' | 'archived';
    folder?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.filter) queryParams.set('filter', params.filter);
    if (params?.folder) queryParams.set('folder', params.folder);
    if (params?.search) queryParams.set('search', params.search);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());

    const cacheKey = createCacheKey('conversations:list', params ?? {});

    return dedupeRequest(cacheKey, () =>
      withQueue(() =>
        invokeEdgeFunction<unknown>(`get-conversations?${queryParams.toString()}`, {
          method: 'GET'
        }), 1 // Higher priority for list operations
      )
    );
  },

  async create(title?: string, folder?: string) {
    return withQueue(() =>
      invokeEdgeFunction<unknown>('save-conversation', {
        body: { action: 'create', title, folder }
      })
    );
  },

  async update(id: string, updates: Partial<Pick<Conversation, 'title' | 'is_archived' | 'is_starred' | 'folder'>>) {
    return withQueue(() =>
      invokeEdgeFunction<unknown>('save-conversation', {
        body: { action: 'update', conversation_id: id, ...updates }
      })
    );
  },

  async delete(id: string) {
    return withQueue(() =>
      invokeEdgeFunction<unknown>('save-conversation', {
        body: { action: 'delete', conversation_id: id }
      })
    );
  },

  async archive(id: string) { return this.update(id, { is_archived: true }); },
  async unarchive(id: string) { return this.update(id, { is_archived: false }); },
  async star(id: string) { return this.update(id, { is_starred: true }); },
  async unstar(id: string) { return this.update(id, { is_starred: false }); },
  async rename(id: string, title: string) { return this.update(id, { title }); },
  async moveToFolder(id: string, folder: string | null) { return this.update(id, { folder }); },
};

// Messages API
export const messageApi = {
  async getForConversation(conversationId: string, params?: { page?: number; limit?: number; before?: string }) {
    const queryParams = new URLSearchParams();
    queryParams.set('conversation_id', conversationId);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.before) queryParams.set('before', params.before);

    const cacheKey = createCacheKey(`messages:${conversationId}`, params ?? {});

    return dedupeRequest(cacheKey, () =>
      withQueue(() =>
        invokeEdgeFunction<unknown>(`get-messages?${queryParams.toString()}`, {
          method: 'GET'
        }), 2 // Higher priority for messages
      )
    );
  },

  async save(conversationId: string, message: Omit<Message, 'id' | 'created_at'>) {
    return withQueue(() =>
      invokeEdgeFunction<unknown>('save-message', {
        body: { conversation_id: conversationId, ...message }
      }), 3 // Highest priority for save operations
    );
  },

  async saveUserMessage(conversationId: string, content: string, documentContext?: unknown, attachments?: unknown[]) {
    return this.save(conversationId, {
      role: 'user',
      content,
      document_context: documentContext,
      attachments,
      token_count: Math.ceil(content.length / 4),
    });
  },

  async saveAssistantMessage(conversationId: string, content: string, citations?: unknown[], suggestions?: string[]) {
    return this.save(conversationId, {
      role: 'assistant',
      content,
      citations,
      follow_up_suggestions: suggestions,
      token_count: Math.ceil(content.length / 4),
    });
  },
};

// Streaming Chat API
export const streamingChatApi = {
  // Internal stream function with retry logic
  async _streamWithRetry(
    message: string,
    history: Message[],
    conversationId: string | undefined,
    documentContext: unknown | undefined,
    onChunk: (chunk: string) => void,
    onDone: (payload: unknown) => void,
    onError: (error: string) => void,
    onSuggestions?: (suggestions: string[]) => void,
    onEvidence?: (evidence: unknown[]) => void,
    onStatus?: (status: string) => void,
    attachments?: unknown[],
    retryAttempt = 0,
    maxRetries = 3
  ): Promise<void> {
    const token = await getAccessToken();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/legal-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          history,
          conversation_id: conversationId,
          image_attachments: attachments,
          document_context: documentContext,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to start stream');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let hasReceivedData = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          hasReceivedData = true;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                switch (data.type) {
                  case 'chunk': onChunk(data.content); break;
                  case 'evidence': if (onEvidence && data.payload) onEvidence(data.payload); break;
                  case 'status': if (onStatus && data.payload) onStatus(data.payload); break;
                  case 'suggestions': if (onSuggestions && data.content) onSuggestions(JSON.parse(data.content)); break;
                  case 'done': onDone(data.payload); return;
                  case 'error': onError(data.error || 'Unknown error'); return;
                }
              } catch { /* Skip malformed data */ }
            }
          }
        }

        // Clean end of stream (no more data)
        reader.releaseLock();
      } catch (error) {
        reader.releaseLock();

        // Retry logic - only if no data received yet
        if (!hasReceivedData && retryAttempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, retryAttempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));

          // Retry the stream
          return this._streamWithRetry(
            message, history, conversationId, documentContext,
            onChunk, onDone, onError, onSuggestions, onEvidence, onStatus,
            attachments, retryAttempt + 1, maxRetries
          );
        }

        // Max retries reached or already received data, report error
        const errorMessage = error instanceof Error ? error.message : 'Stream failed after retries';
        onError(errorMessage);
      }
    } catch (error) {
      // Initial connection error - retry if possible
      if (retryAttempt < maxRetries) {
        const delay = Math.pow(2, retryAttempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        return this._streamWithRetry(
          message, history, conversationId, documentContext,
          onChunk, onDone, onError, onSuggestions, onEvidence, onStatus,
          attachments, retryAttempt + 1, maxRetries
        );
      }

      const errorMessage = error instanceof Error ? error.message : 'Failed to start stream';
      onError(errorMessage);
    }
  },

  // Public stream method (no retry parameters exposed)
  async stream(
    message: string,
    history: Message[],
    conversationId: string | undefined,
    documentContext: unknown | undefined,
    onChunk: (chunk: string) => void,
    onDone: (payload: unknown) => void,
    onError: (error: string) => void,
    onSuggestions?: (suggestions: string[]) => void,
    onEvidence?: (evidence: unknown[]) => void,
    onStatus?: (status: string) => void,
    attachments?: unknown[]
  ): Promise<void> {
    return this._streamWithRetry(
      message, history, conversationId, documentContext,
      onChunk, onDone, onError, onSuggestions, onEvidence, onStatus,
      attachments, 0, 3
    );
  },
};

// Suggestions API
export const suggestionsApi = {
  async generate(userMessage: string, aiResponse: string, conversationId?: string, messageId?: string, documentContext?: any) {
    return invokeEdgeFunction<any>('generate-suggestions', {
      body: {
        user_message: userMessage,
        ai_response: aiResponse,
        conversation_id: conversationId,
        message_id: messageId,
        document_context: documentContext,
      }
    });
  },
};

// Summarization API
export const summarizationApi = {
  async summarize(conversationId: string, level: 1 | 2 | 3 = 1) {
    return invokeEdgeFunction<any>('summarize-conversation', {
      body: { conversation_id: conversationId, level }
    });
  },
};

export default {
  conversations: conversationApi,
  messages: messageApi,
  streaming: streamingChatApi,
  suggestions: suggestionsApi,
  summarization: summarizationApi,
};

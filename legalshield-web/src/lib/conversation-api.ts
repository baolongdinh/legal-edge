import { invokeEdgeFunction, getAccessToken } from './supabase';
import type { Conversation } from '@/store/conversationStore';
import type { Message } from '@/store/chatStore';

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

    return invokeEdgeFunction<any>(`get-conversations?${queryParams.toString()}`, {
      method: 'GET'
    });
  },

  async create(title?: string, folder?: string) {
    return invokeEdgeFunction<any>('save-conversation', {
      body: { action: 'create', title, folder }
    });
  },

  async update(id: string, updates: Partial<Pick<Conversation, 'title' | 'is_archived' | 'is_starred' | 'folder'>>) {
    return invokeEdgeFunction<any>('save-conversation', {
      body: { action: 'update', conversation_id: id, ...updates }
    });
  },

  async delete(id: string) {
    return invokeEdgeFunction<any>('save-conversation', {
      body: { action: 'delete', conversation_id: id }
    });
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

    return invokeEdgeFunction<any>(`get-messages?${queryParams.toString()}`, {
      method: 'GET'
    });
  },

  async save(conversationId: string, message: Omit<Message, 'id' | 'created_at'>) {
    return invokeEdgeFunction<any>('save-message', {
      body: { conversation_id: conversationId, ...message }
    });
  },

  async saveUserMessage(conversationId: string, content: string, documentContext?: any, attachments?: any[]) {
    return this.save(conversationId, {
      role: 'user',
      content,
      document_context: documentContext,
      attachments,
      token_count: Math.ceil(content.length / 4),
    });
  },

  async saveAssistantMessage(conversationId: string, content: string, citations?: any[], suggestions?: string[]) {
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
  async stream(
    message: string,
    history: Message[],
    conversationId: string | undefined,
    documentContext: any | undefined,
    onChunk: (chunk: string) => void,
    onDone: (payload: any) => void,
    onError: (error: string) => void,
    onSuggestions?: (suggestions: string[]) => void,
    onEvidence?: (evidence: any[]) => void,
    onStatus?: (status: string) => void,
    attachments?: any[]
  ) {
    const token = await getAccessToken();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

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
        attachments,
        ...documentContext, // Spread for compatibility (summary, excerpts, etc.)
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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
    } finally {
      reader.releaseLock();
    }
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

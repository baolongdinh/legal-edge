import { useCallback, useRef, useState } from 'react';
import { useChatStore, type Message } from '@/store/chatStore';
import { streamingChatApi, messageApi } from '@/lib/conversation-api';

interface UseStreamingChatOptions {
  conversationId?: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface UseStreamingChatReturn {
  isStreaming: boolean;
  streamedContent: string;
  error: string | null;
  sendMessage: (content: string, history: Message[]) => Promise<void>;
  stopStreaming: () => void;
  retry: () => void;
}

export function useStreamingChat(options?: UseStreamingChatOptions): UseStreamingChatReturn {
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryDataRef = useRef<{ content: string; history: Message[] } | null>(null);

  const {
    addMessage,
    setStreaming,
    resetStreaming,
    setCurrentSuggestions,
    attachedDocument,
    streaming,
  } = useChatStore();

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming({ isStreaming: false });
  }, [setStreaming]);

  const sendMessage = useCallback(async (content: string, history: Message[]) => {
    if (streaming.isStreaming) return;

    // Store for retry
    retryDataRef.current = { content, history };

    // Reset state
    setError(null);
    resetStreaming();

    setStreaming({ isStreaming: true, streamedContent: '', error: null });

    // Add user message to store
    const userMessage: Message = {
      role: 'user',
      content,
      document_context: attachedDocument || undefined,
    };
    addMessage(userMessage);

    // Save user message if we have a conversation
    if (options?.conversationId) {
      try {
        await messageApi.saveUserMessage(
          options.conversationId,
          content,
          attachedDocument
        );
      } catch (err) {
        console.warn('Failed to save user message:', err);
      }
    }

    try {
      let assistantContent = '';
      let suggestions: string[] = [];
      let finalPayload: any = null;

      await streamingChatApi.stream(
        content,
        [...history, userMessage],
        options?.conversationId,
        attachedDocument,
        (chunk) => {
          // On chunk
          assistantContent += chunk;
          setStreaming({ streamedContent: assistantContent });
        },
        (payload) => {
          // On done
          finalPayload = payload;
          suggestions = payload.suggestions || [];
        },
        (err) => {
          // On error during streaming
          setError(err);
          setStreaming({ error: err });
          options?.onError?.(err);
        },
        (sugs) => {
          // On suggestions
          suggestions = sugs;
        }
      );

      // Save assistant message if we have a conversation
      if (options?.conversationId) {
        try {
          await messageApi.saveAssistantMessage(
            options.conversationId,
            assistantContent,
            finalPayload?.citations,
            suggestions
          );
        } catch (err) {
          console.warn('Failed to save assistant message:', err);
        }
      }

      // Add assistant message to store ONLY after backend save (or attempt)
      // and clearing of the streaming buffer
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantContent,
        follow_up_suggestions: suggestions,
        citations: finalPayload?.citations,
        token_count: finalPayload?.output_tokens,
      };

      // Clear streaming state BEFORE adding the message to the list
      // to avoid double-rendering in the list component
      resetStreaming();
      addMessage(assistantMessage);

      // Set suggestions
      if (suggestions.length > 0) {
        setCurrentSuggestions(suggestions);
      }

      options?.onComplete?.();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStreaming({ error: errorMessage });
      options?.onError?.(errorMessage);
    } finally {
      setStreaming({ isStreaming: false });
    }
  }, [
    streaming.isStreaming,
    options,
    addMessage,
    setStreaming,
    resetStreaming,
    setCurrentSuggestions,
    attachedDocument,
  ]);

  const retry = useCallback(() => {
    if (retryDataRef.current) {
      sendMessage(retryDataRef.current.content, retryDataRef.current.history);
    }
  }, [sendMessage]);

  return {
    isStreaming: streaming.isStreaming,
    streamedContent: streaming.streamedContent,
    error,
    sendMessage,
    stopStreaming,
    retry,
  };
}

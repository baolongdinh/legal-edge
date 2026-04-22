import { useCallback, useRef, useState } from 'react';
import { useChatStore, type Message } from '@/store/chatStore';
import { useConversationStore } from '@/store/conversationStore';
import { streamingChatApi, messageApi, suggestionsApi, summarizationApi } from '@/lib/conversation-api';

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
    setStreamingEvidence,
    setStreamingStatus,
    updateMessageSuggestions,
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
    // Dynamically get the latest ID from the store to avoid stale closure issues
    const activeId = useChatStore.getState().currentConversationId;

    if (streaming.isStreaming) return;

    retryDataRef.current = { content, history };
    setError(null);
    resetStreaming();
    setStreaming({ isStreaming: true, streamedContent: '', error: null });

    const userMessage: Message = {
      role: 'user',
      content,
      document_context: attachedDocument || undefined,
    };
    addMessage(userMessage);

    // Show initial status
    setStreamingStatus('Đang phân tích câu hỏi...');

    if (activeId) {
      try {
        await messageApi.saveUserMessage(
          activeId,
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
        activeId || undefined,
        attachedDocument,
        (chunk) => {
          // On chunk: clear status once content starts flowing
          assistantContent += chunk;
          setStreaming({ streamedContent: assistantContent });
          setStreamingStatus('');
        },
        (payload) => {
          finalPayload = payload;
          suggestions = payload.suggestions || [];
        },
        (err) => {
          setError(err);
          setStreaming({ error: err });
          options?.onError?.(err);
        },
        (sugs) => {
          suggestions = sugs;
        },
        (evidence) => {
          // Live-update the evidence panel when citations arrive
          setStreamingEvidence(evidence);
          setStreamingStatus('Đang phân tích nguồn pháp lý...');
        },
        (status) => {
          setStreamingStatus(status);
        }
      );

      // Save assistant message
      let savedMessageId: string | undefined;
      if (activeId) {
        try {
          const saved = await messageApi.saveAssistantMessage(
            activeId,
            assistantContent,
            finalPayload?.citations,
            suggestions
          );
          savedMessageId = saved?.data?.id;
        } catch (err) {
          console.warn('Failed to save assistant message:', err);
        }
      }

      // Prefer live-streamed evidence; fall back to done-payload citations
      const resolvedEvidence =
        useChatStore.getState().streaming.evidence?.length > 0
          ? useChatStore.getState().streaming.evidence
          : finalPayload?.citations || [];

      resetStreaming();

      const assistantMessage: Message = {
        id: savedMessageId,
        role: 'assistant',
        content: assistantContent,
        follow_up_suggestions: suggestions,
        citations: resolvedEvidence,
        token_count: finalPayload?.output_tokens,
      };
      addMessage(assistantMessage);

      if (suggestions.length > 0) {
        setCurrentSuggestions(suggestions);
      }

      // --- BACKGROUND: Fetch richer follow-up suggestions ---
      if (activeId && assistantContent) {
        suggestionsApi
          .generate(content, assistantContent, activeId, savedMessageId, attachedDocument)
          .then((res) => {
            if (res?.suggestions?.length > 0) {
              setCurrentSuggestions(res.suggestions);
              if (savedMessageId) {
                updateMessageSuggestions(savedMessageId, res.suggestions);
              }
            }
          })
          .catch((err) => console.warn('[Suggestions] Background generation failed:', err));
      }

      // --- BACKGROUND: Multi-layer conversation summaries ---
      if (activeId) {
        // Level 1: Quick Overview (Immediate)
        summarizationApi
          .summarize(activeId, 1)
          .then((res) => {
            if (res?.success && res.summary) {
              useConversationStore.getState().updateConversation(activeId, {
                summary_level_1: res.summary,
              });
            }
          })
          .catch((err) => console.warn('[Summary] Background Level-1 failed:', err));

        // Level 2: Detailed Legal Insight (3s delay)
        setTimeout(() => {
          summarizationApi.summarize(activeId, 2)
            .then((res) => {
              if (res?.success && res.summary) {
                useConversationStore.getState().updateConversation(activeId, {
                  summary_level_2: res.summary,
                });
              }
            })
            .catch((err) => console.warn('[Summary] Background Level-2 failed:', err));
        }, 3000);

        // Level 3: Recommendations (8s delay)
        setTimeout(() => {
          summarizationApi.summarize(activeId, 3)
            .then((res) => {
              if (res?.success && res.summary) {
                useConversationStore.getState().updateConversation(activeId, {
                  summary_level_3: res.summary,
                });
              }
            })
            .catch((err) => console.warn('[Summary] Background Level-3 failed:', err));
        }, 8000);
      }

      options?.onComplete?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setStreaming({ error: errorMessage });
      options?.onError?.(errorMessage);
    } finally {
      setStreaming({ isStreaming: false });
      setStreamingStatus('');
    }
  }, [
    streaming.isStreaming,
    options,
    addMessage,
    setStreaming,
    resetStreaming,
    setCurrentSuggestions,
    setStreamingEvidence,
    setStreamingStatus,
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

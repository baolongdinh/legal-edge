import { useCallback, useRef, useState } from 'react';
import { useChatStore, type Message } from '@/store/chatStore';
import { useConversationStore } from '@/store/conversationStore';
import { streamingChatApi, messageApi, suggestionsApi, summarizationApi } from '@/lib/conversation-api';
import { uploadChatImage } from '@/lib/supabase';

interface UseStreamingChatOptions {
  conversationId?: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface UseStreamingChatReturn {
  isStreaming: boolean;
  streamedContent: string;
  error: string | null;
  sendMessage: (content: string, history: Message[], conversationIdOverride?: string) => Promise<void>;
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
    attachedImages,
    clearAttachedImages,
    streaming,
  } = useChatStore();

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreaming({ isStreaming: false });
  }, [setStreaming]);

  const sendMessage = useCallback(async (content: string, history: Message[], conversationIdOverride?: string) => {
    // Dynamically get the latest ID from the store to avoid stale closure issues
    const activeId = conversationIdOverride || useChatStore.getState().currentConversationId;

    if (streaming.isStreaming) return;

    retryDataRef.current = { content, history };
    setError(null);
    resetStreaming();
    setStreaming({ isStreaming: true, streamedContent: '', error: null });

    const userMessage: Message = {
      role: 'user',
      content,
      document_context: attachedDocument || undefined,
      attachments: attachedImages.length > 0 ? attachedImages.map(img => ({ storage_path: '', name: img.file.name })) : undefined, // Placeholder for optimistic UI
    };
    addMessage(userMessage);

    // 1. Upload images if any
    let uploadedAttachments: any[] = [];
    if (attachedImages.length > 0) {
      setStreamingStatus('Đang tải ảnh lên...');
      try {
        // We need a conversation ID to upload. If none, we'll create one.
        let uploadId = activeId;
        if (!uploadId) {
          // If no active conversation, we'll wait for the conversation creation in the caller 
          // or create a temp one. Actually ChatPage handles creation if missing.
          // For simplicity in this loop, we'll assume ChatPage has or will create it.
          // Wait, createConversation is async. Let's adjust ChatPage as well.
        }

        const uploadPromises = attachedImages.map(img =>
          uploadChatImage(img.file, activeId || 'temp')
            .then(path => ({
              storage_path: path,
              file_name: img.file.name,
              file_size: img.file.size,
              mime_type: img.file.type
            }))
        );
        uploadedAttachments = await Promise.all(uploadPromises);

        // Update user message with real paths
        // (In a real app we'd update the specific message in store)
        userMessage.attachments = uploadedAttachments;
      } catch (err) {
        console.error('Image upload failed:', err);
        setError('Không thể tải ảnh lên. Vui lòng thử lại.');
        setStreaming({ isStreaming: false });
        return;
      }
    }

    // Show initial status
    setStreamingStatus('Đang phân tích câu hỏi...');

    if (activeId) {
      try {
        await messageApi.saveUserMessage(
          activeId,
          content,
          attachedDocument,
          uploadedAttachments
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
        },
        uploadedAttachments
      );

      // Save assistant message
      let savedMessageId: string | undefined;
      // Use a stable local ID so suggestions can always be updated by reference
      const localMessageId = crypto.randomUUID();

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
        id: savedMessageId || localMessageId, // prefer server ID, fallback to local
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
        const targetMessageId = savedMessageId || localMessageId;
        suggestionsApi
          .generate(content, assistantContent, activeId, targetMessageId, attachedDocument)
          .then((res) => {
            if (res?.suggestions?.length > 0) {
              setCurrentSuggestions(res.suggestions);
              updateMessageSuggestions(targetMessageId, res.suggestions);
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
      clearAttachedImages();
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

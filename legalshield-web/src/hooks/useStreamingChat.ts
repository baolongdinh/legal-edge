import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore, type Message } from '@/store/chatStore';
import { useConversationStore } from '@/store/conversationStore';
import { streamingChatApi, messageApi, suggestionsApi, summarizationApi } from '@/lib/conversation-api';
import { uploadChatImage } from '@/lib/supabase';
import { uploadToCloudinary } from '@/lib/cloudinary';

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
    clearCachedMessages,
  } = useChatStore();

  // Use refs for frequently changing values to avoid dependency issues
  const attachedImagesRef = useRef(attachedImages);
  const attachedDocumentRef = useRef(attachedDocument);

  // Update refs when values change
  useEffect(() => {
    attachedImagesRef.current = attachedImages;
  }, [attachedImages]);

  useEffect(() => {
    attachedDocumentRef.current = attachedDocument;
  }, [attachedDocument]);

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

    // Use refs to get latest attachments without dependency issues
    const localImages = [...attachedImagesRef.current];
    const localDocument = attachedDocumentRef.current;

    const userMessage: Message = {
      role: 'user',
      content,
      document_context: localDocument || undefined,
      // Attach blob URLs immediately for optimistic display in chat bubble
      imageUrls: localImages.length > 0 ? localImages.map(img => img.url) : undefined,
      attachments: localImages.length > 0 ? localImages.map(img => ({ storage_path: '', name: img.file.name })) : undefined,
      // If attachedDocument is an array (multiple files), include it in document_context
      ...(Array.isArray(localDocument) && localDocument.length > 0 ? {
        document_context: localDocument
      } : {}),
    };
    addMessage(userMessage);

    // Clear attachments from store to free memory
    clearAttachedImages();

    // 1. Upload images if any
    let uploadedAttachments: any[] = [];
    if (localImages.length > 0) {
      setStreamingStatus('Đang tải ảnh lên...');
      try {
        const uploadPromises = localImages.map(img =>
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
        userMessage.attachments = uploadedAttachments;
      } catch (err) {
        console.error('Image upload failed:', err);
        setError('Không thể tải ảnh lên. Vui lòng thử lại.');
        setStreaming({ isStreaming: false });
        return;
      }
    }

    // 2. Upload document files if any (deferred from ChatPage)
    if (Array.isArray(localDocument) && localDocument.length > 0) {
      setStreamingStatus('Đang tải tài liệu lên...');
      try {
        const uploadPromises = localDocument.map(async (doc: any) => {
          if (doc.file && !doc.storage_path) {
            // Upload to Cloudinary
            const cloudinaryUrl = await uploadToCloudinary(doc.file, 'chat_documents', 'auto');

            // For text-based files, also read content
            if (doc.file.type.startsWith('text/') || doc.file.name.endsWith('.txt') || doc.file.name.endsWith('.md') || doc.file.name.endsWith('.csv') || doc.file.name.endsWith('.json') || doc.file.name.endsWith('.xml') || doc.file.name.endsWith('.html')) {
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                  resolve({
                    ...doc,
                    storage_path: cloudinaryUrl,
                    document_context: event.target?.result as string,
                  });
                };
                reader.readAsText(doc.file);
              });
            } else {
              // For binary files, just store Cloudinary URL
              return {
                ...doc,
                storage_path: cloudinaryUrl,
                document_context: null,
              };
            }
          }
          return doc;
        });

        const uploadedDocs = await Promise.all(uploadPromises);
        // Update user message with uploaded documents
        userMessage.document_context = uploadedDocs;
      } catch {
        setError('Không thể tải tài liệu lên. Vui lòng thử lại.');
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
          localDocument,
          uploadedAttachments
        );
      } catch (err) {
        console.error('Failed to save user message:', err);
        // Show error but continue with streaming - message is already displayed optimistically
        setError('Không thể lưu tin nhắn. Vui lòng kiểm tra kết nối.');
        // Don't return - continue with streaming even if save fails
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

      // Invalidate cache for this conversation since we just added new messages
      if (activeId) {
        clearCachedMessages(activeId);
      }

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
        const conv = useConversationStore.getState().selectedConversation;

        // Level 1: Quick Overview (Immediate) - only if not already summarized
        if (!conv?.summary_level_1) {
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
        }

        // Level 2: Detailed Legal Insight (3s delay) - only if not already summarized
        if (!conv?.summary_level_2) {
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
        }

        // Level 3: Recommendations (8s delay) - only if not already summarized
        if (!conv?.summary_level_3) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    streaming.isStreaming,
    addMessage,
    setStreaming,
    resetStreaming,
    setCurrentSuggestions,
    setStreamingEvidence,
    setStreamingStatus,
    clearAttachedImages,
    clearCachedMessages,
    updateMessageSuggestions,
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

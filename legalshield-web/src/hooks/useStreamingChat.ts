import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore, type Message } from '@/store/chatStore';
import { useConversationStore } from '@/store/conversationStore';
import { streamingChatApi, messageApi, suggestionsApi, summarizationApi } from '../lib/conversation-api';
import { uploadToCloudinary } from '../lib/cloudinary';
import { uploadChatImage } from '../lib/supabase';
import * as Comlink from 'comlink';

// Proxy for the Web Worker
let workerApi: { parsePDF: (arrayBuffer: ArrayBuffer) => Promise<string>; parseDocx: (arrayBuffer: ArrayBuffer) => Promise<string> } | null = null;
const initWorker = () => {
  if (!workerApi) {
    console.log('[Worker] Initializing document worker');
    const worker = new Worker(new URL('../workers/document.worker.ts', import.meta.url), { type: 'module' });
    workerApi = Comlink.wrap(worker);
    console.log('[Worker] Worker initialized successfully');
  } else {
    console.log('[Worker] Reusing existing worker');
  }
  return workerApi;
};

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
  const summaryDebounceRef = useRef<NodeJS.Timeout | null>(null);

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
    clearAttachedDocument,
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

    console.log('[Document Upload] Starting upload', {
      hasLocalDocument: !!localDocument,
      localDocumentLength: Array.isArray(localDocument) ? localDocument.length : 0,
      localDocument: localDocument
    });

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
    clearAttachedDocument();

    // 1. Upload images if any
    let uploadedAttachments: any[] = [];
    if (localImages.length > 0) {
      setStreamingStatus('Đang tải ảnh lên...');
      try {
        // --- T008: Optimistic Attachment Display ---
        // Attachments already displayed optimistically in userMessage (line 86-87)
        // Just upload in background and update with real URLs
        const uploadPromises = localImages.map((img, idx) =>
          uploadChatImage(img.file, activeId || 'temp')
            .then(path => ({
              storage_path: path,
              file_name: img.file.name,
              file_size: img.file.size,
              mime_type: img.file.type,
              // Keep the optimistic blob URL for display
              optimistic_url: img.url
            }))
            .catch(err => {
              console.error(`Failed to upload image ${idx}:`, err);
              // Return optimistic URL as fallback
              return {
                storage_path: img.url,
                file_name: img.file.name,
                file_size: img.file.size,
                mime_type: img.file.type,
                optimistic_url: img.url,
                upload_failed: true
              };
            })
        );
        uploadedAttachments = await Promise.all(uploadPromises);

        // Update user message with real paths (or fallback to optimistic URLs)
        userMessage.attachments = uploadedAttachments.map(att => ({
          ...att,
          // Use real path if upload succeeded, otherwise keep optimistic URL
          storage_path: att.upload_failed ? att.optimistic_url : att.storage_path
        }));

        // Update message in store with final URLs
        if (uploadedAttachments.some(att => att.upload_failed)) {
          setError('Một số ảnh không tải lên được. Hiển thị bản cục bộ.');
        }
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
      console.log('[Document Upload] Starting document upload process', { documentCount: localDocument.length });
      try {
        // Validate file sizes before upload (Cloudinary limit: 10MB)
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        for (const doc of localDocument) {
          if (doc.file && doc.file.size > MAX_FILE_SIZE) {
            setError(`File "${doc.file.name}" quá lớn (${(doc.file.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn file dưới 10MB.`);
            setStreaming({ isStreaming: false });
            return;
          }
        }

        // --- T006: Parallel Document Upload + File Reading ---
        // Upload and read file content in parallel to save ~500ms
        const uploadPromises = localDocument.map(async (doc: { file?: File; storage_path?: string; document_context?: string }) => {
          if (doc.file && !doc.storage_path) {
            // Upload to cloudinary
            let cloudinaryUrl: string;
            try {
              cloudinaryUrl = await uploadToCloudinary(doc.file, 'chat_documents', 'auto');
            } catch (uploadErr) {
              console.error('[Document Upload] Failed to upload file:', uploadErr);
              throw new Error(`Không thể tải file "${doc.file.name}" lên. Vui lòng thử lại.`);
            }

            // Parse file content based on type
            let fileContent: string | null = null;
            const extension = doc.file.name.split('.').pop()?.toLowerCase();

            console.log('[Document Parse] Starting parse', { fileName: doc.file.name, extension, fileType: doc.file.type });

            if (extension === 'txt' || extension === 'md' || extension === 'csv' || extension === 'json' || extension === 'xml' || extension === 'html' || doc.file.type.startsWith('text/')) {
              // Text files: use FileReader
              fileContent = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsText(doc.file!);
              });
              console.log('[Document Parse] Text file parsed:', { fileName: doc.file.name, contentLength: fileContent?.length });
            } else if (extension === 'pdf' || extension === 'docx') {
              // PDF/DOCX: use worker to parse
              try {
                console.log('[Worker] Calling initWorker');
                const api = initWorker();
                console.log('[Worker] Got worker API, starting parse');
                const arrayBuffer = await doc.file.arrayBuffer();
                console.log('[Worker] ArrayBuffer created, size:', arrayBuffer.byteLength);
                if (extension === 'pdf') {
                  fileContent = await api.parsePDF(arrayBuffer);
                } else if (extension === 'docx') {
                  fileContent = await api.parseDocx(arrayBuffer);
                }
                console.log('[Document Parse] Worker parsed:', { fileName: doc.file.name, extension, contentLength: fileContent?.length });
              } catch (err) {
                console.error('[Worker] Failed to parse document locally:', err);
                // Fallback: try server-side parsing via parse-document function
                try {
                  const formData = new FormData();
                  formData.append('file', doc.file);
                  const response = await fetch('/functions/v1/parse-document', {
                    method: 'POST',
                    body: formData
                  });
                  const data = await response.json();
                  fileContent = data.text_content || null;
                  console.log('[Document Parse] Server fallback parsed:', { fileName: doc.file.name, contentLength: fileContent?.length });
                } catch (serverErr) {
                  console.error('Failed to parse document on server:', serverErr);
                  throw new Error(`Không thể đọc file "${doc.file.name}". Vui lòng thử lại hoặc chọn file khác.`);
                }
              }
            } else if (extension === 'doc') {
              // .doc (old Word format): use server-side parsing only
              console.log('[Document Parse] .doc file detected, using server-side parsing');
              try {
                const formData = new FormData();
                formData.append('file', doc.file);
                const response = await fetch('/functions/v1/parse-document', {
                  method: 'POST',
                  body: formData
                });
                console.log('[Document Parse] Server response status:', response.status, response.statusText);
                if (!response.ok) {
                  const errorText = await response.text();
                  console.error('[Document Parse] Server error response:', errorText);
                  throw new Error(`Server returned ${response.status}: ${errorText}`);
                }
                const data = await response.json();
                fileContent = data.text_content || null;
                console.log('[Document Parse] Server parsed .doc file:', { fileName: doc.file.name, contentLength: fileContent?.length });
              } catch (serverErr) {
                console.error('Failed to parse .doc file on server:', serverErr);
                throw new Error(`Không thể đọc file "${doc.file.name}". Vui lòng convert sang .docx hoặc chọn file khác.`);
              }
            } else {
              console.log('[Document Parse] Unsupported file type', { fileName: doc.file.name, extension, fileType: doc.file.type });
            }

            console.log('[Document Parse] Final result', { fileName: doc.file.name, fileContentLength: fileContent?.length, fileContent: fileContent ? fileContent.substring(0, 100) : null });

            return {
              ...doc,
              storage_path: cloudinaryUrl,
              document_context: fileContent,
            };
          }
          return doc;
        });

        const uploadedDocs = await Promise.all(uploadPromises);
        console.log('[Document Upload] Upload complete', { uploadedDocsCount: uploadedDocs.length });
        // Update user message with uploaded documents
        userMessage.document_context = uploadedDocs;
        console.log('[Document Upload] Updated userMessage.document_context', {
          docsCount: userMessage.document_context?.length,
          firstDocHasContent: !!userMessage.document_context?.[0]?.document_context,
          firstDocContentLength: userMessage.document_context?.[0]?.document_context?.length
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Không thể tải tài liệu lên. Vui lòng thử lại.';
        setError(errorMessage);
        setStreaming({ isStreaming: false });
        return;
      }
    }

    // Show initial status
    setStreamingStatus('Đang phân tích câu hỏi...');

    // --- T003: Background Save User Message ---
    // Save in background, don't block streaming to save ~100ms
    if (activeId) {
      messageApi.saveUserMessage(
        activeId,
        content,
        userMessage.document_context, // Use updated document_context with uploaded files
        uploadedAttachments
      ).catch(err => {
        console.error('Failed to save user message:', err);
        // Show error but continue with streaming - message is already displayed optimistically
        setError('Không thể lưu tin nhắn. Vui lòng kiểm tra kết nối.');
        // Don't block streaming even if save fails
      });
    }

    try {
      let assistantContent = '';
      let suggestions: string[] = [];
      let finalPayload: any = null;

      await streamingChatApi.stream(
        content,
        [...history, userMessage],
        activeId || undefined,
        userMessage.document_context, // Use updated document_context with uploaded files
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
          // Ensure we add the error as a message so user sees it
          if (assistantContent.length === 0) {
            assistantContent = err || 'Có lỗi xảy ra. Vui lòng thử lại.';
          }
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

      // Prefer live-streamed evidence; fall back to done-payload citations
      const resolvedEvidence =
        useChatStore.getState().streaming.evidence?.length > 0
          ? useChatStore.getState().streaming.evidence
          : finalPayload?.citations || [];

      resetStreaming();

      // Fallback: If content is empty after streaming, provide a generic message
      if (!assistantContent || assistantContent.trim().length === 0) {
        assistantContent = 'Xin lỗi, tôi không thể tạo câu trả lời lúc này. Vui lòng thử lại hoặc cung cấp thêm thông tin chi tiết.';
      }

      // --- FIX: Add message immediately with local ID for instant UI update ---
      const assistantMessage: Message = {
        id: localMessageId, // Use local ID first, will update after save
        role: 'assistant',
        content: assistantContent,
        follow_up_suggestions: suggestions,
        citations: resolvedEvidence,
        token_count: finalPayload?.output_tokens,
      };
      addMessage(assistantMessage);

      // --- T007: Optimistic Assistant Message Save ---
      // Save in background, don't block UI to save ~100ms perceived latency
      if (activeId) {
        messageApi.saveAssistantMessage(
          activeId,
          assistantContent,
          finalPayload?.citations,
          suggestions
        ).then(saved => {
          savedMessageId = saved?.data?.id;
          // Update message ID in store after save completes
          updateMessageSuggestions(localMessageId, suggestions);
        }).catch(err => {
          console.warn('Failed to save assistant message:', err);
          // Show error indicator but don't remove message
          setError('Không thể lưu tin nhắn trợ lý. Vui lòng kiểm tra kết nối.');
        });
      }

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
          .generate(content, assistantContent, activeId, targetMessageId, userMessage.document_context)
          .then((res) => {
            if (res?.suggestions?.length > 0) {
              setCurrentSuggestions(res.suggestions);
              updateMessageSuggestions(targetMessageId, res.suggestions);
            }
          })
          .catch((err) => console.warn('[Suggestions] Background generation failed:', err));
      }

      // --- BACKGROUND: Multi-layer conversation summaries ---
      // --- T011: Debounced Summary Generation ---
      // Trigger all 3 summary levels in parallel after 5s delay
      if (activeId) {
        const conv = useConversationStore.getState().selectedConversation;

        // Clear previous debounce timer
        if (summaryDebounceRef.current) {
          clearTimeout(summaryDebounceRef.current);
        }

        // Set new debounce timer
        summaryDebounceRef.current = setTimeout(() => {
          // Generate all levels in parallel
          const summaryPromises = [
            !conv?.summary_level_1
              ? summarizationApi.summarize(activeId, 1).then(res => {
                  if (res?.success && res.summary) {
                    useConversationStore.getState().updateConversation(activeId, { summary_level_1: res.summary });
                  }
                }).catch(err => console.warn('[Summary] Level-1 failed:', err))
              : Promise.resolve(),

            !conv?.summary_level_2
              ? summarizationApi.summarize(activeId, 2).then(res => {
                  if (res?.success && res.summary) {
                    useConversationStore.getState().updateConversation(activeId, { summary_level_2: res.summary });
                  }
                }).catch(err => console.warn('[Summary] Level-2 failed:', err))
              : Promise.resolve(),

            !conv?.summary_level_3
              ? summarizationApi.summarize(activeId, 3).then(res => {
                  if (res?.success && res.summary) {
                    useConversationStore.getState().updateConversation(activeId, { summary_level_3: res.summary });
                  }
                }).catch(err => console.warn('[Summary] Level-3 failed:', err))
              : Promise.resolve()
          ];

          Promise.all(summaryPromises).catch(err => console.warn('[Summary] Parallel generation failed:', err));
        }, 5000);
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

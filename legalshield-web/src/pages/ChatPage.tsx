import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Menu } from 'lucide-react';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { ConversationSidebar } from '../components/chat/ConversationSidebar';
import { ConversationSummary } from '../components/chat/ConversationSummary';
import { useConversation } from '../hooks/useConversation';
import { useStreamingChat } from '../hooks/useStreamingChat';
import { useChatStore } from '../store/chatStore';
import { summarizationApi } from '../lib/conversation-api';

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  const {
    conversations,
    isLoading: isLoadingConversations,
    selectedConversation,
    createConversation,
    deleteConversation,
    selectConversation,
    searchQuery,
    setSearchQuery,
  } = useConversation();

  const {
    messages,
    currentConversationId,
    attachedDocument,
    setAttachedDocument,
    attachedImages,
    addAttachedImages,
    removeAttachedImage,
    streaming,
  } = useChatStore();

  const isChatStreaming = streaming.isStreaming;

  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedConversation = useRef(false);
  const previousConversationIdRef = useRef<string | null>(null);

  const {
    sendMessage: sendStreamingMessage,
  } = useStreamingChat({
    conversationId: currentConversationId || undefined,
  });

  // Load conversation from URL param
  useEffect(() => {
    if (!conversationId) {
      if (conversations.length > 0 && !isLoadingConversations) {
        navigate(`/chat/${conversations[0].id}`, { replace: true });
      } else if (selectedConversation) {
        selectConversation(null);
      }
      hasLoadedConversation.current = false;
      previousConversationIdRef.current = null;
      return;
    }

    // Detect actual conversationId change
    const conversationIdChanged = previousConversationIdRef.current !== conversationId;
    if (conversationIdChanged) {
      hasLoadedConversation.current = false;
      previousConversationIdRef.current = conversationId;
    }

    // Only load if not already loaded this conversation
    if (hasLoadedConversation.current) {
      return;
    }

    if (!isLoadingConversations && conversations.length > 0) {
      const conv = conversations.find((c) => c.id === conversationId);
      if (conv) {
        selectConversation(conv);
        hasLoadedConversation.current = true;
      } else {
        navigate('/chat', { replace: true });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, selectConversation, isLoadingConversations, navigate]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      let activeConversationId = currentConversationId;
      if (!activeConversationId) {
        const newConv = await createConversation();
        if (newConv) {
          activeConversationId = newConv.id;
          navigate(`/chat/${newConv.id}`, { replace: true });
        }
      }

      if (activeConversationId) {
        await sendStreamingMessage(
          content,
          messages.filter((m) => m.role !== 'system'),
          activeConversationId
        );
      }
    },
    [
      currentConversationId,
      messages,
      createConversation,
      sendStreamingMessage,
      navigate,
    ]
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileData: any = {
        name: file.name,
        size: file.size,
        type: file.type,
      };
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedDocument({
          ...fileData,
          document_context: event.target?.result as string,
        });
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [setAttachedDocument]);

  const handleImagesAttach = useCallback((files: FileList | null) => {
    if (!files) return;

    const newImages = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      file
    }));

    addAttachedImages(newImages);
  }, [addAttachedImages]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSendMessage(suggestion);
    },
    [handleSendMessage]
  );

  const handleRegenerateSummary = useCallback(async () => {
    if (!currentConversationId) return;
    setIsRegeneratingSummary(true);

    try {
      // Trigger summarization - the API responses will update the conversation store directly
      await summarizationApi.summarize(currentConversationId, 1);
      setTimeout(() => summarizationApi.summarize(currentConversationId!, 2), 2000);

      // Wait for all summarization levels to complete before stopping loading state
      setTimeout(() => {
        setIsRegeneratingSummary(false);
      }, 5000);
    } catch (err) {
      console.error('Manual summarization failed:', err);
      setIsRegeneratingSummary(false);
    }
  }, [currentConversationId]);

  return (
    <div className="flex h-full bg-background transition-colors duration-500 overflow-hidden relative">
      <ConversationSidebar
        isMobileOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        conversations={conversations}
        selectedConversation={selectedConversation}
        isLoading={isLoadingConversations}
        onCreateConversation={createConversation}
        onDeleteConversation={deleteConversation}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
        {/* Mobile History Toggle */}
        <div className="lg:hidden shrink-0 flex items-center justify-end px-4 py-2">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-lex-deep bg-surface-bright border border-lex-border rounded-full shadow-sm hover:bg-surface-container transition-colors"
          >
            <Menu size={12} />
            Lịch sử tra cứu
          </button>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="max-w-[800px] mx-auto h-full">
            <MessageList onSuggestionClick={handleSuggestionClick} />
          </div>

          {!isChatStreaming && messages.length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-6 right-6 md:right-10 z-20"
            >
              <button
                onClick={() => setIsSummaryOpen(true)}
                className="group flex items-center gap-3 px-6 py-2.5 bg-lex-deep text-white rounded-full hover:bg-lex-midnight transition-all shadow-xl hover:shadow-lex-deep/20 border border-lex-midnight"
              >
                <LayoutDashboard size={16} className="text-lex-gold" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] group-hover:text-lex-gold transition-colors">
                  Xem Insight
                </span>
              </button>
            </motion.div>
          )}
        </div>

        <div className="px-3 md:px-10 pb-3 md:pb-10">
          <div className="max-w-[800px] mx-auto w-full">
            <div className="bg-white/95 backdrop-blur-xl p-3 md:p-6 rounded-2xl md:rounded-[2.5rem] border border-lex-border shadow-2xl shadow-lex-deep/5 transition-all hover:shadow-lex-deep/10">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".txt,.md"
              />
              <ChatInput
                onSend={handleSendMessage}
                attachedDocument={attachedDocument}
                onAttachDocument={() => fileInputRef.current?.click()}
                onDetachDocument={() => setAttachedDocument(null)}
                attachedImages={attachedImages}
                onAttachImages={handleImagesAttach}
                onRemoveImage={removeAttachedImage}
                isStreaming={isChatStreaming}
                disabled={isChatStreaming}
              />
            </div>
          </div>
        </div>
      </div>

      <ConversationSummary
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        conversationId={currentConversationId || undefined}
        onRegenerate={handleRegenerateSummary}
        isRegenerating={isRegeneratingSummary}
        summary={{
          level_1: selectedConversation?.summary_level_1 || undefined,
          level_2: selectedConversation?.summary_level_2 || undefined,
          level_3: selectedConversation?.summary_level_3 || undefined,
        }}
      />
    </div>
  );
}

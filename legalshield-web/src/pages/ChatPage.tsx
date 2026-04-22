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
import { useConversationStore } from '../store/conversationStore';
import { summarizationApi, conversationApi } from '../lib/conversation-api';

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  const {
    conversations,
    isLoading: isLoadingConversations,
    selectedConversation,
    createConversation,
    selectConversation,
  } = useConversation();

  const {
    messages,
    currentConversationId,
    attachedDocument,
    setAttachedDocument,
    streaming,
  } = useChatStore();

  const isChatStreaming = streaming.isStreaming;

  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      return;
    }

    // Trigger loading if ID mismatch OR if ID matches but messages are empty (likely a page reload)
    const needsSelection = selectedConversation?.id !== conversationId ||
      (selectedConversation?.id === conversationId && messages.length === 0);

    if (needsSelection && !isLoadingConversations && conversations.length > 0) {
      const conv = conversations.find((c) => c.id === conversationId);
      if (conv) {
        selectConversation(conv);
      } else {
        navigate('/chat', { replace: true });
      }
    }
  }, [conversationId, conversations, selectedConversation?.id, messages.length, selectConversation, isLoadingConversations, navigate]);

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
          messages.filter((m) => m.role !== 'system')
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
      await summarizationApi.summarize(currentConversationId, 1);
      setTimeout(() => summarizationApi.summarize(currentConversationId!, 2), 2000);

      setTimeout(async () => {
        const response = await conversationApi.list();
        if (response.success) {
          const updated = response.conversations.find((c: any) => c.id === currentConversationId);
          if (updated) {
            useConversationStore.getState().updateConversation(currentConversationId!, updated);
          }
        }
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
      />

      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
        {/* Mobile Header Toggle */}
        <div className="lg:hidden flex items-center h-14 px-4 border-b border-lex-border bg-white/80 backdrop-blur-md z-50">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 -ml-1 text-lex-lawyer hover:text-lex-deep transition-colors"
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <div className="ml-3 flex flex-col">
            <span className="text-xs font-serif italic text-lex-deep font-bold leading-tight">LegalShield</span>
            <span className="text-[7px] uppercase tracking-[0.3em] text-lex-lawyer font-black opacity-30 leading-tight text-nowrap">AI Archive</span>
          </div>
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



        <div className="px-4 md:px-10 pb-4 md:pb-10">
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

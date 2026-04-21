import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ConversationSidebar } from '../components/chat/ConversationSidebar';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { FollowUpSuggestions } from '../components/chat/FollowUpSuggestions';
import { useConversation } from '../hooks/useConversation';
import { useStreamingChat } from '../hooks/useStreamingChat';
import { useChatStore } from '../store/chatStore';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    conversations,
    isLoading: isLoadingConversations,
    selectedConversation,
    filter,
    searchQuery,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    starConversation,
    setFilter,
    setSearchQuery,
  } = useConversation();

  const {
    messages,
    currentConversationId,
    clearMessages,
    attachedDocument,
    setAttachedDocument,
    currentSuggestions,
    setCurrentSuggestions,
  } = useChatStore();

  const {
    isStreaming,
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

    if (selectedConversation?.id !== conversationId) {
      const conv = conversations.find((c) => c.id === conversationId);
      if (conv) {
        selectConversation(conv);
      }
    }
  }, [conversationId, conversations, selectedConversation?.id, selectConversation]);

  // Handle sending message
  const handleSendMessage = useCallback(
    async (content: string) => {
      // Create new conversation if none selected
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

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSendMessage(suggestion);
      setCurrentSuggestions([]);
    },
    [handleSendMessage, setCurrentSuggestions]
  );

  // Handle creating new conversation
  const handleCreateConversation = useCallback(async () => {
    const newConv = await createConversation();
    if (newConv) {
      clearMessages();
      navigate(`/chat/${newConv.id}`);
    }
  }, [createConversation, clearMessages, navigate]);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{
          width: sidebarOpen ? 320 : 0,
          opacity: sidebarOpen ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className={cn(
          'border-r bg-card overflow-hidden',
          !sidebarOpen && 'hidden'
        )}
      >
        <ConversationSidebar
          conversations={conversations}
          selectedConversation={selectedConversation}
          filter={filter}
          searchQuery={searchQuery}
          isLoading={isLoadingConversations}
          onSelectConversation={(conv) => {
            if (conv.id !== selectedConversation?.id) {
              navigate(`/chat/${conv.id}`);
            }
          }}
          onCreateConversation={handleCreateConversation}
          onDeleteConversation={deleteConversation}
          onStarConversation={starConversation}
          onRenameConversation={renameConversation}
          onSetFilter={setFilter}
          onSetSearchQuery={setSearchQuery}
        />
      </motion.div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </Button>
            <div>
              <h1 className="font-semibold">
                {selectedConversation?.title || 'Trợ lý pháp lý AI'}
              </h1>
              {selectedConversation && (
                <p className="text-xs text-muted-foreground">
                  {selectedConversation.message_count} tin nhắn
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <MessageList onSuggestionClick={handleSuggestionClick} />
        </div>

        {/* Follow-up suggestions (inline) */}
        {currentSuggestions.length > 0 && !isStreaming && (
          <div className="px-4 py-2 border-t bg-accent/30">
            <FollowUpSuggestions
              suggestions={currentSuggestions}
              onSelect={handleSuggestionClick}
            />
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t">
          <ChatInput
            onSend={handleSendMessage}
            attachedDocument={attachedDocument}
            onAttachDocument={() => {
              /* TODO: Document picker */
            }}
            onDetachDocument={() => setAttachedDocument(null)}
            isStreaming={isStreaming}
            disabled={isStreaming}
          />
        </div>
      </div>
    </div>
  );
}

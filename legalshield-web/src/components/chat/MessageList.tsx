import { useRef, useEffect, memo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageItem } from './MessageItem';
import { StreamingMessage, TypingIndicator } from './StreamingMessage';
import { useChatStore } from '../../store/chatStore';
import { clsx, type ClassValue } from 'clsx';
import { ArrowDown } from 'lucide-react';
import { Button } from '../ui/Button';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const MemoizedMessageItem = memo(MessageItem);

interface MessageListProps {
  onSuggestionClick?: (suggestion: string) => void;
  className?: string;
}

export function MessageList({
  onSuggestionClick,
  className,
}: MessageListProps) {
  const { messages, streaming, currentConversationId, isLoadingMessages } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isAutoScrolling = useRef(true);

  // Handle manual scroll to detect if user wants to stop auto-scrolling
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Check if user is at the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    isAutoScrolling.current = isAtBottom;

    // Show scroll button if user scrolls up significantly
    setShowScrollButton(!isAtBottom && scrollTop < scrollHeight - clientHeight - 200);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      isAutoScrolling.current = true;
      setShowScrollButton(false);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isAutoScrolling.current) {
      scrollToBottom(false);
    }
  }, [messages, streaming.streamedContent, streaming.isStreaming, scrollToBottom]);

  // Initial scroll or conversation swap
  useEffect(() => {
    isAutoScrolling.current = true;
    scrollToBottom(false);
  }, [currentConversationId, scrollToBottom]);

  const hasMessages = messages.length > 0;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn(
        'flex-1 h-full overflow-y-auto space-y-0 scroll-smooth custom-scrollbar',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentConversationId || 'empty'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col min-h-full"
        >
          {isLoadingMessages && messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground animate-pulse">Đang tải...</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message: any) => (
                <motion.div
                  key={`msg-${message.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <MemoizedMessageItem
                    message={message}
                    onSuggestionClick={onSuggestionClick}
                    isLast={message.id === messages[messages.length - 1]?.id && !streaming.isStreaming}
                  />
                </motion.div>
              ))}

              {/* Streaming message */}
              {streaming.isStreaming && (
                <motion.div
                  key="streaming-msg"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <StreamingMessage
                    content={streaming.streamedContent}
                    isStreaming={streaming.isStreaming}
                    error={streaming.error}
                  />
                </motion.div>
              )}

              {/* Typing indicator when waiting for first chunk */}
              {streaming.isStreaming && !streaming.streamedContent && !streaming.error && (
                <div key="typing-indicator" className="p-4">
                  <TypingIndicator />
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Floating Scroll Button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
          >
            <Button
              size="sm"
              variant="outline"
              onClick={() => scrollToBottom(true)}
              className="rounded-full shadow-lg gap-2 bg-white/90 backdrop-blur-sm border border-slate-200"
            >
              <ArrowDown size={14} />
              <span>Xem tin nhắn mới</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {!hasMessages && !streaming.isStreaming && !isLoadingMessages && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-full p-8 text-center"
        >
          <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">Bắt đầu cuộc trò chuyện</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Hỏi bất kỳ câu hỏi nào về pháp luật. Trợ lý AI của LegalEdge sẽ giúp bạn giải đáp.
          </p>
        </motion.div>
      )}
    </div>
  );
}

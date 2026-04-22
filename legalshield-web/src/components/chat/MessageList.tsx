import { useRef, useEffect, memo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageItem } from './MessageItem';
import { StreamingMessage } from './StreamingMessage';
import { useChatStore } from '../../store/chatStore';
import { clsx, type ClassValue } from 'clsx';
import { ArrowDown, Scale } from 'lucide-react';
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
        'flex-1 h-full overflow-y-auto space-y-0 scroll-smooth custom-scrollbar bg-transparent relative',
        className
      )}
    >
      <div className="flex flex-col min-h-full max-w-6xl mx-auto w-full px-6 md:px-10 py-8">
        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex-1 space-y-12 py-12">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn(
                "flex flex-col gap-4 max-w-[80%]",
                i % 2 === 0 ? "ml-auto items-end" : "items-start"
              )}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-lex-lawyer/5 animate-pulse" />
                  <div className="w-24 h-3 bg-lex-lawyer/10 rounded-full animate-pulse" />
                </div>
                <div className={cn(
                  "h-24 w-full rounded-2xl animate-pulse",
                  i % 2 === 0 ? "bg-lex-deep/5" : "bg-surface-bright border border-lex-border"
                )} />
              </div>
            ))}
            <div className="flex flex-col items-center gap-4 pt-12">
              <p className="text-[10px] uppercase tracking-widest font-bold text-lex-gold/40 animate-pulse">Initializing Archive Retrieval...</p>
            </div>
          </div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              {messages.map((message: any, i: number) => (
                <motion.div
                  key={`msg-${message.id}`}
                  initial={{ opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
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
            </AnimatePresence>

          </>
        )}
      </div>

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
          <div className="w-16 h-16 mb-4 rounded-full bg-lex-deep/5 flex items-center justify-center">
            <Scale className="w-8 h-8 text-lex-deep" />
          </div>
          <h3 className="text-xl font-serif italic text-lex-deep mb-2">Bắt đầu tra cứu</h3>
          <p className="text-sm text-lex-lawyer/60 max-w-md">
            Hỏi bất kỳ câu hỏi nào về pháp luật. LegalShield AI sẽ cung cấp phân tích chuyên sâu cho bạn.
          </p>
        </motion.div>
      )}
    </div>
  );
}

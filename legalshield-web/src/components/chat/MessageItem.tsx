import { memo } from 'react';
import { motion } from 'framer-motion';
import { Scale } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { FollowUpSuggestionsCompact } from './FollowUpSuggestions';
import type { Message } from '../../store/chatStore';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface MessageItemProps {
  message: Message;
  onSuggestionClick?: (suggestion: string) => void;
  isLast?: boolean;
  className?: string;
}

export const MessageItem = memo(({
  message,
  onSuggestionClick,
  isLast,
  className,
}: MessageItemProps) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col mb-10 w-full',
        isUser ? 'items-end' : 'items-start',
        className
      )}
    >
      <div className={cn(
        'max-w-[90%] p-6 rounded-lg shadow-sm font-sans leading-relaxed',
        isUser
          ? 'bg-[#f6f3f2] border border-[#e4e2e1]/50 text-[#1b1c1c] max-w-[80%]'
          : 'bg-white shadow-[0_12px_40px_-12px_rgba(4,22,39,0.08)] border-l-4 border-[#e9c176] text-[#1b1c1c]'
      )}>
        {/* Assistant Header */}
        {isAssistant && (
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#e4e2e1]/40">
            <div className="h-9 w-9 bg-[#041627] flex items-center justify-center text-[#ffdea5] rounded-sm shadow-inner">
              <Scale size={18} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-[#041627] font-serif tracking-tight leading-none">Phân tích Pháp lý</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold font-sans">Verified Insight</span>
              </div>
            </div>
          </div>
        )}

        {/* User Content */}
        {isUser && (
          <div className="text-[#1b1c1c] font-medium leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        )}

        {/* Assistant Markdown Content */}
        {isAssistant && (
          <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed prose-p:mb-4 prose-headings:font-serif prose-headings:text-[#041627] prose-strong:text-[#041627] prose-strong:font-bold prose-ul:my-4 prose-li:my-1 text-[#1b1c1c]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-4 p-4 bg-[#fbf9f8] border border-[#e4e2e1] rounded space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Trích dẫn tham khảo:</p>
            <ul className="space-y-2">
              {message.citations.map((citation: any, index: number) => (
                <li key={index} className="text-xs text-slate-600 flex gap-2">
                  <span className="text-[#e9c176] font-bold">[{index + 1}]</span>
                  <span>{citation.title || citation.source || 'Nguồn pháp lý'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metadata */}
        <div className={cn(
          "mt-4 flex gap-2 text-[10px] text-slate-400 uppercase tracking-widest font-semibold",
          isUser ? "justify-end" : "justify-start"
        )}>
          <span>
            {new Date(message.created_at || Date.now()).toLocaleTimeString('vi-VN', {
              hour: '2-digit', minute: '2-digit'
            })}
          </span>
          {isUser && (
            <>
              <span>•</span>
              <span>Luật sư của bạn</span>
            </>
          )}
        </div>
      </div>

      {/* Follow-up suggestions */}
      {isAssistant && isLast && message.follow_up_suggestions && (
        <div className="mt-4 ml-4">
          <FollowUpSuggestionsCompact
            suggestions={message.follow_up_suggestions}
            onSelect={onSuggestionClick || (() => { })}
          />
        </div>
      )}
    </motion.div>
  );
});

import { memo, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scale, ShieldCheck, ShieldAlert, Copy, Search, Check, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { FollowUpSuggestionsCompact } from './FollowUpSuggestions';
import { CitationPanel } from './CitationPanel';
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
  const [copied, setCopied] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<any>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // Handle inline citation click
  const handleCitationTrigger = useCallback((index: number) => {
    if (message.citations && message.citations[index - 1]) {
      setSelectedCitation(message.citations[index - 1]);
    }
  }, [message.citations]);

  const markdownComponents = useMemo(() => ({
    // Custom link renderer for citations [1], [2]...
    a: ({ href, children }: any) => {
      const text = children?.[0]?.toString() || '';
      const match = text.match(/^(\d+)$/);
      if (match) {
        const index = parseInt(match[1]);
        return (
          <button
            onClick={() => handleCitationTrigger(index)}
            className="inline-flex items-center justify-center w-5 h-5 -translate-y-1 bg-lex-gold/10 text-lex-gold border border-lex-gold/20 rounded-md text-[10px] font-bold mx-0.5 hover:bg-lex-gold hover:text-white transition-all shadow-sm"
            title={`Xem trích dẫn ${index}`}
          >
            {index}
          </button>
        );
      }
      return <a href={href} className="text-lex-gold hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    // Also handle text like [1] if it's not a link but just text
    // (Optional: can be done via regex pre-processing or more complex renderers)
  }), [handleCitationTrigger]);

  const processedContent = useMemo(() => {
    if (isUser) return message.content;
    // Turn [1] or [#1] into [1](#citation-1) style for ReactMarkdown detection
    return message.content.replace(/\[(?:#)?(\d+)\]/g, '[$1](#citation-$1)');
  }, [message.content, isUser]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
      className={cn(
        'flex flex-col mb-12 w-full group/msg',
        isUser ? 'items-end' : 'items-start',
        className
      )}
    >
      <div className={cn(
        'max-w-[95%] lg:max-w-[85%] p-5 md:p-8 lg:p-12 font-sans leading-relaxed transition-all duration-500 rounded-2xl md:rounded-[2.5rem] border relative',
        isUser
          ? 'bg-lex-deep text-lex-ivory font-medium border-lex-midnight shadow-2xl shadow-lex-deep/10'
          : 'bg-white border-lex-border text-lex-deep shadow-2xl shadow-lex-deep/[0.02] hover:shadow-lex-deep/[0.05] hover:border-lex-gold/20'
      )}>
        {/* Quick Action Overlay (Assistant only) */}
        {!isUser && (
          <div className="absolute right-6 top-6 opacity-0 group-hover/msg:opacity-100 transition-all duration-300 flex gap-2 translate-y-[-10px] group-hover/msg:translate-y-0">
            <button
              onClick={handleCopy}
              className="p-3 bg-surface-container-low hover:bg-lex-gold/10 text-lex-lawyer/40 hover:text-lex-gold rounded-xl border border-transparent hover:border-lex-gold/20 transition-all shadow-sm"
              title="Sao chép phản hồi"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
            <button
              className="p-3 bg-surface-container-low hover:bg-lex-gold/10 text-lex-lawyer/40 hover:text-lex-gold rounded-xl border border-transparent hover:border-lex-gold/20 transition-all shadow-sm"
              title="Phân tích chuyên sâu"
            >
              <Search size={18} />
            </button>
          </div>
        )}

        {/* Assistant Branding Section */}
        {isAssistant && (
          <div className="flex items-center gap-4 mb-10 pb-8 border-b border-lex-border/60">
            <div className="w-12 h-12 bg-lex-deep rounded-2xl flex items-center justify-center shadow-2xl shadow-lex-deep/20 border border-lex-midnight transform -rotate-3 hover:rotate-0 transition-transform">
              <Scale size={24} className="text-lex-gold" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lex-deep leading-none text-xl tracking-tight">Hệ thống Cố vấn AI</h3>
              <div className="flex items-center gap-3 mt-2.5">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.8)]"></div>
                <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-green-600 opacity-80">
                  ONLINE
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Content Section */}
        <div className={cn(
          "selection:bg-lex-gold/20",
          isUser ? "text-xl md:text-2xl font-serif italic tracking-tight" : "prose prose-lex max-w-none text-lex-deep/90"
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap leading-tight">{message.content}</p>
          ) : (
            <div className="prose prose-lex max-w-none text-lex-deep/90 prose-p:leading-[1.8] prose-p:mb-6 prose-headings:font-serif prose-headings:text-lex-deep prose-headings:mt-8 prose-headings:mb-4 prose-strong:text-lex-deep prose-strong:font-bold prose-li:marker:text-lex-gold prose-blockquote:border-l-lex-gold prose-blockquote:bg-lex-gold/5 prose-blockquote:p-6 prose-blockquote:rounded-r-2xl">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Citations Section */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-12 pt-10 border-t border-lex-border space-y-6">
            <p className="text-[10px] font-sans uppercase tracking-[0.4em] font-bold text-lex-gold flex items-center gap-3">
              <span className="w-8 h-[1px] bg-lex-gold/30" />
              Cơ sở pháp lý tham chiếu
            </p>
            <div className="grid gap-5">
              {message.citations.map((citation: any, index: number) => {
                const isVerified = citation.verification_status === 'verified' || citation.source_domain === 'legalshield.local';
                return (
                  <div
                    key={index}
                    id={`citation-row-${index + 1}`}
                    className="flex flex-col md:flex-row gap-6 p-6 bg-surface-container-lowest/50 rounded-[1.5rem] border border-lex-border hover:border-lex-gold/30 hover:bg-white transition-all duration-500 group/citation cursor-pointer"
                    onClick={() => setSelectedCitation(citation)}
                  >
                    <div className="flex gap-4 items-start">
                      <span className="text-lex-gold font-serif font-bold text-3xl leading-none flex-shrink-0 opacity-40 group-hover/citation:opacity-100 transition-opacity">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-lg font-serif font-bold text-lex-deep leading-snug group-hover/citation:text-lex-gold transition-colors">
                            {citation.title || citation.source || 'Nguồn trích lục pháp lý'}
                          </p>
                        </div>
                        {/* Tags */}
                        <div className="flex items-center gap-3 mb-4">
                          {isVerified ? (
                            <span className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                              <ShieldCheck size={10} />
                              Xác thực
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                              <ShieldAlert size={10} />
                              Tham khảo
                            </span>
                          )}
                          {citation.source_domain && (
                            <span className="text-[9px] font-mono text-lex-lawyer/40 uppercase tracking-tighter">{citation.source_domain}</span>
                          )}
                        </div>
                        {/* Content snippet */}
                        {citation.content && (
                          <p className="text-[13px] font-sans text-lex-lawyer/70 leading-relaxed font-medium line-clamp-2 italic">
                            "{citation.content.slice(0, 200)}..."
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex md:flex-col justify-end items-center gap-2 mt-2 md:mt-0 opacity-40 group-hover/citation:opacity-100 transition-all border-t md:border-t-0 md:border-l border-lex-border pt-4 md:pt-0 md:pl-6">
                      <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-lex-lawyer hover:text-lex-gold transition-colors">
                        Trích lục
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className={cn(
          "mt-10 flex items-center gap-6 text-[10px] font-bold uppercase tracking-[0.4em]",
          isUser ? "justify-end text-lex-ivory/30" : "justify-start text-lex-lawyer/20"
        )}>
          <span>
            {new Date(message.created_at || Date.now()).toLocaleTimeString('vi-VN', {
              hour: '2-digit', minute: '2-digit'
            })}
          </span>
          <span className="w-1.5 h-[1px] bg-current opacity-20" />
          <span>{isUser ? 'Verified Client' : 'Institutional Authority'}</span>
          {!isUser && (
            <>
              <span className="hidden md:inline w-1.5 h-[1px] bg-current opacity-20" />
              <span className="hidden md:inline">Node ID: LS-CORE-V3</span>
            </>
          )}
        </div>
      </div>

      {/* Follow-up suggestions */}
      {isAssistant && isLast && message.follow_up_suggestions && (
        <div className="mt-8 ml-10">
          <FollowUpSuggestionsCompact
            suggestions={message.follow_up_suggestions}
            onSelect={onSuggestionClick || (() => { })}
          />
        </div>
      )}

      {/* Citation Review Panel */}
      <AnimatePresence>
        {selectedCitation && (
          <CitationPanel
            isOpen={selectedCitation !== null}
            onClose={() => setSelectedCitation(null)}
            citation={selectedCitation}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

MessageItem.displayName = 'MessageItem';

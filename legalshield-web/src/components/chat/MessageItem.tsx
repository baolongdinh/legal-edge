import { memo, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scale, ShieldCheck, ShieldAlert, Copy, Search, Check, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { FollowUpSuggestions } from './FollowUpSuggestions';
import { CitationPanel } from './CitationPanel';
import { LegalDisclaimer } from './LegalDisclaimer';
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

  // Memoize image URL resolution to avoid re-computation on every render
  const imageAttachments = useMemo(() => {
    if (!message.imageUrls?.length && !message.attachments?.some((a: any) => a.storage_path)) {
      return null;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    // Prefer blob URLs for optimistic display; fallback to Supabase storage URLs
    const resolvedUrls: string[] = message.imageUrls?.length
      ? message.imageUrls
      : (message.attachments || []).reduce((acc: string[], a: any) => {
        const p = a.storage_path || a.file_path;
        if (!p) return acc;
        acc.push(p.startsWith('http') ? p : `${supabaseUrl}/storage/v1/object/public/user-contracts/${p}`);
        return acc;
      }, []);

    if (!resolvedUrls.length) return null;

    const MAX_VISIBLE = 4;
    const visible = resolvedUrls.slice(0, MAX_VISIBLE);
    const overflow = resolvedUrls.length - MAX_VISIBLE;
    const gridClass = visible.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

    return { visible, overflow, gridClass };
  }, [message.imageUrls, message.attachments]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
      className={cn(
        'flex flex-col mb-4 md:mb-8 w-full group/msg',
        isUser ? 'items-end' : 'items-start',
        className
      )}
    >
      <div className={cn(
        'p-3 md:p-6 transition-all duration-500 rounded-xl md:rounded-[2.5rem] border relative overflow-hidden',
        isUser
          ? 'max-w-[90%] md:max-w-[65%] bg-lex-deep text-lex-ivory font-medium border-lex-midnight shadow-2xl shadow-lex-deep/10'
          : 'max-w-full bg-white border-lex-border text-lex-deep shadow-2xl shadow-lex-deep/[0.02] hover:shadow-lex-deep/[0.05] hover:border-lex-gold/20'
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
          <div className="flex items-center gap-3 md:gap-4 mb-4 pb-4 md:mb-12 md:pb-10 border-b border-lex-border/60">
            <div className="w-9 h-9 md:w-14 md:h-14 bg-lex-deep rounded-lg md:rounded-2xl flex items-center justify-center shadow-2xl shadow-lex-deep/20 border border-lex-midnight transform rotate-3 hover:rotate-0 transition-transform">
              <Scale size={18} className="text-lex-gold md:hidden" />
              <Scale size={28} className="text-lex-gold hidden md:block" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lex-deep leading-tight text-base md:text-2xl tracking-tight">Trợ lý Tra cứu Pháp lý</h3>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1.5 md:mt-3">
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.8)]"></div>
                <span className="text-[8px] md:text-[10px] uppercase tracking-[0.3em] md:tracking-[0.5em] font-black text-green-600 opacity-80">
                  ONLINE
                </span>
                {message.intent_eval && (
                  <>
                    <span className="w-1.5 md:w-2 h-[1px] bg-lex-border" />
                    <span className={cn(
                      "text-[7px] md:text-[9px] font-black px-2 md:px-3 py-0.5 rounded-full border tracking-[0.1em] md:tracking-[0.2em] uppercase",
                      message.intent_eval.intent === 'drafting' ? "bg-amber-50 text-amber-700 border-amber-200" :
                        message.intent_eval.intent === 'analysis' ? "bg-lex-gold/10 text-lex-gold border-lex-gold/20" :
                          "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {message.intent_eval.intent === 'drafting' ? 'CHẾ ĐỘ SOẠN THẢO' :
                        message.intent_eval.intent === 'analysis' ? 'TRA CỨU CHUYÊN SÂU' :
                          'TRA CỨU CHUNG'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content Section */}
        <div className={cn(
          "selection:bg-lex-gold/30",
          isUser ? "text-[13px] md:text-sm font-sans tracking-tight" : "prose prose-lex max-w-none text-sm md:text-base"
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div className="prose prose-lex max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
          )}

          {isAssistant && (
            <div className="hidden lg:block">
              <LegalDisclaimer variant="inline" className="mt-6 pt-4 border-t border-lex-border/40" />
            </div>
          )}

          {/* Image Attachments — blob URLs (optimistic) or Supabase URLs */}
          {imageAttachments && (
            <div className={cn('grid gap-1.5 mt-3 max-w-xs', imageAttachments.gridClass)}>
              {imageAttachments.visible.map((url, idx) => {
                const isLast = idx === imageAttachments.visible.length - 1;
                const showOverlay = isLast && imageAttachments.overflow > 0;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="relative rounded-xl overflow-hidden border border-white/10 shadow-md cursor-zoom-in"
                    style={{ aspectRatio: '1 / 1' }}
                    onClick={() => window.open(url, '_blank')}
                  >
                    <img src={url} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                    {showOverlay ? (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
                        <span className="text-white text-xl font-bold">+{imageAttachments.overflow + 1}</span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-black/0 hover:bg-black/15 transition-colors" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

        </div>

        {/* Citations Section */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-12 pt-10 border-t border-lex-border space-y-6">
            <p className="text-[11px] md:text-sm font-serif uppercase tracking-[0.4em] md:tracking-[0.6em] font-black text-lex-gold flex items-center gap-3 md:gap-4">
              <span className="w-8 md:w-16 h-[2px] bg-lex-gold/40" />
              Cơ sở pháp lý tham chiếu
            </p>
            <div className="grid gap-5">
              {message.citations.map((citation: any, index: number) => {
                const isVerified = citation.verification_status === 'verified' || citation.source_domain === 'legalshield.local';
                return (
                  <div
                    key={index}
                    id={`citation-row-${index + 1}`}
                    className="flex flex-col md:flex-row gap-3 md:gap-6 p-4 md:p-6 bg-surface-container-lowest/50 rounded-[1rem] md:rounded-[1.5rem] border border-lex-border hover:border-lex-gold/30 hover:bg-white transition-all duration-500 group/citation cursor-pointer"
                    onClick={() => setSelectedCitation(citation)}
                  >
                    <div className="flex gap-4 items-start">
                      <span className="text-lex-gold font-serif font-black text-2xl md:text-4xl leading-none flex-shrink-0 opacity-20 group-hover/citation:opacity-100 transition-opacity">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-base md:text-lg font-serif font-bold text-lex-deep leading-snug group-hover/citation:text-lex-gold transition-colors">
                            {citation.title || citation.source || 'Nguồn văn bản quy phạm'}
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
                          <p className="text-[13px] font-sans text-slate-gray leading-relaxed font-medium line-clamp-2 italic">
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


        {/* Follow-up suggestions (INSIDE bubble) */}
        {isAssistant && isLast && message.follow_up_suggestions && (
          <div className="mt-12 pt-10 border-t border-lex-border/60">
            <FollowUpSuggestions
              suggestions={message.follow_up_suggestions}
              onSelect={onSuggestionClick || (() => { })}
            />
          </div>
        )}
      </div>

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

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scale, BookOpen, AlertCircle, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../ui/Button';
import { LegalDisclaimer } from './LegalDisclaimer';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../store/chatStore';

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

const markdownComponents = {
  a: ({ children }: any) => {
    const text = children?.[0]?.toString() || '';
    const match = text.match(/^(\d+)$/);
    if (match) {
      const index = parseInt(match[1]);
      return (
        <span className="inline-flex items-center justify-center w-5 h-5 -translate-y-1 bg-lex-gold/10 text-lex-gold border border-lex-gold/20 rounded-md text-[10px] font-bold mx-0.5 shadow-sm">
          {index}
        </span>
      );
    }
    return <span>{children}</span>;
  },
};

export const StreamingMessage = memo(({
  content,
  isStreaming,
  error,
  onRetry,
  className,
}: StreamingMessageProps) => {
  const { streaming } = useChatStore();
  const statusText = streaming.status || 'Đang khởi tạo phiên...';
  const hasEvidence = streaming.evidence?.length > 0;

  const processedContent = content.replace(/\[(?:#)?(\d+)\]/g, '[$1](#citation-$1)');

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          'flex flex-col items-start gap-4 p-8 rounded-[2.5rem] border border-red-200/40 bg-red-50/20 shadow-xl shadow-red-900/[0.02] max-w-[85%]',
          className
        )}
      >
        <div className="flex items-center gap-3 text-red-700">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center border border-red-200">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest block">Lỗi hệ thống</span>
          </div>
        </div>
        <p className="text-sm text-red-700/80 leading-relaxed font-medium pl-2 border-l-2 border-red-200 ml-5">{error}</p>
        <div className="pl-5 pt-2">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-3 border-red-200 text-red-700 hover:bg-red-50 rounded-xl px-6 font-bold uppercase tracking-widest text-[10px]"
            >
              <RotateCcw className="h-3 w-3" />
              Thử lại phiên làm việc
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={cn(
        'flex flex-col mb-4 md:mb-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-500',
        className
      )}
    >
      <div className="p-3 md:p-6 bg-white border border-lex-border text-lex-deep shadow-2xl shadow-lex-deep/[0.02] rounded-xl md:rounded-[2rem] relative overflow-hidden">
        {/* Assistant Branding Section */}
        <div className="flex items-center gap-3 md:gap-4 mb-6 pb-6 md:mb-12 md:pb-10 border-b border-lex-border/60">
          <div className="w-10 h-10 md:w-14 md:h-14 bg-lex-deep rounded-xl md:rounded-2xl flex items-center justify-center shadow-2xl shadow-lex-deep/20 border border-lex-midnight transform rotate-3 transition-transform text-white">
            <Scale size={20} className="text-lex-gold md:hidden" />
            <Scale size={28} className="text-lex-gold hidden md:block" />
          </div>
          <div className="flex-1">
            <h3 className="font-serif font-bold text-lex-deep leading-tight text-lg md:text-2xl tracking-tight">Trợ lý Tra cứu Pháp lý</h3>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1.5 md:mt-3">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.8)]"></div>
              <span className="text-[8px] md:text-[10px] uppercase tracking-[0.3em] md:tracking-[0.5em] font-black text-green-600 opacity-80">
                ONLINE
              </span>
              <span className="w-1.5 md:w-2 h-[1px] bg-lex-border" />
              <span className="text-[7px] md:text-[9px] font-black px-2 md:px-3 py-0.5 rounded-full border border-lex-gold/20 bg-lex-gold/10 text-lex-gold tracking-[0.1em] md:tracking-[0.2em] uppercase">
                {isStreaming ? (statusText.toUpperCase() || 'ĐANG PHÂN TÍCH...') : 'PHÂN TÍCH HOÀN TẤT'}
              </span>
            </div>
          </div>

          <AnimatePresence>
            {hasEvidence && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-lex-gold/10 border border-lex-gold/30 rounded-xl"
              >
                <BookOpen size={14} className="text-lex-gold" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-lex-gold text-nowrap">
                  {streaming.evidence.length} Tài liệu
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="prose prose-lex max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {processedContent}
          </ReactMarkdown>
          {isStreaming && (
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="inline-block w-2 h-5 bg-lex-gold/40 ml-1 translate-y-1 rounded-full"
            />
          )}
        </div>

        <LegalDisclaimer variant="inline" className="mt-6 pt-4 border-t border-lex-border/40" />
      </div>
    </motion.div>
  );
});

StreamingMessage.displayName = 'StreamingMessage';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, RotateCcw, Scale, BookOpen, Search, CheckCircle2, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../ui/Button';
import { clsx, type ClassValue } from 'clsx';
import { useChatStore } from '../../store/chatStore';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Granular step resolver for the progress tracker
const AGENT_STEPS = [
  { id: 'analyze', label: 'Phân tích yêu cầu', match: ['phân tích', 'tư duy', 'hiểu'] },
  { id: 'search', label: 'Tìm kiếm pháp lý', match: ['nguồn', 'tìm kiếm', 'truy xuất'] },
  { id: 'extract', label: 'Trích xuất điều luật', match: ['trích xuất', 'điều luật', 'văn bản'] },
  { id: 'draft', label: 'Đang phản hồi', match: ['soạn thảo', 'phản hồi', 'trả lời'] },
];

function ProgressTracker({ currentStatus }: { currentStatus: string }) {
  const activeStepIndex = AGENT_STEPS.findIndex(step =>
    step.match.some(m => currentStatus.toLowerCase().includes(m))
  ) || 0;

  return (
    <div className="flex items-center gap-3 py-4 overflow-hidden">
      {AGENT_STEPS.map((step, index) => {
        const isCompleted = index < activeStepIndex;
        const isActive = index === activeStepIndex;

        return (
          <div key={step.id} className="flex items-center gap-2 group">
            <div className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full border transition-all duration-500",
              isCompleted ? "bg-lex-deep border-lex-deep text-lex-gold" :
                isActive ? "border-lex-gold text-lex-gold animate-pulse shadow-[0_0_10px_rgba(201,149,74,0.3)]" :
                  "border-lex-border text-lex-lawyer/20"
            )}>
              {isCompleted ? <CheckCircle2 size={12} /> : <span className="text-[10px] font-bold">{index + 1}</span>}
            </div>
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-widest hidden sm:inline whitespace-nowrap transition-colors",
              isActive ? "text-lex-deep" : "text-lex-lawyer/40"
            )}>
              {step.label}
            </span>
            {index < AGENT_STEPS.length - 1 && (
              <ChevronRight size={10} className="text-lex-border mx-1 opacity-50" />
            )}
          </div>
        );
      })}
    </div>
  );
}

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

  // --- Initial wait (no content yet) ---
  if (isStreaming && !content) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'max-w-[92%] lg:max-w-[85%] p-10 font-sans leading-relaxed bg-white border border-lex-border rounded-[2.5rem] shadow-2xl shadow-lex-deep/[0.03]',
          className
        )}
      >
        <div className="flex items-center gap-5 mb-8 pb-8 border-b border-lex-border/60">
          <div className="w-12 h-12 bg-lex-deep rounded-2xl flex items-center justify-center shadow-2xl shadow-lex-deep/20 border border-lex-midnight">
            <Scale size={24} className="text-lex-gold" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-lex-deep leading-none text-xl tracking-tight">Hệ thống Cố vấn AI</h3>
            <div className="flex items-center gap-3 mt-2.5">
              <div className="w-2.5 h-2.5 bg-lex-gold rounded-full animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-lex-gold">
                Institutional Core
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <ProgressTracker currentStatus={statusText} />
          <div className="flex items-center gap-4 p-6 bg-surface-container-low/50 rounded-2xl border border-lex-border/40">
            <Loader2 className="h-4 w-4 animate-spin text-lex-gold" />
            <span className="text-xs font-bold text-lex-lawyer/80 leading-relaxed uppercase tracking-widest">
              {statusText}
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  // --- Error state ---
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
            <span className="text-[10px] uppercase opacity-60 tracking-tighter">Node ID: LS-FAILED</span>
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

  // --- Streaming content display ---
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={cn(
        'max-w-[92%] lg:max-w-[85%] p-10 md:p-12 font-sans leading-relaxed bg-white border border-lex-border rounded-[2.5rem] shadow-2xl shadow-lex-deep/[0.03]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-5 mb-10 pb-8 border-b border-lex-border/60">
        <div className="w-12 h-12 bg-lex-deep rounded-2xl flex items-center justify-center shadow-2xl shadow-lex-deep/20 border border-lex-midnight">
          <Scale size={24} className="text-lex-gold" />
        </div>
        <div className="flex-1">
          <h3 className="font-serif font-bold text-lex-deep leading-none text-xl tracking-tight">Hệ thống Cố vấn AI</h3>
          <div className="flex items-center gap-3 mt-2.5">
            <div className="w-2 h-2 bg-lex-gold rounded-full animate-pulse shadow-[0_0_8px_rgba(201,149,74,0.6)]" />
            <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-lex-gold">
              Đang soạn thảo...
            </span>
          </div>
        </div>

        {/* Evidence badge — appears when citations arrive */}
        <AnimatePresence>
          {hasEvidence && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-4 py-2 bg-lex-gold/10 border border-lex-gold/30 rounded-xl"
            >
              <BookOpen size={14} className="text-lex-gold" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-lex-gold">
                {streaming.evidence.length} Phát hiện
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Markdown content */}
      <div className="prose prose-lex max-w-none text-lex-deep/90 prose-p:leading-[1.8] prose-p:mb-6 prose-headings:font-serif prose-headings:text-lex-deep prose-strong:text-lex-deep prose-strong:font-bold prose-li:marker:text-lex-gold selection:bg-lex-gold/10">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content + (isStreaming ? ' \u2588' : '')}
        </ReactMarkdown>
      </div>

      {/* Granular Progress Tracker Footer */}
      {isStreaming && (
        <div className="mt-12 pt-8 border-t border-lex-border/60">
          <ProgressTracker currentStatus={statusText} />
        </div>
      )}
    </motion.div>
  );
});

StreamingMessage.displayName = 'StreamingMessage';

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, RotateCcw, Scale } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../ui/Button';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const StreamingMessage = memo(({
  content,
  isStreaming,
  error,
  onRetry,
  className,
}: StreamingMessageProps) => {
  // Typing indicator animation
  if (isStreaming && !content) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('flex items-center gap-3 p-4', className)}
      >
        <TypingIndicator />
        <span className="text-sm text-slate-500 font-medium italic">Lexis AI đang phân tích dữ liệu...</span>
      </motion.div>
    );
  }

  // Error state
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          'flex flex-col items-start gap-3 p-5 rounded-lg border border-red-200 bg-red-50 shadow-sm',
          className
        )}
      >
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-bold">Lỗi hệ thống</span>
        </div>
        <p className="text-sm text-red-600/90 leading-relaxed">{error}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2 border-red-200 text-red-700 hover:bg-red-100"
          >
            <RotateCcw className="h-4 w-4" />
            Thử lại
          </Button>
        )}
      </motion.div>
    );
  }

  // Streaming content display
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative p-6 bg-white shadow-[0_12px_40px_-12px_rgba(4,22,39,0.08)] border-l-4 border-[#ffcc32]/40 rounded-lg', className)}
    >
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#e4e2e1]/40">
        <div className="h-9 w-9 bg-[#041627] flex items-center justify-center text-[#fbcc32] rounded-sm">
          <Scale size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-[#041627] font-serif leading-none">Phản hồi Thời gian thực</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#fbcc32] animate-pulse" />
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold font-sans">Drafting in progress</span>
          </div>
        </div>
      </div>

      <div className="prose prose-sm max-w-none prose-slate prose-p:leading-relaxed prose-p:mb-4 text-[#1b1c1c]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content + (isStreaming ? ' \u2588' : '')}
        </ReactMarkdown>
      </div>

      {isStreaming && (
        <div className="flex items-center gap-2 mt-4 text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-[10px] uppercase font-bold tracking-widest">Đang trích xuất luật...</span>
        </div>
      )}
    </motion.div>
  );
});

// Typing indicator for initial loading
export function TypingIndicator({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex items-center gap-2 p-3', className)}
    >
      <div className="flex items-center gap-1">
        <motion.span
          className="w-2 h-2 bg-primary/60 rounded-full"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
        />
        <motion.span
          className="w-2 h-2 bg-primary/60 rounded-full"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0.15 }}
        />
        <motion.span
          className="w-2 h-2 bg-primary/60 rounded-full"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: 0.3 }}
        />
      </div>
    </motion.div>
  );
}

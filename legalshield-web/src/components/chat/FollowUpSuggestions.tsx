import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function FollowUpSuggestions({
  suggestions,
  onSelect,
  isLoading,
  className,
}: FollowUpSuggestionsProps) {
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className={cn('flex items-center gap-2 px-4 py-3 bg-lex-surface/30 rounded-lg border border-lex-deep/5', className)}
      >
        <Lightbulb className="h-4 w-4 text-lex-deep/40 animate-pulse" />
        <span className="text-sm text-lex-muted/60 font-sans">Đang tạo câu hỏi gợi ý...</span>
      </motion.div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('space-y-4', className)}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-lex-deep/30">
        <Lightbulb className="h-4 w-4" />
        <span>Gợi ý thảo luận tiếp theo</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion, index) => (
            <motion.div
              key={`${suggestion}-${index}`}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                duration: 0.2,
                delay: index * 0.05,
              }}
              layout
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelect(suggestion)}
                className={cn(
                  'group h-auto py-2 px-3 text-left justify-start gap-2 max-w-[340px] rounded-lg',
                  'border-lex-deep/10 bg-white hover:bg-lex-deep hover:text-white transition-all duration-300'
                )}
              >
                <span className="line-clamp-2 text-[13px] font-medium tracking-tight">
                  {suggestion}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 -translate-x-2 
                  group-hover:opacity-100 group-hover:translate-x-0 
                  transition-all duration-300" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Compact version for inline use within messages
export function FollowUpSuggestionsCompact({
  suggestions,
  onSelect,
  className,
}: Omit<FollowUpSuggestionsProps, 'isLoading'>) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {suggestions.slice(0, 3).map((suggestion, index) => (
        <motion.button
          key={`compact-${suggestion}-${index}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.05 }}
          onClick={() => onSelect(suggestion)}
          className={cn(
            'text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg',
            'bg-lex-surface text-lex-deep border border-lex-deep/5',
            'hover:bg-lex-deep hover:text-white',
            'transition-all duration-200',
            'line-clamp-1 max-w-[220px]'
          )}
        >
          {suggestion}
        </motion.button>
      ))}
    </div>
  );
}

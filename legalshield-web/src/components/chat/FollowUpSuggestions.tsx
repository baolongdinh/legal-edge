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
        className={cn('flex items-center gap-2 p-3', className)}
      >
        <Lightbulb className="h-4 w-4 text-muted-foreground animate-pulse" />
        <span className="text-sm text-muted-foreground">Đang tạo câu hỏi gợi ý...</span>
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
      className={cn('space-y-3', className)}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lightbulb className="h-4 w-4" />
        <span>Câu hỏi tiếp theo bạn có thể quan tâm:</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion, index) => (
            <motion.div
              key={`${suggestion}-${index}`}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ 
                duration: 0.2, 
                delay: index * 0.1,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
              layout
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelect(suggestion)}
                className={cn(
                  'group h-auto py-2 px-3 text-left justify-start gap-2',
                  'border-dashed hover:border-solid hover:bg-accent',
                  'transition-all duration-200 max-w-[300px]'
                )}
              >
                <span className="line-clamp-2 text-xs font-normal leading-relaxed">
                  {suggestion}
                </span>
                <ArrowRight className="h-3 w-3 shrink-0 opacity-0 -translate-x-2 
                  group-hover:opacity-100 group-hover:translate-x-0 
                  transition-all duration-200" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Compact version for inline use
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
            'text-xs px-2 py-1 rounded-md',
            'bg-secondary/50 hover:bg-secondary',
            'text-secondary-foreground',
            'transition-colors duration-150',
            'line-clamp-1 max-w-[200px]'
          )}
        >
          {suggestion}
        </motion.button>
      ))}
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, X, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface ChatInputProps {
  onSend: (message: string) => void;
  onAttachDocument?: () => void;
  attachedDocument?: any | null;
  onDetachDocument?: () => void;
  isStreaming?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ChatInput({
  onSend,
  onAttachDocument,
  attachedDocument,
  onDetachDocument,
  isStreaming,
  placeholder = 'Nhập yêu cầu pháp lý hoặc câu hỏi tại đây...',
  disabled,
  className,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming || disabled) return;

    onSend(input.trim());
    setInput('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className={cn('relative', className)}>
      {/* Attached document indicator */}
      <AnimatePresence>
        {attachedDocument && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute -top-12 left-0 right-0 flex items-center gap-2 p-2 bg-white/80 backdrop-blur shadow-sm rounded-md text-xs border border-[#e4e2e1]"
          >
            <Paperclip size={14} className="text-slate-400" />
            <span className="flex-1 truncate text-[#041627] font-medium">{attachedDocument.name || 'Tài liệu đính kèm'}</span>
            {onDetachDocument && (
              <button
                className="h-5 w-5 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                onClick={onDetachDocument}
              >
                <X size={12} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container (Stone style) */}
      <div className="relative flex items-center bg-[#e4e2e1] rounded-lg shadow-inner overflow-hidden min-h-[60px]">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming || disabled}
          className="w-full bg-transparent border-none focus:ring-0 py-4 px-6 pr-24 text-[#1b1c1c] placeholder:text-slate-400 resize-none no-scrollbar font-sans"
          rows={1}
        />

        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {onAttachDocument && (
            <button
              onClick={onAttachDocument}
              disabled={isStreaming || disabled}
              className="p-2 text-slate-500 hover:text-[#041627] transition-colors"
            >
              <Paperclip size={20} />
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || disabled}
            className={cn(
              "bg-[#041627] text-white h-10 w-10 flex items-center justify-center rounded hover:opacity-90 active:scale-95 transition-all disabled:opacity-50",
              isStreaming && "animate-pulse"
            )}
          >
            {isStreaming ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} className="fill-current" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

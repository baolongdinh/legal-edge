import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming?: boolean;
  disabled?: boolean;
  attachedDocument?: { name: string; size: number } | null;
  onAttachDocument?: () => void;
  onDetachDocument?: () => void;
}

export function ChatInput({
  onSend,
  isStreaming,
  disabled,
  attachedDocument,
  onAttachDocument,
  onDetachDocument,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (content.trim() && !disabled && !isStreaming) {
      onSend(content.trim());
      setContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  return (
    <div className="relative">
      {/* File attachment preview */}
      {attachedDocument && (
        <div className="absolute bottom-full mb-4 left-0 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <div className="flex items-center gap-3 bg-white border border-lex-deep/10 px-4 py-2 rounded-lg shadow-sm">
            <Paperclip size={14} className="text-lex-deep/40" />
            <div className="max-w-[200px]">
              <p className="text-xs font-medium text-lex-deep truncate">{attachedDocument.name}</p>
              <p className="text-[10px] text-lex-muted">{(attachedDocument.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={onDetachDocument}
              className="p-1 hover:bg-lex-deep/5 rounded-full transition-colors"
            >
              <X size={14} className="text-lex-deep/40" />
            </button>
          </div>
        </div>
      )}

      {/* Quick Action Bubbles - More compact */}
      <div className="flex gap-2 mb-3 overflow-x-auto custom-scrollbar pb-1.5 no-scrollbar">
        {[
          { label: 'Tóm tắt điều khoản', action: 'Tóm tắt các điều khoản quan trọng trong hồ sơ này' },
          { label: 'Kiểm tra tính pháp lý', action: 'Kiểm tra tính pháp lý và các rủi ro tiềm ẩn' },
          { label: 'Soạn đơn khởi kiện', action: 'Dựa trên vụ việc này, hãy soạn dự thảo đơn khởi kiện mẫu' },
          { label: 'Trích dẫn điều luật', action: 'Dựa trên vụ việc này, hãy trích dẫn các điều luật liên quan, đảm bảo tính chính xác' },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => onSend(item.action)}
            disabled={disabled || isStreaming}
            className="flex-shrink-0 px-3 py-1.5 bg-white/50 border border-lex-border rounded-full text-[9px] font-bold uppercase tracking-wider text-lex-lawyer/70 hover:bg-lex-gold/5 hover:border-lex-gold/30 hover:text-lex-gold transition-all duration-300 shadow-sm whitespace-nowrap"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Input container - Premium Redesign */}
      <div className="relative flex items-end gap-3 bg-white/80 backdrop-blur-xl border border-lex-border rounded-2xl p-3 subtle-elevation focus-within:border-lex-gold/40 transition-all duration-500">
        <button
          onClick={onAttachDocument}
          className="p-3 text-lex-lawyer/40 hover:text-lex-gold hover:bg-lex-gold/5 transition-all rounded-xl"
          title="Đính kèm tài liệu"
        >
          <Paperclip size={22} />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Gửi hợp đồng hoặc mô tả chi tiết vụ việc của bạn..."
          className="flex-1 bg-transparent border-none focus:ring-0 text-lex-deep text-base py-3 px-2 resize-none max-h-[200px] font-sans placeholder:text-lex-lawyer/30 leading-relaxed font-medium"
          rows={1}
          disabled={disabled}
        />

        <button
          onClick={handleSend}
          disabled={!content.trim() || disabled || isStreaming}
          className={cn(
            "w-14 h-14 flex items-center justify-center rounded-xl transition-all duration-500",
            content.trim() && !disabled && !isStreaming
              ? "bg-gradient-to-br from-lex-deep to-lex-midnight text-lex-gold hover:scale-105 active:scale-95 shadow-xl shadow-lex-deep/20"
              : "bg-surface-container-low text-lex-lawyer/20 cursor-not-allowed"
          )}
        >
          {isStreaming ? (
            <Loader2 size={24} className="animate-spin text-lex-gold" />
          ) : (
            <Send size={24} />
          )}
        </button>
      </div>
    </div>
  );
}

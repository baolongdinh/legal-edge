import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Loader2, Camera, Image as ImageIcon } from 'lucide-react';
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
  attachedImages?: { id: string; url: string; file: File }[];
  onAttachImages?: (files: FileList | null) => void;
  onRemoveImage?: (id: string) => void;
}

export function ChatInput({
  onSend,
  isStreaming,
  disabled,
  attachedDocument,
  onAttachDocument,
  onDetachDocument,
  attachedImages = [],
  onAttachImages,
  onRemoveImage,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [isImageMenuOpen, setIsImageMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onAttachImages) onAttachImages(e.target.files);
    setIsImageMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

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

      {/* Image previews */}
      {attachedImages.length > 0 && (
        <div className="flex gap-3 mb-4 overflow-x-auto pb-1 no-scrollbar animate-in slide-in-from-bottom-2 fade-in duration-400">
          {attachedImages.map((img) => (
            <div key={img.id} className="relative flex-shrink-0 group">
              <img
                src={img.url}
                className="w-16 h-16 object-cover rounded-xl border border-lex-border shadow-sm group-hover:brightness-75 transition-all"
                alt="Preview"
              />
              <button
                onClick={() => onRemoveImage?.(img.id)}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} strokeWidth={3} />
              </button>
            </div>
          ))}
          {attachedImages.length < 5 && (
            <button
              onClick={() => setIsImageMenuOpen(!isImageMenuOpen)}
              className="w-16 h-16 flex items-center justify-center border-2 border-dashed border-lex-border rounded-xl text-lex-muted hover:text-lex-gold hover:border-lex-gold/30 hover:bg-lex-gold/5 transition-all"
            >
              <ImageIcon size={20} />
            </button>
          )}
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
        <div className="relative">
          <button
            onClick={() => setIsImageMenuOpen(!isImageMenuOpen)}
            className={cn(
              "p-3 transition-all rounded-xl",
              isImageMenuOpen ? "text-lex-gold bg-lex-gold/5" : "text-lex-lawyer/40 hover:text-lex-gold hover:bg-lex-gold/5"
            )}
            title="Đính kèm"
          >
            <Paperclip size={22} className={cn(isImageMenuOpen && "rotate-45 transition-transform duration-300")} />
          </button>

          {/* Upload Menu */}
          {isImageMenuOpen && (
            <div className="absolute bottom-full mb-4 left-0 bg-white border border-lex-border rounded-2xl shadow-2xl p-2 flex flex-col gap-1 z-50 min-w-[180px] animate-in slide-in-from-bottom-2 fade-in duration-200">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-3 px-4 py-3 hover:bg-lex-gold/5 rounded-xl text-lex-deep transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-lex-gold/10 flex items-center justify-center group-hover:bg-lex-gold/20 transition-colors">
                  <Camera size={16} className="text-lex-gold" />
                </div>
                <span className="text-sm font-semibold">Chụp ảnh</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-4 py-3 hover:bg-lex-gold/5 rounded-xl text-lex-deep transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <ImageIcon size={16} className="text-blue-500" />
                </div>
                <span className="text-sm font-semibold">Thư viện ảnh</span>
              </button>
              <button
                onClick={onAttachDocument}
                className="flex items-center gap-3 px-4 py-3 hover:bg-lex-lawyer/5 rounded-xl text-lex-deep transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-lex-lawyer/10 flex items-center justify-center group-hover:bg-lex-lawyer/20 transition-colors">
                  <Paperclip size={16} className="text-lex-lawyer" />
                </div>
                <span className="text-sm font-semibold">Tài liệu</span>
              </button>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            className="hidden"
            accept="image/*"
            multiple
          />
          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleImageSelect}
            className="hidden"
            accept="image/*"
            capture="environment"
          />
        </div>

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

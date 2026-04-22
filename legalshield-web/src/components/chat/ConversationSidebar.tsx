import { useCallback, memo } from 'react';
import { Plus, MessageSquare, Star, Trash2, Folder, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversation } from '../../hooks/useConversation';
import { Typography } from '../ui/Typography';
import { Button } from '../ui/Button';
import { clsx } from 'clsx';
import type { Conversation } from '../../store/conversationStore';

interface ConversationItemProps {
    conv: Conversation;
    isSelected: boolean;
    onSelect: (conv: Conversation) => void;
    onDelete: (id: string) => void;
    formatDate: (date: string) => string;
}

const ConversationItem = memo(({ conv, isSelected, onSelect, onDelete, formatDate }: ConversationItemProps) => {
    const isTemp = conv.id.startsWith('temp-');

    // Simple status resolver based on existing fields or counts
    const getStatus = () => {
        if (isTemp) return { label: 'Đang tạo', color: 'text-amber-600 bg-amber-50 border-amber-100' };
        if (conv.metadata?.status === 'processing') return { label: 'Đang xử lý', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
        if (conv.message_count > 10) return { label: 'Hoàn thành', color: 'text-lex-lawyer bg-lex-lawyer/5 border-lex-border' };
        return { label: 'Cần cung cấp', color: 'text-lex-gold bg-lex-gold/5 border-lex-gold/20' };
    };

    const status = getStatus();

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => !isTemp && onSelect(conv)}
            className={clsx(
                "group relative p-4 rounded-xl cursor-pointer transition-all duration-500 mb-2 border",
                isSelected
                    ? "bg-surface-container-lowest shadow-2xl shadow-lex-deep/5 border-lex-border z-10 scale-[1.01]"
                    : "hover:bg-surface-container-lowest/80 text-lex-lawyer border-transparent",
                isTemp && "opacity-60 cursor-wait pointer-events-none"
            )}
        >
            {/* Selected Indicator Bar */}
            {isSelected && (
                <div className="absolute left-0 top-6 bottom-6 w-1 space-y-1 bg-lex-gold rounded-r-full transition-all duration-300" />
            )}

            <div className="flex justify-between items-start mb-2 pl-2">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <Typography
                            variant="body"
                            className={clsx(
                                "line-clamp-1 transition-colors text-base",
                                isSelected ? "text-lex-deep font-bold" : "text-lex-lawyer font-semibold"
                            )}
                        >
                            {conv.title || 'Cuộc hội thoại mới'}
                        </Typography>
                        {isTemp && (
                            <div className="w-1.5 h-1.5 bg-lex-gold rounded-full animate-pulse" />
                        )}
                    </div>
                    {/* Status Tag */}
                    <div className={clsx(
                        "inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border self-start transition-all duration-500",
                        status.color
                    )}>
                        {status.label}
                    </div>
                </div>
                {conv.is_starred && (
                    <Star size={12} className="text-lex-gold fill-lex-gold flex-shrink-0 mt-1" />
                )}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-lex-lawyer uppercase tracking-wider opacity-40 pl-2 font-bold mb-2">
                <span>{isTemp ? 'Mới' : formatDate(conv.updated_at)}</span>
                <span className="w-0.5 h-0.5 bg-lex-lawyer rounded-full" />
                <span>{conv.message_count} tin nhắn</span>
            </div>

            {/* Summary preview */}
            {conv.summary_level_1 && !isTemp && (
                <p className="text-xs text-lex-lawyer/60 leading-relaxed pl-2 line-clamp-2 font-sans italic">
                    {conv.summary_level_1}
                </p>
            )}

            {!isTemp && (
                <div className={clsx(
                    "absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1 pl-4 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0",
                    isSelected ? "bg-surface-container-lowest" : "bg-transparent"
                )}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(conv.id);
                        }}
                        className="p-1.5 text-lex-deep/20 hover:text-red-500 transition-colors"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )}
        </motion.div>
    );
});

ConversationItem.displayName = 'ConversationItem';

interface ConversationSidebarProps {
    isMobileOpen?: boolean;
    onClose?: () => void;
}

export function ConversationSidebar({ isMobileOpen, onClose }: ConversationSidebarProps) {
    const navigate = useNavigate();
    const {
        conversations,
        selectedConversation,
        isLoading,
        createConversation,
        deleteConversation,
        searchQuery,
        setSearchQuery,
    } = useConversation();

    const formatDate = useCallback((dateStr: string) => {
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit'
            }).format(new Date(dateStr));
        } catch {
            return '';
        }
    }, []);

    const handleSelect = useCallback((conv: Conversation) => {
        navigate(`/chat/${conv.id}`);
    }, [navigate]);

    return (
        <>
            {/* Mobile Backdrop */}
            <AnimatePresence>
                {isMobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-lex-deep/40 backdrop-blur-sm z-[60] lg:hidden"
                    />
                )}
            </AnimatePresence>

            <div className={clsx(
                "fixed inset-y-0 left-0 z-[70] lg:relative lg:z-0 transform transition-transform duration-500 ease-soft-spring lg:translate-x-0 w-[280px] sm:w-85 h-full flex flex-col bg-muted/30 border-r border-lex-border",
                isMobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:flex"
            )}>
                {/* Header */}
                <div className="p-6 space-y-6 md:p-8 md:space-y-8">
                    <div className="flex items-center justify-between">
                        <Typography variant="h3" className="font-serif italic text-lex-deep text-2xl tracking-tight">
                            Archive
                        </Typography>
                        <Folder size={18} className="text-lex-gold/60" />
                    </div>
                    <Button
                        onClick={() => createConversation()}
                        className="w-full justify-start gap-4 bg-gradient-to-br from-lex-deep to-lex-midnight text-lex-ivory hover:scale-[1.02] active:scale-[0.98] transition-all duration-500 shadow-2xl shadow-lex-deep/20 rounded-2xl py-5 group border border-lex-midnight/50"
                    >
                        <div className="bg-lex-gold/10 p-2 rounded-xl group-hover:bg-lex-gold/20 transition-colors duration-500">
                            <Plus size={20} className="text-lex-gold group-hover:rotate-90 transition-transform duration-500" />
                        </div>
                        <span className="font-bold uppercase tracking-[0.2em] text-xs">Tư vấn mới</span>
                    </Button>
                </div>

                {/* Search */}
                <div className="px-6 mb-6 md:px-8">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-lex-lawyer/40 group-focus-within:text-lex-gold transition-colors" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm trong kho..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-surface-bright/50 border border-lex-border rounded-xl py-3 pl-11 pr-4 text-xs focus:ring-1 focus:ring-lex-gold transition-all placeholder:text-lex-lawyer/30 font-medium"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-4 pb-8 custom-scrollbar">
                    {isLoading && conversations.length === 0 ? (
                        <div className="p-4 space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-20 bg-lex-lawyer/5 animate-pulse rounded-xl" />
                            ))}
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center px-8 opacity-20">
                            <MessageSquare className="w-10 h-10 text-lex-lawyer mb-4" />
                            <p className="text-[10px] text-lex-lawyer uppercase tracking-widest font-bold">Chưa có lịch sử</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {conversations.map((conv) => (
                                <ConversationItem
                                    key={conv.id}
                                    conv={conv}
                                    isSelected={selectedConversation?.id === conv.id}
                                    onSelect={handleSelect}
                                    onDelete={deleteConversation}
                                    formatDate={formatDate}
                                />
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </>
    );
}

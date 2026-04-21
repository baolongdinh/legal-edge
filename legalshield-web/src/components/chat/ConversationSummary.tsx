import { motion, AnimatePresence } from 'framer-motion';
import { X, LayoutDashboard, Target, Zap, ChevronRight, Scale } from 'lucide-react';
import { Typography } from '../ui/Typography';

interface ConversationSummaryProps {
    isOpen: boolean;
    onClose: () => void;
    conversationId?: string;
    onRegenerate?: () => void;
    isRegenerating?: boolean;
    summary: {
        level_1?: string;
        level_2?: string;
        level_3?: string;
    };
}

export function ConversationSummary({
    isOpen,
    onClose,
    summary,
    onRegenerate,
    isRegenerating
}: ConversationSummaryProps) {
    const layers = [
        {
            id: 'l1',
            title: 'Lớp 1: Khái quát',
            icon: <Target size={16} />,
            content: summary.level_1 || (isRegenerating ? 'Đang tạo tóm tắt mới...' : 'Chưa có tóm tắt khái quát cho cuộc hội thoại này.')
        },
        {
            id: 'l2',
            title: 'Lớp 2: Chi tiết Pháp lý',
            icon: <LayoutDashboard size={16} />,
            content: summary.level_2 || (isRegenerating ? 'Đang phân tích sâu...' : 'Đang chờ xử lý các lập luận pháp lý chuyên sâu...')
        },
        {
            id: 'l3',
            title: 'Lớp 3: Khuyến nghị & Rủi ro',
            icon: <Zap size={16} />,
            content: summary.level_3 || (isRegenerating ? 'Đang đánh giá rủi ro...' : 'Hệ thống đang chờ dữ liệu để đánh giá các rủi ro.')
        },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-lex-deep/10 backdrop-blur-[2px] z-[90]"
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-[91] flex flex-col border-l border-lex-border"
                    >
                        <div className="p-6 md:p-8 border-b border-lex-border flex items-center justify-between bg-lex-surface/50">
                            <div className="flex items-center gap-3 md:gap-4">
                                <div className="w-10 h-10 bg-lex-deep rounded-xl flex items-center justify-center shadow-lg shadow-lex-deep/10 border border-lex-midnight">
                                    <Scale size={20} className="text-lex-gold" />
                                </div>
                                <div>
                                    <Typography variant="h3" className="font-serif italic text-lex-deep text-xl">
                                        Insight Dashboard
                                    </Typography>
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] uppercase tracking-widest font-bold text-lex-lawyer/40">Layered Summary Analysis</p>
                                        {onRegenerate && (
                                            <button
                                                onClick={onRegenerate}
                                                disabled={isRegenerating}
                                                className={`text-[8px] px-2 py-0.5 rounded border border-lex-gold/30 text-lex-gold hover:bg-lex-gold hover:text-white transition-all uppercase font-bold flex items-center gap-1 ${isRegenerating ? 'animate-pulse opacity-50' : ''}`}
                                            >
                                                {isRegenerating ? 'Đang tạo...' : 'Làm mới'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-lex-lawyer/5 rounded-full transition-colors">
                                <X size={24} className="text-lex-lawyer/40" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 md:space-y-8 custom-scrollbar bg-ivory-warm/20">
                            {layers.map((layer, index) => (
                                <motion.div
                                    key={layer.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="bg-white rounded-[1.5rem] md:rounded-[2rem] border border-lex-border p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow group"
                                >
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-lex-gold/5 text-lex-gold rounded-lg group-hover:bg-lex-gold group-hover:text-white transition-colors">
                                            {layer.icon}
                                        </div>
                                        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-lex-deep">
                                            {layer.title}
                                        </h3>
                                    </div>

                                    <div className="prose prose-lex max-w-none text-sm text-lex-lawyer/80 leading-relaxed font-serif italic whitespace-pre-wrap">
                                        {layer.content}
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-lex-border/50 flex justify-end">
                                        <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-lex-lawyer/40 hover:text-lex-gold transition-colors">
                                            Chi tiết <ChevronRight size={12} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="p-6 md:p-8 border-t border-lex-border bg-white text-center">
                            <p className="text-[10px] text-lex-lawyer/30 uppercase tracking-[0.3em] italic">
                                AI Orchestration Analytics • Node LS-ALPHA-01
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

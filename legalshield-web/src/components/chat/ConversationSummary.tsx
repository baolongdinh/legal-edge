import { motion, AnimatePresence } from 'framer-motion';
import { X, Target, Zap, Scale, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';

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
            title: 'Khái quát sự vụ',
            icon: <Target size={16} />,
            content: summary.level_1 || (isRegenerating ? 'Hệ thống đang tóm lược nội dung...' : 'Chưa có thông tin khái quát cho hội thoại này.')
        },
        {
            id: 'l2',
            title: 'Phân tích & Hành động',
            icon: <Scale size={16} />,
            content: summary.level_2 || (isRegenerating ? 'Đang phân tích các điểm mấu chốt...' : 'Hệ thống chưa trích xuất được hành động cụ thể.')
        },
        {
            id: 'l3',
            title: 'Đánh giá rủi ro',
            icon: <Zap size={16} />,
            content: summary.level_3 || (isRegenerating ? 'Đang đánh giá rủi ro pháp lý...' : 'Hệ thống đang chờ dữ liệu để đánh giá các rủi ro.')
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
                        className="fixed inset-0 bg-lex-deep/40 backdrop-blur-sm z-[90]"
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-[91] flex flex-col border-l border-lex-border"
                    >
                        {/* Header */}
                        <div className="p-6 md:p-8 border-b border-lex-border flex items-center justify-between bg-lex-ivory/30">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-lex-deep rounded-2xl flex items-center justify-center shadow-lg shadow-lex-deep/10 border border-lex-midnight">
                                    <Scale size={24} className="text-lex-gold" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-serif font-black text-lex-deep tracking-tight font-serif">Legal Insight</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <div className="w-2 h-2 bg-lex-gold rounded-full shadow-[0_0_8px_rgba(201,149,74,0.6)]" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-lex-lawyer opacity-60">AI Analysis Report</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {onRegenerate && (
                                    <button
                                        onClick={onRegenerate}
                                        disabled={isRegenerating}
                                        className="p-3 hover:bg-lex-ivory rounded-xl transition-all border border-lex-border group disabled:opacity-50"
                                        title="Làm mới Insight"
                                    >
                                        <RotateCcw size={18} className={cn("text-lex-lawyer", isRegenerating && "animate-spin")} />
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="p-3 hover:bg-lex-deep hover:text-white rounded-xl transition-all border border-lex-border group"
                                >
                                    <X size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 space-y-12">
                            {isRegenerating && (
                                <div className="p-8 bg-lex-gold/5 border border-lex-gold/20 rounded-[2rem] flex flex-col items-center justify-center text-center space-y-4">
                                    <Loader2 size={32} className="animate-spin text-lex-gold" />
                                    <p className="text-xs font-black uppercase tracking-[0.3em] text-lex-gold">Hệ thống đang xử lý dữ liệu</p>
                                </div>
                            )}

                            {!isRegenerating && layers.map((layer, index) => (
                                <motion.section
                                    key={layer.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="space-y-6"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-lex-gold/10 text-lex-gold rounded-xl border border-lex-gold/20 shadow-sm shadow-lex-gold/5">
                                            {layer.icon}
                                        </div>
                                        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-lex-lawyer">
                                            {layer.title}
                                        </h3>
                                    </div>
                                    <div className="bg-lex-ivory/20 p-8 rounded-[2rem] border border-lex-border/80 shadow-sm hover:shadow-md transition-all">
                                        <div className="prose prose-lex max-w-none prose-p:text-lg prose-p:leading-[1.8] prose-p:font-serif prose-p:italic prose-p:text-lex-deep prose-p:opacity-90">
                                            <p>{layer.content}</p>
                                        </div>
                                    </div>
                                </motion.section>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="p-6 md:p-8 border-t border-lex-border bg-lex-ivory/10 text-center">
                            <p className="text-[10px] text-lex-lawyer/30 uppercase tracking-[0.5em] font-black">
                                LegalShield Insight Engine • v2.0-STABLE
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

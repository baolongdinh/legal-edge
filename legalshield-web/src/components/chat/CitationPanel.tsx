import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ShieldCheck, FileText, Download, Scale } from 'lucide-react';
import { Typography } from '../ui/Typography';

interface CitationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    citation: {
        title?: string;
        source?: string;
        content?: string;
        url?: string;
        source_domain?: string;
        verification_status?: string;
    } | null;
}

export const CitationPanel: React.FC<CitationPanelProps> = ({ isOpen, onClose, citation }) => {
    if (!citation) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-lex-deep/20 backdrop-blur-sm z-[100]"
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 h-full w-full max-w-2xl bg-ivory-warm shadow-[-20px_0_50px_rgba(0,0,0,0.1)] z-[101] flex flex-col border-l border-lex-border"
                    >
                        {/* Header */}
                        <div className="p-6 md:p-8 border-b border-lex-border flex items-center justify-between bg-white/50 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-lex-gold/10 rounded-xl flex items-center justify-center border border-lex-gold/20">
                                    <FileText className="text-lex-gold" size={20} />
                                </div>
                                <div>
                                    <Typography variant="h3" className="font-serif italic text-lex-deep leading-tight">
                                        Legal Citation Review
                                    </Typography>
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-lex-lawyer/40 mt-1">
                                        Institutional Verification System
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-3 text-lex-lawyer/40 hover:text-lex-deep hover:bg-lex-lawyer/5 rounded-xl transition-all"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 md:space-y-12 custom-scrollbar">
                            {/* Citation Title & Source */}
                            <section className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                                        <ShieldCheck size={12} />
                                        Hồ sơ gốc
                                    </span>
                                    {citation.source_domain && (
                                        <span className="text-[10px] font-mono text-lex-lawyer/40">
                                            {citation.source_domain}
                                        </span>
                                    )}
                                </div>

                                <h2 className="text-3xl font-serif font-bold text-lex-deep leading-tight tracking-tight">
                                    {citation.title || citation.source}
                                </h2>

                                <div className="flex flex-wrap gap-4 pt-2">
                                    {citation.url && (
                                        <a
                                            href={citation.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-5 py-2.5 bg-lex-deep text-lex-ivory rounded-xl text-xs font-bold transition-all hover:scale-[1.02] shadow-lg shadow-lex-deep/10"
                                        >
                                            <ExternalLink size={14} />
                                            Xem Văn bản Gốc
                                        </a>
                                    )}
                                    <button className="flex items-center gap-2 px-5 py-2.5 border border-lex-border text-lex-lawyer rounded-xl text-xs font-bold transition-all hover:bg-lex-lawyer/5">
                                        <Download size={14} />
                                        Tải về (.PDF)
                                    </button>
                                </div>
                            </section>

                            {/* Full Text Analysis */}
                            <section className="space-y-6">
                                <div className="flex items-center gap-3 text-lex-gold">
                                    <Scale size={18} />
                                    <Typography variant="body" className="font-bold uppercase tracking-[0.2em] text-[10px]">
                                        Nội dung trích lục chi tiết
                                    </Typography>
                                </div>

                                <div className="bg-white/40 p-6 md:p-10 rounded-2xl md:rounded-[2rem] border border-lex-border shadow-inner-lg">
                                    <div className="prose prose-lex max-w-none text-lex-deep/90 leading-[1.8] font-serif text-lg">
                                        {citation.content || "Không có nội dung chi tiết được lưu trữ cho nguồn này."}
                                    </div>
                                </div>
                            </section>

                            {/* Legal Context Note */}
                            <div className="p-8 bg-lex-midnight/5 border-l-4 border-lex-gold rounded-r-2xl">
                                <p className="text-sm font-sans text-lex-lawyer/80 leading-relaxed">
                                    <strong className="text-lex-deep block mb-2 font-serif text-base">Lưu ý Pháp lý:</strong>
                                    Thông tin trích dẫn trên được AI trích xuất tự động từ cơ sở dữ liệu pháp luật.
                                    Người dùng chịu trách nhiệm đối chiếu trực tiếp với văn bản quy phạm pháp luật đang có hiệu lực thi hành
                                    trước khi áp dụng vào thực tế hồ sơ.
                                </p>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 md:p-8 bg-surface-container-low border-t border-lex-border">
                            <button
                                onClick={onClose}
                                className="w-full py-4 text-center bg-transparent border border-lex-deep text-lex-deep font-bold uppercase tracking-widest text-[11px] rounded-xl hover:bg-lex-deep hover:text-lex-ivory transition-all duration-500"
                            >
                                Đóng Phiên Kiểm duyệt
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

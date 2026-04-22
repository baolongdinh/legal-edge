import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ShieldCheck, FileText, Download, Scale } from 'lucide-react';

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
                        className="fixed inset-0 bg-lex-deep/40 backdrop-blur-sm z-[100]"
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-[101] flex flex-col border-l border-lex-border"
                    >
                        {/* Header */}
                        <div className="p-6 md:p-8 border-b border-lex-border flex items-center justify-between bg-lex-ivory/30">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-lex-deep rounded-2xl flex items-center justify-center shadow-lg shadow-lex-deep/10 border border-lex-midnight">
                                    <FileText size={24} className="text-lex-gold" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-serif font-black text-lex-deep tracking-tight">Citation Review</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <div className="w-2 h-2 bg-lex-gold rounded-full shadow-[0_0_8px_rgba(201,149,74,0.6)]" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-lex-lawyer opacity-60">Verified Document Source</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-3 hover:bg-lex-deep hover:text-white rounded-xl transition-all border border-lex-border group"
                            >
                                <X size={20} className="group-hover:rotate-90 transition-transform duration-500" />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 space-y-12">
                            {/* Citation Status & Title */}
                            <section className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 shadow-sm">
                                            <ShieldCheck size={12} />
                                            Authentic Source
                                        </span>
                                        {citation.source_domain && (
                                            <span className="text-[10px] font-black uppercase tracking-widest text-lex-lawyer opacity-30">
                                                {citation.source_domain}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <h2 className="text-3xl font-serif font-black text-lex-deep leading-tight tracking-tight">
                                    {citation.title || citation.source}
                                </h2>

                                <div className="flex flex-wrap gap-4 pt-4">
                                    {citation.url && (
                                        <a
                                            href={citation.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-6 py-3 bg-lex-deep text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] shadow-xl shadow-lex-deep/20 active:scale-95"
                                        >
                                            <ExternalLink size={16} />
                                            View Original Document
                                        </a>
                                    )}
                                    <button className="flex items-center gap-2 px-6 py-3 border border-lex-border text-lex-lawyer rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:bg-lex-ivory active:scale-95">
                                        <Download size={16} />
                                        Download PDF
                                    </button>
                                </div>
                            </section>

                            <div className="h-px bg-gradient-to-r from-transparent via-lex-border to-transparent" />

                            {/* Full Text Analysis */}
                            <section className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-2.5 bg-lex-gold/10 text-lex-gold rounded-xl border border-lex-gold/20 shadow-sm shadow-lex-gold/5">
                                        <Scale size={18} />
                                    </div>
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-lex-lawyer">
                                        Detailed Extract
                                    </h3>
                                </div>

                                <div className="bg-lex-ivory/20 p-8 rounded-[2rem] border border-lex-border/80 shadow-sm">
                                    <div className="prose prose-lex max-w-none prose-p:text-lg prose-p:leading-[1.8] prose-p:font-serif prose-p:italic prose-p:text-lex-deep prose-p:opacity-90">
                                        {citation.content || "Không có nội dung chi tiết được lưu trữ cho nguồn này."}
                                    </div>
                                </div>
                            </section>

                            {/* Legal Context Note */}
                            <div className="p-8 bg-lex-deep text-white rounded-[2rem] shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-lex-gold opacity-10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-lg bg-lex-gold/20 flex items-center justify-center">
                                            <ShieldCheck size={16} className="text-lex-gold" />
                                        </div>
                                        <h4 className="text-xs font-black uppercase tracking-[0.3em] text-lex-gold">Legal Disclaimer</h4>
                                    </div>
                                    <p className="text-sm font-serif italic text-lex-ivory/80 leading-relaxed">
                                        This information is automatically extracted. Legal practitioners must verify against official gazettes before taking formal action.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 md:p-8 border-t border-lex-border bg-lex-ivory/10">
                            <button
                                onClick={onClose}
                                className="w-full py-4 bg-white border border-lex-deep text-lex-deep font-black uppercase tracking-[0.3em] text-[10px] rounded-xl hover:bg-lex-deep hover:text-white transition-all duration-300 shadow-sm active:scale-[0.98]"
                            >
                                Close Document Review
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

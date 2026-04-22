import { useState } from 'react'
import { AlertTriangle, X, FileDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/Button'

interface DraftDownloadConsentModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    fileName?: string
}

export function DraftDownloadConsentModal({ isOpen, onClose, onConfirm, fileName }: DraftDownloadConsentModalProps) {
    const [checked, setChecked] = useState({ c1: false, c2: false, c3: false })
    const allChecked = checked.c1 && checked.c2 && checked.c3

    const handleConfirm = () => {
        if (!allChecked) return
        onConfirm()
        setChecked({ c1: false, c2: false, c3: false })
        onClose()
    }

    const handleClose = () => {
        setChecked({ c1: false, c2: false, c3: false })
        onClose()
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-lex-deep/70 backdrop-blur-sm"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 16 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="bg-lex-ivory rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative border border-amber-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Top warning stripe */}
                        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-500" />

                        <div className="p-8">
                            {/* Header */}
                            <button
                                onClick={handleClose}
                                className="absolute right-5 top-5 text-on-surface/30 hover:text-on-surface transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                                    <AlertTriangle size={24} className="text-amber-600" />
                                </div>
                                <div>
                                    <h2 className="font-serif text-xl font-bold text-lex-deep">Xác nhận Trách nhiệm</h2>
                                    <p className="text-xs text-on-surface/50 font-medium mt-0.5">Trước khi tải xuống bản nháp</p>
                                </div>
                            </div>

                            {/* Warning callout */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                                <p className="text-xs text-amber-800 font-medium leading-relaxed">
                                    <span className="font-bold block mb-1">⚠️ BẢN NHÁP THAM KHẢO — KHÔNG CÓ GIÁ TRỊ PHÁP LÝ</span>
                                    Tài liệu này được tạo ra bởi AI dựa trên dữ liệu mẫu. Bạn phải rà soát và hoàn thiện với luật sư có chứng chỉ hành nghề trước khi sử dụng trong bất kỳ giao dịch pháp lý nào.
                                </p>
                            </div>

                            {/* Consent checkboxes */}
                            <div className="space-y-4 mb-8">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40 mb-3">
                                    Vui lòng đọc kỹ và xác nhận:
                                </p>
                                {[
                                    { key: 'c1' as const, label: 'Tôi hiểu rằng đây là văn bản do AI tự động tạo ra dựa trên dữ liệu mẫu, không phải từ luật sư có chứng chỉ hành nghề.' },
                                    { key: 'c2' as const, label: 'Tôi cam kết sẽ tự rà soát lại toàn bộ nội dung – đặc biệt các thông tin thực tế, số liệu và điều khoản – trước khi sử dụng.' },
                                    { key: 'c3' as const, label: 'Tôi đồng ý rằng LegalShield không chịu trách nhiệm cho bất kỳ thiệt hại nào phát sinh từ việc sử dụng văn bản này.' },
                                ].map(({ key, label }) => (
                                    <label key={key} className="flex items-start gap-3 cursor-pointer group">
                                        <div
                                            className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${checked[key]
                                                    ? 'bg-lex-deep border-lex-deep'
                                                    : 'border-outline-variant group-hover:border-lex-deep/40'
                                                }`}
                                            onClick={() => setChecked(prev => ({ ...prev, [key]: !prev[key] }))}
                                        >
                                            {checked[key] && (
                                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </div>
                                        <span className="text-sm text-on-surface/70 leading-relaxed">{label}</span>
                                    </label>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={handleClose} className="flex-1 border-outline-variant">
                                    Hủy
                                </Button>
                                <Button
                                    onClick={handleConfirm}
                                    disabled={!allChecked}
                                    className={`flex-1 gap-2 font-bold transition-all ${allChecked
                                            ? 'bg-lex-deep text-lex-ivory hover:bg-lex-midnight'
                                            : 'bg-surface-container-high text-on-surface/30 cursor-not-allowed'
                                        }`}
                                >
                                    <FileDown size={16} />
                                    {fileName ? `Tải bản nháp về` : 'Xác nhận & Tải bản nháp'}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

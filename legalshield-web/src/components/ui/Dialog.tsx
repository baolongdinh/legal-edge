import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Info } from 'lucide-react'
import { Button } from './Button'
import { Typography } from './Typography'

interface DialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm?: () => void
    title: string
    description: string
    variant?: 'info' | 'danger'
    confirmText?: string
    cancelText?: string
    isLoading?: boolean
}

export function Dialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    variant = 'info',
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    isLoading = false
}: DialogProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    {createPortal(
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-navy-elevated border border-slate-border/50 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
                            >
                                <div className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${variant === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-gold-primary/10 text-gold-primary'
                                            }`}>
                                            {variant === 'danger' ? <AlertTriangle size={20} /> : <Info size={20} />}
                                        </div>
                                        <div className="flex-1">
                                            <Typography variant="h3" className="text-xl mb-2 font-serif">{title}</Typography>
                                            <Typography variant="body" className="text-paper-dark/70 leading-relaxed">{description}</Typography>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-navy-base/50 flex items-center justify-end gap-3 border-t border-slate-border/30">
                                    <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
                                        {cancelText}
                                    </Button>
                                    <Button
                                        variant={variant === 'danger' ? 'primary' : 'primary'}
                                        size="sm"
                                        onClick={onConfirm}
                                        loading={isLoading}
                                        className={variant === 'danger' ? 'bg-red-600 hover:bg-red-700 border-red-600' : ''}
                                    >
                                        {confirmText}
                                    </Button>
                                </div>
                            </motion.div>
                        </motion.div>,
                        document.body
                    )}
                </>
            )}
        </AnimatePresence>
    )
}

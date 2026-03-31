import { useState, useRef, useEffect } from 'react'
import * as Comlink from 'comlink'
import { Send, Bot, User, Loader2, Scale, Trash2, Paperclip, X, FileText, Info } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { Skeleton } from '../components/ui/Skeleton'
import { Dialog } from '../components/ui/Dialog'
import { supabase } from '../lib/supabase'
import { clsx } from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

let workerApi: any = null
const initWorker = () => {
    if (!workerApi) {
        const worker = new Worker(new URL('../workers/document.worker.ts', import.meta.url), { type: 'module' })
        workerApi = Comlink.wrap(worker)
    }
    return workerApi
}

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    citations?: Array<{
        citation_text: string
        citation_url: string
        source_domain: string
        source_title: string
        verification_status: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'
    }>
    verification_status?: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'
    verification_summary?: {
        citation_count: number
        official_count: number
        secondary_count: number
        unsupported_claim_count: number
    }
    claim_audit?: Array<{
        claim: string
        supported: boolean
        matched_citation_url?: string
        matched_source_domain?: string
        score?: number
    }>
    abstained?: boolean
}

export function ChatAI() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'initial',
            role: 'assistant',
            content: 'Xin chào! Tôi là Trợ lý Pháp lý AI của LegalShield. Tôi có thể giúp bạn giải đáp thắc mắc về hợp đồng, quy định pháp luật Việt Nam hoặc tư vấn soạn thảo. Bạn cần hỗ trợ gì hôm nay?'
        }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [isParsing, setIsParsing] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [documentContext, setDocumentContext] = useState<string>('')
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, loading])

    const parseDocumentViaServer = async (selected: File, accessToken: string) => {
        const formData = new FormData()
        const ext = selected.name.split('.').pop()?.toLowerCase()
        if (ext === 'txt' || ext === 'csv' || ext === 'md') {
            formData.append('file', new File([selected], selected.name, { type: 'text/plain' }))
        } else {
            formData.append('file', selected)
        }
        formData.append('mode', 'ephemeral')

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${supabaseUrl}/functions/v1/parse-document`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            body: formData
        })

        const functionData = await res.json().catch(() => ({}))
        if (!res.ok) {
            const message = functionData.error || 'Không thể đọc tài liệu từ máy chủ.'
            const code = functionData.code ? ` (${functionData.code})` : ''
            throw new Error(`${message}${code}`)
        }

        if (!functionData?.text_content) {
            throw new Error('Máy chủ không trả về nội dung tài liệu.')
        }

        return functionData.text_content as string
    }

    const parseDocumentLocally = async (selected: File) => {
        const extension = selected.name.split('.').pop()?.toLowerCase()

        if (extension === 'txt' || extension === 'md' || extension === 'csv') {
            return await selected.text()
        }

        const arrayBuffer = await selected.arrayBuffer()
        const api = initWorker()

        if (extension === 'pdf') {
            return await api.parsePDF(arrayBuffer)
        }

        if (extension === 'docx') {
            return await api.parseDocx(arrayBuffer)
        }

        throw new Error('UNSUPPORTED_LOCAL_PARSE')
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0]
        if (!selected) return

        if (selected.size > 10 * 1024 * 1024) {
            toast.error('File quá lớn. Vui lòng chọn file dưới 10MB.')
            return
        }

        setFile(selected)
        setDocumentContext('')
        setIsParsing(true)

        const parseToast = toast.loading(`Đang phân tích "${selected.name}"...`)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Vui lòng đăng nhập.')

            const extension = selected.name.split('.').pop()?.toLowerCase()
            let textContent = ''

            try {
                textContent = await parseDocumentLocally(selected)
            } catch (localError) {
                console.warn('Local parse failed, trying server fallback:', localError)

                if (extension === 'pdf' || extension === 'docx' || extension === 'doc' || extension?.startsWith('jp')) {
                    toast.loading(`Đang chuyển sang phân tích máy chủ cho "${selected.name}"...`, { id: parseToast })
                }

                textContent = await parseDocumentViaServer(selected, session.access_token)
            }

            if (!textContent?.trim()) {
                throw new Error('Không trích xuất được nội dung từ tài liệu.')
            }

            setDocumentContext(textContent)
            toast.success(`Đã đọc xong "${selected.name}". Bạn có thể đặt câu hỏi ngay.`, { id: parseToast })
        } catch (err) {
            console.error('Lỗi phân tích tài liệu:', err)
            const extension = selected.name.split('.').pop()?.toLowerCase()
            const message = extension === 'pdf'
                ? 'Không thể trích xuất nội dung PDF. Vui lòng thử lại.'
                : extension === 'docx' || extension === 'doc'
                    ? 'Không thể đọc file Word. Vui lòng thử lại.'
                    : 'Không thể đọc tài liệu. Vui lòng thử lại.'
            toast.error(message, { id: parseToast })
            setFile(null)
        } finally {
            setIsParsing(false)
        }
    }

    const clearFile = () => {
        setFile(null)
        setDocumentContext('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if ((!input.trim() && !file) || loading || isParsing) return

        let userMsg = input.trim()
        if (!userMsg && file) {
            userMsg = `Hãy phân tích tài liệu "${file.name}" mà tôi vừa tải lên.`
        }

        setInput('')

        let displayMsg = userMsg
        if (file) {
            displayMsg = `[Đã đính kèm: ${file.name}]\n${userMsg}`
        }

        const userMessage: Message = { id: Date.now().toString(), role: 'user', content: displayMsg }
        setMessages(prev => [...prev, userMessage])
        setLoading(true)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Vui lòng đăng nhập để sử dụng tính năng này.')

            const payload: { message: string; history: Message[]; document_context?: string } = {
                message: userMsg,
                history: messages.slice(-5).map(m => ({ role: m.role, content: m.content } as any))
            }
            if (documentContext) {
                payload.document_context = documentContext
            }

            const { data, error } = await supabase.functions.invoke('legal-chat', {
                body: payload,
                headers: {
                    Authorization: `Bearer ${session.access_token}`
                }
            })

            if (error) throw error

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.reply || 'Xin lỗi, tôi gặp sự cố khi xử lý yêu cầu.',
                citations: data.citations || [],
                verification_status: data.verification_status,
                verification_summary: data.verification_summary,
                claim_audit: data.claim_audit || [],
                abstained: data.abstained
            }
            setMessages(prev => [...prev, assistantMessage])
            clearFile()
        } catch (err) {
            console.error('Chat error:', err)
            toast.error('Hệ thống đang bận, vui lòng thử lại sau.')
        } finally {
            setLoading(false)
        }
    }

    const clearChat = () => {
        setMessages([{
            id: 'reset',
            role: 'assistant',
            content: 'Đã xóa lịch sử chat. Tôi có thể giúp gì thêm cho bạn?'
        }])
        clearFile()
        setIsClearConfirmOpen(false)
    }

    return (
        <div className="h-full flex flex-col bg-navy-base overflow-hidden relative">
            <Dialog
                isOpen={isClearConfirmOpen}
                onClose={() => setIsClearConfirmOpen(false)}
                onConfirm={clearChat}
                title="Xóa lịch sử chat?"
                description="Toàn bộ nội dung trò chuyện hiện tại và context tài liệu sẽ được xóa. Bạn có muốn tiếp tục?"
                variant="info"
                confirmText="Xóa lịch sử"
            />

            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-border/50 flex items-center justify-between bg-navy-elevated/40 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        className="w-10 h-10 rounded-full bg-gold-primary/10 flex items-center justify-center border border-gold-primary/20"
                    >
                        <Scale className="text-gold-primary" size={20} />
                    </motion.div>
                    <div>
                        <Typography variant="h3" className="text-base font-serif">Tư vấn Pháp lý AI</Typography>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                            <Typography variant="caption" className="text-[10px] text-paper-dark/40 uppercase tracking-widest font-bold">Trực tuyến</Typography>
                        </div>
                    </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsClearConfirmOpen(true)} className="text-paper-dark/40 hover:text-red-400 hover:bg-red-400/10 border-none h-9 w-9 p-0">
                    <Trash2 size={18} />
                </Button>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide bg-grid">
                <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 15, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className={clsx(
                                "flex gap-4 max-w-2xl",
                                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                            )}
                        >
                            <div className={clsx(
                                "w-10 h-10 rounded-xl shrink-0 flex items-center justify-center border transition-all duration-300",
                                msg.role === 'user'
                                    ? "bg-gold-primary text-navy-base border-gold-muted/50"
                                    : "bg-navy-elevated border-slate-border/50 text-gold-primary shadow-lg"
                            )}>
                                {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                            </div>
                            <div className={clsx(
                                "relative px-6 py-4 rounded-2xl text-[14px] leading-relaxed shadow-xl",
                                msg.role === 'user'
                                    ? "bg-gold-primary/10 border border-gold-primary/20 text-paper-dark rounded-tr-sm"
                                    : "bg-navy-elevated/80 backdrop-blur-md border border-slate-border/30 text-paper-dark rounded-tl-sm"
                            )}>
                                <div className="prose prose-sm prose-invert max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            h1: ({ node: _, ...props }: any) => <h1 className="text-gold-primary text-lg font-bold mt-4 mb-2 first:mt-0" {...props} />,
                                            h2: ({ node: _, ...props }: any) => <h2 className="text-gold-primary text-base font-bold mt-4 mb-2 first:mt-0" {...props} />,
                                            h3: ({ node: _, ...props }: any) => <h3 className="text-paper-dark text-sm font-bold mt-3 mb-2 first:mt-0" {...props} />,
                                            p: ({ node: _, ...props }: any) => <p className="mb-3 last:mb-0" {...props} />,
                                            ul: ({ node: _, ...props }: any) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
                                            ol: ({ node: _, ...props }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
                                            td: ({ node: _, ...props }: any) => <td className="px-3 py-2 text-sm border-t border-slate-border/30" {...props} />,
                                            code: ({ node: _, inline, ...props }: any) =>
                                                inline
                                                    ? <code className="bg-navy-base px-1.5 py-0.5 rounded text-gold-primary text-xs font-mono" {...props} />
                                                    : <pre className="bg-[#0f172a]/80 backdrop-blur-sm p-4 rounded-xl overflow-x-auto border border-slate-border/30 my-4"><code className="text-xs text-slate-300 font-mono" {...props} /></pre>
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                                {msg.role === 'assistant' && (msg.abstained || msg.verification_status === 'conflicted' || msg.verification_status === 'unsupported') && (
                                    <div className={clsx(
                                        "mt-4 rounded-xl border px-4 py-3",
                                        msg.abstained || msg.verification_status === 'unsupported'
                                            ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                            : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                                    )}>
                                        <div className="text-[11px] font-bold uppercase tracking-[0.2em]">
                                            {msg.abstained || msg.verification_status === 'unsupported'
                                                ? 'Chưa đủ căn cứ'
                                                : 'Cần kiểm tra thêm'}
                                        </div>
                                        <div className="mt-1 text-sm leading-relaxed">
                                            {msg.abstained || msg.verification_status === 'unsupported'
                                                ? 'Câu trả lời này chưa có đủ dẫn chứng pháp lý đáng tin cậy để khẳng định chắc chắn.'
                                                : 'Một phần nhận định pháp lý chưa được đối chiếu đủ mạnh với nguồn hiện có.'}
                                        </div>
                                    </div>
                                )}
                                {msg.role === 'assistant' && msg.verification_summary && (
                                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        <div className="rounded-xl border border-slate-border/20 bg-navy-base/40 px-3 py-2">
                                            <Typography variant="caption" className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Citation</Typography>
                                            <Typography variant="body" className="mt-1 text-sm font-semibold text-paper-dark">{msg.verification_summary.citation_count}</Typography>
                                        </div>
                                        <div className="rounded-xl border border-slate-border/20 bg-navy-base/40 px-3 py-2">
                                            <Typography variant="caption" className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Official</Typography>
                                            <Typography variant="body" className="mt-1 text-sm font-semibold text-emerald-300">{msg.verification_summary.official_count}</Typography>
                                        </div>
                                        <div className="rounded-xl border border-slate-border/20 bg-navy-base/40 px-3 py-2">
                                            <Typography variant="caption" className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Secondary</Typography>
                                            <Typography variant="body" className="mt-1 text-sm font-semibold text-amber-300">{msg.verification_summary.secondary_count}</Typography>
                                        </div>
                                        <div className="rounded-xl border border-slate-border/20 bg-navy-base/40 px-3 py-2">
                                            <Typography variant="caption" className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Unsupported</Typography>
                                            <Typography variant="body" className="mt-1 text-sm font-semibold text-rose-300">{msg.verification_summary.unsupported_claim_count}</Typography>
                                        </div>
                                    </div>
                                )}
                                {msg.role === 'assistant' && msg.claim_audit && msg.claim_audit.some((claim) => !claim.supported) && (
                                    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                                        <Typography variant="caption" className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-200">
                                            Claim Cần Kiểm Tra Thêm
                                        </Typography>
                                        <div className="mt-2 space-y-2">
                                            {msg.claim_audit
                                                .filter((claim) => !claim.supported)
                                                .slice(0, 3)
                                                .map((claim, index) => (
                                                    <div key={`${claim.claim}-${index}`} className="rounded-lg border border-amber-500/10 bg-navy-base/30 px-3 py-2">
                                                        <Typography variant="body" className="text-sm text-paper-dark/85">{claim.claim}</Typography>
                                                        <Typography variant="caption" className="mt-1 block text-[11px] text-paper-dark/45">
                                                            {claim.matched_source_domain
                                                                ? `Nguồn gần nhất: ${claim.matched_source_domain}`
                                                                : 'Chưa tìm thấy nguồn khớp đủ mạnh'}
                                                        </Typography>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}
                                {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-slate-border/20 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Typography variant="caption" className="text-[10px] uppercase tracking-[0.2em] font-bold text-gold-muted">
                                                Dẫn chứng pháp lý
                                            </Typography>
                                            <span className={clsx(
                                                "text-[10px] px-2 py-1 rounded-full border uppercase tracking-wide",
                                                msg.verification_status === 'official_verified'
                                                    ? 'border-green-500/30 text-green-400 bg-green-500/10'
                                                    : msg.verification_status === 'secondary_verified'
                                                        ? 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                                                        : 'border-slate-border text-paper-dark/40 bg-white/5'
                                            )}>
                                                {msg.verification_status === 'official_verified'
                                                    ? 'Đã xác minh'
                                                    : msg.verification_status === 'secondary_verified'
                                                        ? 'Nguồn thứ cấp'
                                                        : 'Chưa đủ căn cứ'}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {msg.citations.map((citation, index) => (
                                                <a
                                                    key={`${citation.citation_url}-${index}`}
                                                    href={citation.citation_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block rounded-xl border border-slate-border/30 bg-navy-base/60 px-4 py-3 hover:border-gold-primary/30 transition-colors"
                                                >
                                                    <Typography variant="body" className="text-sm text-paper-dark mb-1">
                                                        {citation.citation_text}
                                                    </Typography>
                                                    <Typography variant="caption" className="text-[11px] text-paper-dark/40">
                                                        {citation.source_title} · {citation.source_domain}
                                                    </Typography>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className={clsx(
                                    "absolute top-0 w-2 h-2",
                                    msg.role === 'user' ? "right-[-8px] border-l-[8px] border-l-gold-primary/10 border-b-[8px] border-b-transparent" : "left-[-8px] border-r-[8px] border-r-navy-elevated border-b-[8px] border-b-transparent"
                                )} />
                            </div>
                        </motion.div>
                    ))}

                    {(loading || isParsing) && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex gap-4 mr-auto max-w-md"
                        >
                            <div className="w-10 h-10 rounded-xl bg-navy-elevated border border-slate-border/50 flex items-center justify-center text-gold-primary shadow-lg">
                                <Loader2 size={18} className="animate-spin" />
                            </div>
                            <div className="flex-1 space-y-3 pt-2">
                                <Typography variant="caption" className="text-paper-dark/40 italic flex items-center gap-2">
                                    <Info size={12} />
                                    {isParsing ? 'Đang đọc tài liệu...' : 'Đang xử lý câu hỏi...'}
                                </Typography>
                                <Skeleton height={16} width="100%" className="rounded" />
                                <Skeleton height={16} width="85%" className="rounded opacity-60" />
                                <Skeleton height={16} width="60%" className="rounded opacity-40" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Input Area */}
            <div className="p-6 bg-navy-elevated/40 backdrop-blur-md border-t border-slate-border/30">
                <div className="max-w-4xl mx-auto space-y-4">
                    <AnimatePresence>
                        {file && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, y: 10 }}
                                animate={{ opacity: 1, height: 'auto', y: 0 }}
                                exit={{ opacity: 0, height: 0, y: 10 }}
                                className="flex items-center gap-3 bg-gold-primary/10 border border-gold-primary/20 rounded-xl px-4 py-2 w-fit relative overflow-hidden"
                            >
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold-primary" />
                                <FileText size={18} className="text-gold-primary" />
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-gold-primary uppercase tracking-tighter">Tài liệu đã đính kèm</span>
                                    <span className="text-sm text-paper-dark truncate max-w-[240px] font-medium">{file.name}</span>
                                </div>
                                <button
                                    onClick={clearFile}
                                    className="p-1.5 rounded-full hover:bg-gold-primary/20 text-gold-primary transition-all ml-2"
                                    title="Gỡ file"
                                >
                                    <X size={16} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleSend} className="relative flex items-end gap-3">
                        <div className="relative flex-1">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                placeholder="Hỏi về rủi ro hợp đồng, luật lao động, đính kèm file..."
                                className="w-full bg-navy-base/80 border border-slate-border/50 rounded-2xl pl-12 pr-4 py-4 text-sm text-paper-dark focus:outline-none focus:border-gold-primary/50 focus:ring-1 focus:ring-gold-primary/20 transition-all shadow-inner min-h-[56px] max-h-[200px] resize-none"
                                rows={1}
                            />

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                            />

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={loading || isParsing}
                                className={clsx(
                                    "absolute left-3 bottom-3 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300",
                                    file ? "text-gold-primary bg-gold-primary/10 border border-gold-primary/20" : "text-paper-dark/30 hover:text-gold-primary hover:bg-navy-elevated"
                                )}
                                title="Đính kèm tài liệu"
                            >
                                <Paperclip size={20} />
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || isParsing || (!input.trim() && !file)}
                            className="w-14 h-14 shrink-0 rounded-2xl bg-gold-primary text-navy-base flex items-center justify-center hover:scale-105 hover:shadow-gold active:scale-95 disabled:opacity-30 disabled:hover:scale-100 transition-all shadow-[0_10px_20px_rgba(201,168,76,0.2)]"
                        >
                            <Send size={24} className="ml-1" />
                        </button>
                    </form>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center gap-2 text-[10px] text-paper-dark/30 uppercase tracking-[0.2em] font-bold"
                    >
                        <Scale size={10} />
                        <span>Chế độ tư vấn chuyên sâu • AI Powered</span>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}

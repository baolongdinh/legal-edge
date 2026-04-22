import { useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Comlink from 'comlink'
import { Upload, FileText, Search, Send, Loader2, Zap, AlertTriangle, CheckCircle2, Info, ExternalLink, X, Bot, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { SplitView } from '../components/layout/SplitView'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Typography } from '../components/ui/Typography'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { useUploadStore, useAnalysisStore } from '../store'
import { getCurrentUser, invokeEdgeFunction, supabase } from '../lib/supabase'
import { classifySections, ContractSchema } from '../lib/document-parser'
import { cn } from '../lib/utils'

// Proxy for the Web Worker
let workerApi: any = null
const initWorker = () => {
    if (!workerApi) {
        const worker = new Worker(new URL('../workers/document.worker.ts', import.meta.url), { type: 'module' })
        workerApi = Comlink.wrap(worker)
    }
    return workerApi
}

type VerificationStatus = 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'

interface LegalCitation {
    citation_text: string
    citation_url: string
    source_domain: string
    source_title: string
    source_excerpt: string
    source_type: 'official' | 'secondary' | 'document_context'
    verification_status: VerificationStatus
}

interface VerificationSummary {
    verification_status: VerificationStatus
    citation_count: number
    official_count: number
    secondary_count: number
    unsupported_claim_count: number
}

// interface RiskClause {
//     clause_ref: string
//     level: 'critical' | 'moderate' | 'note'
//     description: string
//     risk_quote?: string
//     suggested_revision?: string
//     citation: string
//     citation_url?: string
//     source_title?: string
//     source_excerpt?: string
//     source_domain?: string
//     retrieved_at?: string
//     verification_status?: VerificationStatus
//     evidence?: any
// }


const verificationBadgeMap: Record<VerificationStatus, { label: string; className: string }> = {
    official_verified: {
        label: 'Đã xác minh',
        className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none',
    },
    secondary_verified: {
        label: 'Nguồn thứ cấp',
        className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-none',
    },
    unsupported: {
        label: 'Chưa đủ căn cứ',
        className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-none',
    },
    conflicted: {
        label: 'Nguồn xung đột',
        className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-none',
    },
    unverified: {
        label: 'Chưa xác minh',
        className: 'bg-surface-container text-on-surface-variant border-none',
    },
}

function VerificationBadge({ status }: { status?: VerificationStatus }) {
    const meta = verificationBadgeMap[status || 'unverified']
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
            meta.className
        )}>
            <span className="h-1 w-1 rounded-full bg-current" />
            {meta.label}
        </span>
    )
}

function UploadZone() {
    const { status, progress, setFile, setStatus, setExtractedText, reset, error, setError, extractedText } = useUploadStore()
    const { setRisks, setDocument } = useAnalysisStore()
    const [isDragging, setIsDragging] = useState(false)

    const handleFile = useCallback(async (file: File) => {
        setFile(file)
        setStatus('uploading', 5)
        setError(null)
        const uploadToast = toast.loading(`Đang tải lên "${file.name}"...`)

        try {
            const api = initWorker()
            const arrayBuffer = await file.arrayBuffer()

            setStatus('uploading', 15)
            const fileHash = await api.generateHash(arrayBuffer)

            const { data: existingContract } = await supabase
                .from('contracts')
                .select('id, status, analysis_summary')
                .eq('content_hash', fileHash)
                .maybeSingle()

            if (existingContract) {
                setDocument(existingContract.id, true)
                const { data: existingRisks } = await supabase
                    .from('contract_risks')
                    .select('*')
                    .eq('contract_id', existingContract.id)

                if (existingRisks) setRisks(existingRisks as any)
                if (existingContract.status === 'completed') {
                    setStatus('success', 100)
                    toast.success('Đã tìm thấy bản phân tích cũ. Sẵn sàng xem ngay!', { id: uploadToast })
                    return
                }
            }

            setStatus('parsing', 30)
            toast.loading(`Đang trích xuất văn bản...`, { id: uploadToast })
            let text = ''
            if (file.name.endsWith('.pdf')) {
                text = await api.parsePDF(arrayBuffer)
            } else if (file.name.endsWith('.docx')) {
                text = await api.parseDocx(arrayBuffer)
            } else {
                text = await file.text()
            }

            setStatus('parsing', 60)
            setExtractedText(text)

            const validation = ContractSchema.safeParse({
                content: text,
                has_parties: text.toLowerCase().includes('bên a') || text.toLowerCase().includes('bên b')
            })

            if (!validation.success) {
                throw new Error(validation.error.issues[0].message)
            }

            const localAnalysis = classifySections(text)
            console.log('Local NLP Classification:', localAnalysis)

            const docId = existingContract?.id || crypto.randomUUID()
            setDocument(docId)
            setRisks([])

            if (!existingContract) {
                const user = await getCurrentUser()
                if (!user) throw new Error('Vui lòng đăng nhập để tiếp tục.')

                const { error: insertError } = await supabase.from('contracts').insert({
                    id: docId,
                    user_id: user.id,
                    title: file.name,
                    status: 'pending_audit',
                    content_hash: fileHash
                })
                if (insertError) throw insertError
            }

            setStatus('success', 100)
            toast.success('Đã trích xuất thành công!', { id: uploadToast })

            invokeEdgeFunction<{
                processed_chunks: number
                queued_chunks: number
                failed_chunks: number
                status: string
            }>('ingest-contract', {
                body: { contract_id: docId, text }
            }).then((data) => {
                console.log('Ingested chunks:', data?.processed_chunks, '/', data?.queued_chunks)
            }).catch((error) => {
                console.error('Ingestion failed:', error)
            })

        } catch (err) {
            console.error('Analysis failed:', err)
            setError((err as Error).message)
            setStatus('error', 0)
            toast.error(`Lỗi: ${(err as Error).message}`, { id: uploadToast })
        }
    }, [setFile, setStatus, setExtractedText, setDocument, setRisks, setError])

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
    }

    const resetAll = () => {
        reset()
        setRisks([])
        setDocument('', false)
    }

    if (status === 'idle' || status === 'uploading' || status === 'parsing' || status === 'error') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-surface">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    data-testid="upload-zone"
                    className={cn(
                        "w-full max-w-lg rounded-3xl p-16 text-center transition-all duration-500 cursor-pointer overflow-hidden relative group/upload shadow-sm",
                        isDragging
                            ? 'bg-primary/5 ring-2 ring-primary/30 ring-offset-8 ring-offset-surface'
                            : (status === 'error' ? 'bg-error-container text-on-error-container' : 'bg-surface-bright border border-outline/10 hover:shadow-2xl hover:border-primary/20')
                    )}
                    onClick={() => {
                        if (status === 'uploading' || status === 'parsing') return
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = '.pdf,.docx,.txt'
                        input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0]
                            if (file) handleFile(file)
                        }
                        input.click()
                    }}
                >
                    <div className="relative z-10">
                        <motion.div
                            animate={isDragging ? { y: [0, -10, 0] } : {}}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                            className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8 transition-colors group-hover/upload:bg-primary/20"
                        >
                            <Upload className="text-primary" size={32} />
                        </motion.div>
                        <Typography variant="h3" className="text-2xl mb-3 font-serif text-on-surface">Tải lên hợp đồng</Typography>
                        <Typography variant="body" className="text-on-surface-variant/70 mb-8 max-w-xs mx-auto leading-relaxed">
                            Bắt đầu đối soát văn bản quy chuẩn bằng trí tuệ nhân tạo chuyên sâu.
                        </Typography>

                        <div className="space-y-4 max-w-xs mx-auto">
                            <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className={cn(
                                        "h-full rounded-full transition-all duration-500",
                                        status === 'error' ? 'bg-error' : 'bg-primary'
                                    )}
                                />
                            </div>
                            <Typography variant="caption" className={cn(
                                "text-[10px] font-bold uppercase tracking-[0.2em]",
                                status === 'error' ? 'text-error' : 'text-on-surface-variant/50'
                            )}>
                                {status === 'error' ? (error || 'Lỗi xử lý') : (status === 'uploading' ? 'Đang tải file...' : (status === 'parsing' ? 'Đang trích xuất văn bản...' : 'Hỗ trợ PDF, DOCX (Tối đa 20MB)'))}
                            </Typography>
                        </div>
                    </div>
                </motion.div>

                {status === 'error' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Button variant="ghost" size="sm" className="mt-8 gap-2 text-error hover:bg-error/10" onClick={resetAll}>
                            Thử lại lần nữa
                        </Button>
                    </motion.div>
                )}
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="h-full flex flex-col p-8"
        >
            <div className="flex items-center gap-4 mb-8">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="text-primary" size={20} />
                </div>
                <div>
                    <Typography variant="h3" className="text-xl font-serif text-on-surface">Văn bản hợp đồng</Typography>
                    <Typography variant="caption" className="text-[10px] text-on-surface-variant/40 font-bold uppercase tracking-[0.1em]">Original Document</Typography>
                </div>
                <Button variant="ghost" size="sm" onClick={resetAll} className="ml-auto text-on-surface-variant/50 hover:text-primary transition-colors">Đổi tài liệu</Button>
            </div>
            <div className="flex-1 bg-surface-bright rounded-3xl border border-outline/5 p-10 overflow-y-auto custom-scrollbar shadow-sm relative group">
                <div className="font-sans text-[16px] text-on-surface/80 leading-loose whitespace-pre-wrap selection:bg-primary/10">
                    {extractedText}
                </div>
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            </div>
        </motion.div>
    )
}

function RiskPanel() {
    const navigate = useNavigate()
    const { risks, isAnalyzing, setRisks, startAnalysis, currentDocumentId, isHashMatch } = useAnalysisStore()
    const { status, setError, extractedText } = useUploadStore()

    // Supabase Realtime Subscription for status updates
    useEffect(() => {
        if (!currentDocumentId) return

        const channel = supabase
            .channel(`contract-${currentDocumentId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'contracts',
                    filter: `id=eq.${currentDocumentId}`
                },
                (payload) => {
                    console.log('Realtime status update:', payload.new.status)
                    if (payload.new.status === 'completed') {
                        supabase.from('contract_risks').select('*').eq('contract_id', currentDocumentId)
                            .then(({ data }) => {
                                if (data) {
                                    setRisks(data as any)
                                    toast.success('Deep Audit đã hoàn tất!')
                                }
                            })
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [currentDocumentId, setRisks])

    const [query, setQuery] = useState('')
    const [answer, setAnswer] = useState('')
    const [answerCitations] = useState<LegalCitation[]>([])
    const [answerVerification] = useState<VerificationStatus>('unverified')
    const [answerSummary] = useState<VerificationSummary | null>(null)
    const [answerAbstained] = useState(false)
    const [isSearching] = useState(false)
    const [expandedRisk, setExpandedRisk] = useState<number | null>(null)

    const handleDeepAudit = async () => {
        if (!extractedText) return
        startAnalysis()
        const auditToast = toast.loading('AI đang thực hiện Deep Audit (Llama-3-70B)...')
        try {
            const data = await invokeEdgeFunction<any>('risk-review', {
                body: { clause_text: extractedText.slice(0, 8000), mode: 'deep' }
            })
            setRisks(data.risks)
            toast.success('Phân tích chuyên sâu hoàn tất!', { id: auditToast })
        } catch (err) {
            console.error(err)
            setError('Lỗi phân tích chuyên sâu')
            toast.error('Lỗi khi thực hiện Deep Audit. Vui lòng thử lại.', { id: auditToast })
        }
    }

    const handleQA = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!query.trim() || !currentDocumentId) return

        // Route to AI Chat with Consultant Mode context
        navigate('/chat', {
            state: {
                initialMessage: query,
                contractText: extractedText,
                riskReport: risks,
                documentHash: currentDocumentId
            }
        })
    }

    if (status === 'idle' || status === 'uploading' || status === 'parsing' || status === 'error' || !currentDocumentId) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6 opacity-30">
                <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
                    <Shield className="text-on-surface-variant/40" size={32} strokeWidth={1} />
                </div>
                <Typography variant="caption" className="text-[10px] tracking-[.3em] uppercase font-bold text-on-surface-variant/40">
                    {status === 'error' ? 'Có lỗi xảy ra khi tải tài liệu' : 'Báo cáo rủi ro sẽ hiển thị tại đây'}
                </Typography>
            </div>
        )
    }

    if (status === 'success' && risks.length === 0 && !answer) {
        return (
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="h-full flex flex-col items-center justify-center p-8 text-center space-y-10"
            >
                <div className="relative">
                    <motion.div
                        animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
                        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                        className="absolute inset-0 bg-primary rounded-full blur-[60px]"
                    />
                    <div className="relative w-24 h-24 bg-surface-bright border border-outline/10 rounded-3xl flex items-center justify-center shadow-xl rotate-3">
                        {isHashMatch ? (
                            <Zap className="text-primary" size={48} />
                        ) : (
                            <Scale className="text-primary" size={48} />
                        )}
                    </div>
                </div>
                <div className="max-w-xs">
                    <Typography variant="h2" className="text-3xl font-serif mb-4 text-on-surface">
                        {isHashMatch ? 'Lịch sử tra cứu' : 'Kiểm tra quy chuẩn'}
                    </Typography>
                    <Typography variant="body" className="text-on-surface-variant/60 leading-relaxed text-sm">
                        {isHashMatch
                            ? 'Dữ liệu đối soát cho văn bản này đã có sẵn. Bạn có muốn xem lại?'
                            : 'AI đã sẵn sàng. Hãy kích hoạt Deep Audit để rà soát mọi quy định tương ứng.'}
                    </Typography>
                </div>
                <div className="w-full max-w-sm space-y-6">
                    <Button
                        variant="gold"
                        className="w-full h-14 bg-gradient-to-br from-lex-gold via-lex-gold/90 to-lex-gold/80 text-lex-midnight font-black text-base md:text-lg rounded-2xl md:rounded-3xl shadow-xl shadow-lex-gold/10 hover:shadow-lex-gold/20 hover:scale-[1.02] transition-all group border-0"
                        onClick={handleDeepAudit}
                        disabled={isAnalyzing}
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin mr-3" /> : <Zap className="mr-3 group-hover:scale-110 transition-transform fill-lex-midnight" size={20} />}
                        KÍCH HOẠT DEEP AUDIT
                    </Button>

                    <div className="relative">
                        <form onSubmit={handleQA} className="relative group">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Hỏi AI về hợp đồng này..."
                                className="w-full bg-surface-container/50 border border-outline/10 rounded-2xl py-5 pl-7 pr-16 text-sm focus:bg-surface-container-lowest focus:border-primary/30 outline-none transition-all shadow-sm"
                            />
                            <button
                                type="submit"
                                disabled={isSearching || !query.trim()}
                                aria-label="Gửi câu hỏi"
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-primary/10 rounded-xl text-primary hover:bg-primary hover:text-on-primary transition-all disabled:opacity-0"
                            >
                                {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                            </button>
                        </form>
                    </div>
                </div>
                <div className="flex items-center gap-2.5 text-[10px] text-on-surface-variant/30 uppercase tracking-[0.25em] font-bold">
                    <Info size={12} className="text-primary/40" />
                    <span>Gemini 2.5 Flash Lite Architecture</span>
                </div>
            </motion.div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="h-full flex flex-col p-8 bg-surface-container/30"
        >
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Typography variant="h3" className="text-sm uppercase tracking-[0.25em] text-primary font-bold">Đối soát rủi ro</Typography>
                    {isAnalyzing && (
                        <div className="flex gap-1.5">
                            <span className="w-1 h-1 bg-primary rounded-full animate-pulse [animation-duration:1s]" />
                            <span className="w-1 h-1 bg-primary rounded-full animate-pulse [animation-duration:1s] [animation-delay:0.2s]" />
                            <span className="w-1 h-1 bg-primary rounded-full animate-pulse [animation-duration:1s] [animation-delay:0.4s]" />
                        </div>
                    )}
                </div>
                {risks.length > 0 && (
                    <div className="px-3 py-1 bg-surface-container-highest rounded-full">
                        <Typography variant="caption" className="text-on-surface/60 font-bold uppercase tracking-wider text-[10px]">{risks.length} phát hiện</Typography>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 custom-scrollbar pr-2 pb-6">
                <AnimatePresence mode="popLayout">
                    {/* AI Answer Section */}
                    {answer && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-surface-bright border border-primary/10 rounded-3xl p-8 mb-6 relative overflow-hidden group shadow-xl"
                        >
                            <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setAnswer(''); setQuery(''); }} className="p-2 hover:bg-error/10 hover:text-error rounded-xl transition-all"><X size={18} /></button>
                            </div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                                    <Bot size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <Typography variant="subtitle" className="text-primary font-bold text-sm tracking-tight">Trợ lý Tra cứu</Typography>
                                    <VerificationBadge status={answerVerification} />
                                </div>
                            </div>
                            <Typography variant="body" className="text-[16px] text-on-surface leading-relaxed mb-8">{answer}</Typography>

                            {(answerAbstained || answerVerification === 'unsupported' || answerVerification === 'conflicted') && (
                                <div className={cn(
                                    "mb-6 rounded-2xl px-5 py-4 border-l-4",
                                    answerAbstained || answerVerification === 'unsupported'
                                        ? 'bg-error-container/30 border-error text-on-error-container'
                                        : 'bg-amber-500/5 border-amber-500 text-on-surface'
                                )}>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1 opacity-60">
                                        {answerAbstained || answerVerification === 'unsupported' ? 'Hạn chế dữ liệu' : 'Cần lưu ý'}
                                    </div>
                                    <div className="text-sm leading-relaxed font-medium">
                                        {answerAbstained || answerVerification === 'unsupported'
                                            ? 'Phản hồi này chưa được đối chiếu hoàn toàn với các văn bản pháp luật hiện hành.'
                                            : 'Có sự mâu thuẫn nhẹ giữa các nguồn thông tin, cần sự rà soát của luật sư.'}
                                    </div>
                                </div>
                            )}

                            {answerSummary && (
                                <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    {[
                                        { label: 'Dẫn chứng', val: answerSummary.citation_count, color: 'text-on-surface' },
                                        { label: 'Chính thống', val: answerSummary.official_count, color: 'text-emerald-600 dark:text-emerald-400' },
                                        { label: 'Tham khảo', val: answerSummary.secondary_count, color: 'text-amber-600 dark:text-amber-400' },
                                        { label: 'Chưa xác thực', val: answerSummary.unsupported_claim_count, color: 'text-error' }
                                    ].map((stat, i) => (
                                        <div key={i} className="rounded-2xl bg-surface-container/40 p-4 border border-outline/5">
                                            <div className="text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/40 font-bold mb-1">{stat.label}</div>
                                            <div className={cn("text-xl font-bold", stat.color)}>{stat.val}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {answerCitations.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-primary/50">
                                        <CheckCircle2 size={12} />
                                        Cơ sở quy chuẩn
                                    </div>
                                    <div className="grid gap-3">
                                        {answerCitations.map((citation, idx) => (
                                            <a
                                                key={`${citation.citation_url}-${idx}`}
                                                href={citation.citation_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group/cit block rounded-2xl bg-surface-container/20 p-5 transition-all hover:bg-surface-container/40 hover:shadow-md"
                                            >
                                                <div className="flex items-start justify-between gap-4 mb-2">
                                                    <div className="text-sm font-bold text-on-surface group-hover/cit:text-primary transition-colors">{citation.citation_text}</div>
                                                    <VerificationBadge status={citation.verification_status} />
                                                </div>
                                                <div className="text-xs text-on-surface-variant/70 leading-relaxed mb-4 line-clamp-2">
                                                    {citation.source_excerpt}
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-on-surface-variant/40 uppercase">
                                                    <span>{citation.source_domain}</span>
                                                    <ExternalLink size={12} className="opacity-0 group-hover/cit:opacity-100 transition-opacity" />
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {isAnalyzing && risks.length === 0 && (
                        [1, 2, 3].map(i => (
                            <div key={i} className="space-y-4 p-8 bg-surface-container-lowest rounded-3xl border border-outline/5">
                                <div className="flex justify-between items-center">
                                    <Skeleton width={120} height={24} className="rounded-lg" />
                                    <Skeleton width={100} height={20} className="rounded-full" />
                                </div>
                                <Skeleton width="100%" height={20} className="rounded-lg" />
                                <Skeleton width="70%" height={20} className="rounded-lg opacity-60" />
                                <div className="pt-4 mt-4 border-t border-outline/5">
                                    <Skeleton width="40%" height={16} className="rounded-md" />
                                </div>
                            </div>
                        ))
                    )}

                    {risks.map((r, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-surface-container-lowest border border-outline/5 rounded-3xl p-8 hover:shadow-2xl hover:border-primary/20 transition-all duration-500 group relative"
                        >
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <RiskBadge level={r.level} />
                                    <VerificationBadge status={r.verification_status} />
                                </div>
                                <div className="px-2.5 py-1 rounded bg-primary/5 text-primary text-[10px] font-bold font-mono tracking-wider">
                                    {r.clause_ref || 'GENERAL'}
                                </div>
                            </div>

                            <Typography variant="body" className="text-[15px] leading-relaxed text-on-surface/80 group-hover:text-on-surface transition-colors mb-6">{r.description}</Typography>

                            {r.risk_quote && (
                                <div className="p-6 rounded-2xl bg-surface-container/30 border-l-4 border-primary/20 mb-6 group/quote">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/40 mb-3">Đoạn trích rủi ro</div>
                                    <div className="text-[14px] italic text-on-surface/70 font-serif leading-relaxed">
                                        "{r.risk_quote}"
                                    </div>
                                </div>
                            )}

                            {r.suggested_revision && (
                                <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 mb-6 group/rev">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-600/60 dark:text-emerald-400/60">Đề xuất chỉnh sửa</div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(r.suggested_revision || '')
                                                toast.success('Đã sao chép đề xuất!')
                                            }}
                                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-4 uppercase font-bold tracking-widest"
                                        >
                                            Sao chép
                                        </button>
                                    </div>
                                    <div className="text-sm text-on-surface/90 leading-relaxed font-medium">
                                        {r.suggested_revision}
                                    </div>
                                </div>
                            )}

                            {r.citation && (
                                <div className="pt-6 border-t border-outline/5">
                                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.25em] transition-colors">
                                        <AlertTriangle size={14} className="text-primary/60" />
                                        <span className="text-on-surface-variant/40">Căn cứ:</span>
                                        {r.citation_url ? (
                                            <a
                                                href={r.citation_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline underline-offset-4 flex items-center gap-1 transition-all"
                                            >
                                                {r.citation}
                                                <ExternalLink size={10} />
                                            </a>
                                        ) : (
                                            <span className="text-on-surface-variant/50">{r.citation}</span>
                                        )}
                                    </div>

                                    {(r.source_title || r.source_excerpt) && (
                                        <div className="mt-6 rounded-2xl bg-surface-container/20 p-5 border border-outline/5">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedRisk(expandedRisk === idx ? null : idx)}
                                                className="flex w-full items-center justify-between gap-4 text-left group/ev"
                                            >
                                                <div className="space-y-1">
                                                    <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/30">Evidence</div>
                                                    <div className="text-xs font-bold text-on-surface group-hover/ev:text-primary transition-colors">
                                                        {r.source_title || r.evidence?.title || "Legal Source Information"}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                                                    {expandedRisk === idx ? 'Thu gọn' : 'Chi tiết'}
                                                </span>
                                            </button>
                                            {expandedRisk === idx && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    className="mt-4 pt-4 border-t border-outline/5"
                                                >
                                                    <div className="text-xs leading-relaxed text-on-surface-variant/70 mb-4">
                                                        {r.source_excerpt || r.evidence?.content?.slice(0, 320)}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                                                        <span>{r.source_domain || r.evidence?.source_domain}</span>
                                                        {r.retrieved_at && <span>{new Date(r.retrieved_at).toLocaleDateString('vi-VN')}</span>}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Q&A Input Bar at Bottom */}
            {
                (status === 'success' || risks.length > 0) && (
                    <div className="mt-6 pt-6 border-t border-outline/5">
                        <form onSubmit={handleQA} className="relative group/qa">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Hỏi AI sâu hơn về văn bản này..."
                                className="w-full bg-surface-container-lowest/50 border border-outline/10 rounded-2xl py-5 pl-7 pr-16 text-sm focus:bg-surface-container-lowest focus:border-primary/20 outline-none transition-all placeholder:text-on-surface-variant/30 shadow-sm"
                            />
                            <button
                                type="submit"
                                disabled={isSearching || !query.trim()}
                                aria-label="Gửi câu hỏi"
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-primary text-on-primary rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-20 shadow-lg shadow-primary/10"
                            >
                                {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                            </button>
                        </form>
                    </div>
                )
            }
        </motion.div >
    )
}

function Scale(props: any) {
    return <Zap {...props} />
}

export function ContractAnalysis() {
    const { clearRisks } = useAnalysisStore()
    const { status } = useUploadStore()

    // Clear analysis on initial mount if not in a success state
    useEffect(() => {
        if (status === 'idle' || status === 'error') {
            clearRisks()
        }
    }, [status, clearRisks])

    return (
        <SplitView
            ratio="55/45"
            left={<UploadZone />}
            right={<RiskPanel />}
            className="h-full"
        />
    )
}

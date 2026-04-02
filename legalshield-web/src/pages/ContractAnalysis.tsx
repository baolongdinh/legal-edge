import { useCallback, useState, useEffect } from 'react'
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

interface RiskClause {
    clause_ref: string
    level: 'critical' | 'moderate' | 'note'
    description: string
    risk_quote?: string
    suggested_revision?: string
    citation: string
    citation_url?: string
    source_title?: string
    source_excerpt?: string
    source_domain?: string
    retrieved_at?: string
    verification_status?: VerificationStatus
    evidence?: any
}

interface ClaimAudit {
    claim: string
    supported: boolean
    matched_citation_url?: string
    matched_source_domain?: string
    score?: number
}

const verificationBadgeMap: Record<VerificationStatus, { label: string; className: string }> = {
    official_verified: {
        label: 'Đã xác minh',
        className: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
    },
    secondary_verified: {
        label: 'Nguồn thứ cấp',
        className: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
    },
    unsupported: {
        label: 'Chưa đủ căn cứ',
        className: 'bg-rose-500/10 text-rose-300 border border-rose-500/20',
    },
    conflicted: {
        label: 'Nguồn xung đột',
        className: 'bg-orange-500/10 text-orange-300 border border-orange-500/20',
    },
    unverified: {
        label: 'Chưa xác minh',
        className: 'bg-slate-500/10 text-slate-300 border border-slate-500/20',
    },
}

function VerificationBadge({ status }: { status?: VerificationStatus }) {
    const meta = verificationBadgeMap[status || 'unverified']
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${meta.className}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
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
            <div className="h-full flex flex-col items-center justify-center p-8 bg-grid">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    data-testid="upload-zone"
                    className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-300 cursor-pointer overflow-hidden relative group/upload ${isDragging
                        ? 'border-gold-primary bg-gold-primary/10 scale-102 shadow-gold'
                        : (status === 'error' ? 'border-red-500/50 bg-red-500/5' : 'border-slate-border/50 bg-navy-elevated/40 hover:border-gold-muted hover:bg-navy-elevated/60 shadow-xl')
                        }`}
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
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="w-16 h-16 bg-gold-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-gold-primary/20 group-hover/upload:border-gold-primary/40 transition-colors"
                        >
                            <Upload className="text-gold-primary" size={32} />
                        </motion.div>
                        <Typography variant="h3" className="text-xl mb-2 font-serif">Tải lên hợp đồng</Typography>
                        <Typography variant="body" className="text-paper-dark/50 mb-8 max-w-sm mx-auto">AI sẽ tự động bóc tách các điều khoản và đánh giá rủi ro pháp lý cho bạn.</Typography>

                        <div className="space-y-4 max-w-xs mx-auto">
                            <div className="h-1.5 bg-slate-border/30 rounded-full overflow-hidden shadow-inner">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className={`h-full rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-gold-muted to-gold-primary shadow-gold'}`}
                                />
                            </div>
                            <Typography variant="caption" className={`text-xs font-bold uppercase tracking-widest ${status === 'error' ? 'text-red-400' : 'text-paper-dark/40'}`}>
                                {status === 'error' ? (error || 'Lỗi xử lý') : (status === 'uploading' ? 'Đang tải file...' : (status === 'parsing' ? 'Đang giải mã văn bản...' : 'Chấp nhận PDF, DOCX tối đa 20MB'))}
                            </Typography>
                        </div>
                    </div>
                    {/* Background glow effects */}
                    <div className="absolute -top-24 -left-24 w-48 h-48 bg-gold-primary/5 blur-[100px] rounded-full" />
                    <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-gold-primary/5 blur-[100px] rounded-full" />
                </motion.div>

                {status === 'error' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <Button variant="ghost" size="sm" className="mt-8 gap-2 text-red-400 hover:bg-red-400/5 border-red-400/20" onClick={resetAll}>
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
            className="h-full flex flex-col p-6 animate-fade-in"
        >
            <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-gold-primary/10 flex items-center justify-center border border-gold-primary/20">
                    <FileText className="text-gold-primary" size={18} />
                </div>
                <Typography variant="h3" className="text-lg font-serif">Văn bản hợp đồng</Typography>
                <Button variant="ghost" size="sm" onClick={resetAll} className="ml-auto text-paper-dark/40 hover:text-paper-dark">Đổi tài liệu</Button>
            </div>
            <div className="flex-1 bg-navy-elevated/40 backdrop-blur-sm rounded-xl border border-slate-border/30 p-8 overflow-y-auto custom-scrollbar shadow-inner relative group">
                <div className="font-sans text-[15px] text-paper-dark/80 leading-8 whitespace-pre-wrap selection:bg-gold-primary/20">
                    {extractedText}
                </div>
                {/* Visual anchor for start of text */}
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-gold-primary/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </motion.div>
    )
}

function RiskPanel() {
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
    const [answerCitations, setAnswerCitations] = useState<LegalCitation[]>([])
    const [answerVerification, setAnswerVerification] = useState<VerificationStatus>('unverified')
    const [answerSummary, setAnswerSummary] = useState<VerificationSummary | null>(null)
    const [answerClaimAudit, setAnswerClaimAudit] = useState<ClaimAudit[]>([])
    const [answerAbstained, setAnswerAbstained] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const [sources, setSources] = useState<any[]>([])
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

        setIsSearching(true)
        setAnswer('')
        setAnswerCitations([])
        setAnswerSummary(null)
        setAnswerVerification('unverified')
        setAnswerClaimAudit([])
        setAnswerAbstained(false)
        try {
            const data = await invokeEdgeFunction<any>('contract-qa', {
                body: { contract_id: currentDocumentId, query }
            })
            setAnswer(data.answer)
            setAnswerCitations(data.citations || [])
            setAnswerSummary(data.verification_summary || null)
            setAnswerVerification(data.verification_status || 'unverified')
            setAnswerClaimAudit(data.claim_audit || [])
            setAnswerAbstained(Boolean(data.abstained))
            setSources(data.sources || [])
        } catch (err) {
            console.error(err)
            toast.error('AI không thể trả lời câu hỏi này. Thử hỏi cách khác.')
        } finally {
            setIsSearching(false)
        }
    }

    if (status === 'idle' || status === 'uploading' || status === 'parsing' || status === 'error' || !currentDocumentId) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 opacity-30">
                <Shield className="text-paper-dark/20" size={48} strokeWidth={1} />
                <Typography variant="caption" className="text-xs tracking-[.3em] uppercase font-bold text-paper-dark/40">
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
                className="h-full flex flex-col items-center justify-center p-8 text-center space-y-8"
            >
                <div className="relative">
                    <motion.div
                        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ repeat: Infinity, duration: 3 }}
                        className="absolute inset-0 bg-gold-primary rounded-full blur-[40px]"
                    />
                    <div className="relative w-20 h-20 bg-navy-elevated border border-gold-primary/20 rounded-full flex items-center justify-center shadow-2xl">
                        {isHashMatch ? (
                            <Zap className="text-gold-primary" size={40} />
                        ) : (
                            <Scale className="text-gold-primary" size={40} />
                        )}
                    </div>
                </div>
                <div className="max-w-xs">
                    <Typography variant="h2" className="text-2xl font-serif mb-3">
                        {isHashMatch ? 'Đã tìm thấy bản cũ' : 'Sẵn sàng kiểm tra'}
                    </Typography>
                    <Typography variant="body" className="text-paper-dark/50 leading-relaxed">
                        {isHashMatch
                            ? 'Dữ liệu phân tích cho hợp đồng này đã có sẵn trong hệ thống.'
                            : 'Văn bản đã sẵn sàng. Bạn muốn AI thực hiện quét rủi ro chuyên sâu hay trả lời câu hỏi cụ thể?'}
                    </Typography>
                </div>
                <div className="w-full max-w-sm space-y-4">
                    <Button
                        variant="primary"
                        className="w-full h-14 bg-gold-primary text-navy-base font-bold text-lg shadow-gold group"
                        onClick={handleDeepAudit}
                        disabled={isAnalyzing}
                    >
                        {isAnalyzing ? <Loader2 className="animate-spin mr-2" /> : <Zap className="mr-2 group-hover:scale-125 transition-transform" size={20} />}
                        Kích hoạt Deep Audit
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 bg-gold-primary/5 blur-xl rounded-full" />
                        <form onSubmit={handleQA} className="relative">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Hỏi AI về hợp đồng này..."
                                className="w-full bg-navy-elevated/80 border border-slate-border/50 rounded-2xl py-4 pl-6 pr-14 text-sm focus:border-gold-primary/50 outline-none backdrop-blur-md transition-all shadow-xl"
                            />
                            <button
                                type="submit"
                                disabled={isSearching || !query.trim()}
                                aria-label="Gửi câu hỏi"
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-gold-primary/10 rounded-xl text-gold-primary hover:bg-gold-primary hover:text-navy-base transition-all disabled:opacity-0"
                            >
                                {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                            </button>
                        </form>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-paper-dark/30 uppercase tracking-[0.2em] font-bold">
                    <Info size={10} />
                    <span>Llama-3-70B Quantum Optimized</span>
                </div>
            </motion.div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="h-full flex flex-col p-6"
        >
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Typography variant="h3" className="text-base uppercase tracking-widest text-gold-primary font-bold">Báo cáo rủi ro</Typography>
                    {isAnalyzing && (
                        <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-bounce" />
                        </div>
                    )}
                </div>
                {risks.length > 0 && <Typography variant="caption" className="text-paper-dark/40 font-bold uppercase tracking-tighter">{risks.length} phát hiện</Typography>}
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 custom-scrollbar pr-2 pb-6">
                <AnimatePresence mode="popLayout">
                    {/* AI Answer Section */}
                    {answer && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-gold-primary/5 border border-gold-primary/20 rounded-2xl p-6 mb-4 relative overflow-hidden group shadow-2xl"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-30 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setAnswer(''); setQuery(''); }} className="p-1 hover:text-red-400"><X size={16} /></button>
                            </div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 bg-gold-primary text-navy-base rounded-lg flex items-center justify-center shadow-lg shadow-gold/20">
                                    <Bot size={18} />
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Typography variant="subtitle" className="text-gold-primary font-bold">Phản hồi từ AI Context</Typography>
                                    <VerificationBadge status={answerVerification} />
                                </div>
                            </div>
                            <Typography variant="body" className="text-[15px] text-paper-dark/90 leading-relaxed mb-6">{answer}</Typography>
                            {(answerAbstained || answerVerification === 'unsupported' || answerVerification === 'conflicted') && (
                                <div className={`mb-5 rounded-xl border px-4 py-3 ${answerAbstained || answerVerification === 'unsupported'
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                    : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                                    }`}>
                                    <div className="text-[11px] font-bold uppercase tracking-[0.2em]">
                                        {answerAbstained || answerVerification === 'unsupported' ? 'Chưa đủ căn cứ' : 'Cần kiểm tra thêm'}
                                    </div>
                                    <div className="mt-1 text-sm leading-relaxed">
                                        {answerAbstained || answerVerification === 'unsupported'
                                            ? 'Phản hồi này chưa có đủ dẫn chứng pháp lý đáng tin cậy để khẳng định chắc chắn.'
                                            : 'Một phần nhận định pháp lý chưa được đối chiếu đủ mạnh với nguồn hiện có.'}
                                    </div>
                                </div>
                            )}
                            {answerSummary && (
                                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <div className="rounded-xl border border-slate-border/20 bg-navy-base/30 p-3">
                                        <div className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Citation</div>
                                        <div className="mt-1 text-lg font-semibold text-paper-dark">{answerSummary.citation_count}</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-border/20 bg-navy-base/30 p-3">
                                        <div className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Official</div>
                                        <div className="mt-1 text-lg font-semibold text-emerald-300">{answerSummary.official_count}</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-border/20 bg-navy-base/30 p-3">
                                        <div className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Secondary</div>
                                        <div className="mt-1 text-lg font-semibold text-amber-300">{answerSummary.secondary_count}</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-border/20 bg-navy-base/30 p-3">
                                        <div className="text-[10px] uppercase tracking-[0.18em] text-paper-dark/35">Unsupported</div>
                                        <div className="mt-1 text-lg font-semibold text-rose-300">{answerSummary.unsupported_claim_count}</div>
                                    </div>
                                </div>
                            )}
                            {answerClaimAudit.some((claim) => !claim.supported) && (
                                <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">Claim Cần Kiểm Tra Thêm</div>
                                    <div className="mt-3 space-y-2">
                                        {answerClaimAudit
                                            .filter((claim) => !claim.supported)
                                            .slice(0, 3)
                                            .map((claim, idx) => (
                                                <div key={`${claim.claim}-${idx}`} className="rounded-lg border border-amber-500/10 bg-navy-base/30 px-3 py-2">
                                                    <div className="text-sm text-paper-dark/85">{claim.claim}</div>
                                                    <div className="mt-1 text-[11px] text-paper-dark/45">
                                                        {claim.matched_source_domain
                                                            ? `Nguồn gần nhất: ${claim.matched_source_domain}`
                                                            : 'Chưa tìm thấy nguồn khớp đủ mạnh'}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                            {answerCitations.length > 0 && (
                                <div className="mb-5 rounded-2xl border border-gold-primary/10 bg-navy-base/35 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-muted/70">
                                        <CheckCircle2 size={12} />
                                        Dẫn chứng pháp lý
                                    </div>
                                    <div className="space-y-3">
                                        {answerCitations.map((citation, idx) => (
                                            <a
                                                key={`${citation.citation_url}-${idx}`}
                                                href={citation.citation_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block rounded-xl border border-slate-border/20 bg-navy-base/40 p-4 transition-colors hover:border-gold-primary/30"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold text-gold-primary">{citation.citation_text}</div>
                                                        <div className="mt-1 text-xs text-paper-dark/45">{citation.source_title}</div>
                                                    </div>
                                                    <VerificationBadge status={citation.verification_status} />
                                                </div>
                                                <div className="mt-2 text-xs leading-relaxed text-paper-dark/60">{citation.source_excerpt}</div>
                                                <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-paper-dark/45">
                                                    {citation.source_domain}
                                                    <ExternalLink size={11} />
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {sources.length > 0 && (
                                <div className="pt-4 border-t border-gold-primary/10 space-y-3">
                                    <div className="flex items-center gap-2 text-[10px] text-gold-muted/60 uppercase tracking-widest font-bold">
                                        <CheckCircle2 size={12} />
                                        Nguồn tham chiếu
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {sources.slice(0, 2).map((s, idx) => (
                                            <div key={idx} className="text-[11px] text-paper-dark/40 italic bg-navy-base/40 p-3 rounded-xl border border-gold-primary/5 leading-normal line-clamp-3">
                                                "{s.content}"
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {isAnalyzing && risks.length === 0 && (
                        [1, 2, 3].map(i => (
                            <div key={i} className="space-y-3 p-5 bg-navy-elevated/20 rounded-2xl border border-slate-border/20">
                                <div className="flex justify-between">
                                    <Skeleton width={80} height={20} className="rounded" />
                                    <Skeleton width={100} height={16} className="rounded" />
                                </div>
                                <Skeleton width="100%" height={16} className="rounded" />
                                <Skeleton width="80%" height={16} className="rounded opacity-60" />
                            </div>
                        ))
                    )}

                    {risks.map((r, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-navy-elevated/40 backdrop-blur-sm border border-slate-border/30 rounded-2xl p-6 hover:border-gold-primary/30 hover:shadow-xl transition-all duration-300 group relative"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <RiskBadge level={r.level} />
                                    <VerificationBadge status={r.verification_status} />
                                </div>
                                <Typography variant="caption" className="text-gold-muted font-mono text-[10px] bg-gold-primary/5 px-2 py-0.5 rounded tracking-tighter">
                                    {r.clause_ref || 'GENERAL'}
                                </Typography>
                            </div>
                            <Typography variant="body" className="text-[14px] leading-relaxed text-paper-dark/80 group-hover:text-paper-dark transition-colors">{r.description}</Typography>
                            {r.risk_quote && (
                                <div className="mt-4 p-4 rounded-xl bg-navy-base/50 border-l-2 border-gold-primary/30 relative group/quote">
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-gold-muted/50 mb-2">Đoạn trích rủi ro</div>
                                    <div className="text-sm italic text-paper-dark/70 font-serif leading-relaxed">
                                        "{r.risk_quote}"
                                    </div>
                                </div>
                            )}

                            {r.suggested_revision && (
                                <div className="mt-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 relative group/rev">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">Đề xuất chỉnh sửa</div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(r.suggested_revision || '')
                                                toast.success('Đã sao chép đề xuất!')
                                            }}
                                            className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors uppercase font-bold tracking-tighter"
                                        >
                                            Sao chép
                                        </button>
                                    </div>
                                    <div className="text-sm text-emerald-100/90 leading-relaxed font-sans">
                                        {r.suggested_revision}
                                    </div>
                                </div>
                            )}
                            {r.citation && (
                                <div className="mt-4 pt-4 border-t border-slate-border/20">
                                    <div className="flex items-center gap-2 text-[10px] text-gold-muted/60 font-bold uppercase tracking-widest italic group-hover:text-gold-primary transition-colors">
                                        <AlertTriangle size={12} className="text-gold-primary" />
                                        Căn cứ: {r.citation_url ? (
                                            <a
                                                href={r.citation_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-gold-primary hover:text-gold-muted underline underline-offset-4 decoration-gold-primary/50 hover:decoration-gold-primary transition-all cursor-pointer pointer-events-auto"
                                            >
                                                {r.citation}
                                                <ExternalLink size={10} />
                                            </a>
                                        ) : (
                                            <span className="text-paper-dark/40">{r.citation}</span>
                                        )}
                                    </div>
                                    {(r.source_title || r.source_excerpt) && (
                                        <div className="mt-4 rounded-xl border border-slate-border/20 bg-navy-base/30 p-4">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedRisk(expandedRisk === idx ? null : idx)}
                                                className="flex w-full items-center justify-between gap-3 text-left"
                                            >
                                                <div>
                                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-paper-dark/35">Evidence</div>
                                                    <div className="mt-1 text-sm font-semibold text-paper-dark">{r.source_title || r.evidence?.title}</div>
                                                </div>
                                                <span className="text-xs text-gold-primary">{expandedRisk === idx ? 'Thu gọn' : 'Xem chi tiết'}</span>
                                            </button>
                                            {expandedRisk === idx && (
                                                <div className="mt-4 space-y-3">
                                                    <div className="text-xs leading-relaxed text-paper-dark/65">
                                                        {r.source_excerpt || r.evidence?.content?.slice(0, 320)}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-paper-dark/45">
                                                        <span>{r.source_domain || r.evidence?.source_domain}</span>
                                                        {r.retrieved_at && <span>Retrieved: {new Date(r.retrieved_at).toLocaleString('vi-VN')}</span>}
                                                        {r.evidence?.matched_article && <span>{r.evidence.matched_article}</span>}
                                                    </div>
                                                </div>
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
                    <div className="mt-4 pt-4 border-t border-slate-border/20">
                        <form onSubmit={handleQA} className="relative group">
                            <div className="absolute inset-0 bg-gold-primary/5 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Hỏi AI thêm về hợp đồng này..."
                                className="w-full bg-navy-base/80 border border-slate-border/50 rounded-2xl py-4 pl-6 pr-14 text-sm focus:border-gold-primary/50 outline-none backdrop-blur-md transition-all placeholder:text-paper-dark/30 shadow-inner"
                            />
                            <button
                                type="submit"
                                disabled={isSearching || !query.trim()}
                                aria-label="Gửi câu hỏi thêm"
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-gold-primary text-navy-base rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-20 shadow-gold"
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

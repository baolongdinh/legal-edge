import { useCallback, useState, useEffect } from 'react'
import * as Comlink from 'comlink'
import { Upload, FileText, Search, Send, Loader2, Zap } from 'lucide-react'
import { SplitView } from '../components/layout/SplitView'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Typography } from '../components/ui/Typography'
import { Button } from '../components/ui/Button'
import { useUploadStore, useAnalysisStore } from '../store'
import { supabase } from '../lib/supabase'
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

function UploadZone() {
    const { status, progress, setFile, setStatus, setExtractedText, reset, error, setError, extractedText } = useUploadStore()
    const { setRisks, setDocument } = useAnalysisStore()
    const [isDragging, setIsDragging] = useState(false)

    const handleFile = useCallback(async (file: File) => {
        setFile(file)
        setStatus('uploading', 5)
        setError(null)

        try {
            const api = initWorker()
            const arrayBuffer = await file.arrayBuffer()

            // 0. Compute Content Hash in Worker (Deduplication)
            setStatus('uploading', 15)
            const fileHash = await api.generateHash(arrayBuffer)

            // 1. Hash-First Strategy: Check Supabase for existing analysis
            const { data: existingContract } = await supabase
                .from('contracts')
                .select('document_id, status, analysis_summary')
                .eq('content_hash', fileHash)
                .maybeSingle()

            if (existingContract) {
                setDocument(existingContract.document_id, true)

                // Load existing risks
                const { data: existingRisks } = await supabase
                    .from('risks')
                    .select('*')
                    .eq('contract_id', existingContract.document_id)

                if (existingRisks) setRisks(existingRisks)

                // If it's already analyzed, we are done
                if (existingContract.status === 'completed') {
                    setStatus('success', 100)
                    return
                }
            }

            // 2. Client-side Parsing in Worker (Zero UI Lag)
            setStatus('parsing', 30)
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

            // 3. Edge-First Validation (Zod)
            const validation = ContractSchema.safeParse({
                content: text,
                has_parties: text.toLowerCase().includes('bên a') || text.toLowerCase().includes('bên b')
            })

            if (!validation.success) {
                throw new Error(validation.error.issues[0].message)
            }

            // 4. Lazy AI - Local Classification (Free)
            const localAnalysis = classifySections(text)
            console.log('Local NLP Classification:', localAnalysis)

            // 5. Register Document & Set to 'pending_audit'
            const docId = existingContract?.document_id || crypto.randomUUID()
            setDocument(docId)
            setRisks([]) // Clear previous risks for Lazy UI

            if (!existingContract) {
                const { error: insertError } = await supabase.from('contracts').insert({
                    document_id: docId,
                    title: file.name,
                    status: 'pending_audit',
                    content_hash: fileHash
                })
                if (insertError) throw insertError
            }

            setStatus('success', 100)

            // 6. Background Ingestion (Hybrid Search Indexing)
            supabase.functions.invoke('ingest-contract', {
                body: { contract_id: docId, text }
            }).then(({ data, error }) => {
                if (error) console.error('Ingestion failed:', error)
                else console.log('Ingested chunks:', data?.count)
            })

        } catch (err) {
            console.error('Analysis failed:', err)
            setError((err as Error).message)
            setStatus('error', 0)
        }
    }, [setFile, setStatus, setExtractedText, setDocument, setRisks, setError])

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
    }

    if (status === 'idle' || status === 'uploading' || status === 'parsing' || status === 'error') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8">
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`w-full max-w-md border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer ${isDragging ? 'border-gold-primary bg-gold-primary/10' : (status === 'error' ? 'border-red-500/50 bg-red-500/5' : 'border-slate-border hover:border-gold-muted')
                        }`}
                    onClick={() => {
                        if (status === 'uploading' || status === 'parsing') return
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = '.pdf,.docx'
                        input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0]
                            if (file) handleFile(file)
                        }
                        input.click()
                    }}
                >
                    <Upload className="mx-auto text-gold-primary mb-4" size={32} />
                    <Typography variant="h3" className="text-base mb-2">Tải lên hợp đồng</Typography>
                    <Typography variant="subtitle" className="text-sm mb-4">Kéo thả hoặc nhấp để chọn file PDF, DOCX</Typography>
                    <div className="mt-4">
                        <div className="h-1.5 bg-slate-border rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-gold-primary'}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <Typography variant="caption" className={`mt-2 block ${status === 'error' ? 'text-red-400' : ''}`}>
                            {status === 'error' ? (error || 'Đã có lỗi xảy ra') : (status === 'uploading' ? 'Đang tải lên...' : (status === 'parsing' ? 'Đang phân tích...' : ''))}
                        </Typography>
                    </div>
                </div>
                {status === 'error' && (
                    <Button variant="ghost" size="sm" className="mt-4" onClick={reset}>Thử lại</Button>
                )}
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
                <FileText className="text-gold-primary" size={20} />
                <Typography variant="h3" className="text-base">Nội dung trích xuất</Typography>
                <Button variant="outline" size="sm" onClick={reset} className="ml-auto">Tải file khác</Button>
            </div>
            <div className="flex-1 bg-navy-base/30 rounded-lg border border-slate-border p-6 overflow-y-auto custom-scrollbar">
                <div className="font-sans text-sm text-paper-dark leading-7 whitespace-pre-wrap">
                    {extractedText}
                </div>
            </div>
        </div>
    )
}

function RiskPanel() {
    const { risks, isAnalyzing, setRisks, startAnalysis, currentDocumentId, isHashMatch } = useAnalysisStore()
    const { status, setStatus, setError, extractedText } = useUploadStore()

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
                    filter: `document_id=eq.${currentDocumentId}`
                },
                (payload) => {
                    console.log('Realtime status update:', payload.new.status)
                    if (payload.new.status === 'completed') {
                        // Refresh risks if needed
                        supabase.from('risks').select('*').eq('contract_id', currentDocumentId)
                            .then(({ data }) => data && setRisks(data))
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [currentDocumentId, setRisks])

    // Q&A State
    const [query, setQuery] = useState('')
    const [answer, setAnswer] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [sources, setSources] = useState<any[]>([])

    const handleDeepAudit = async () => {
        if (!extractedText) return
        startAnalysis()
        setStatus('parsing', 50)
        try {
            const { data, error } = await supabase.functions.invoke('risk-review', {
                body: { clause_text: extractedText.slice(0, 8000), mode: 'deep' }
            })
            if (error) throw error
            setRisks(data.risks)
            setStatus('success', 100)
        } catch (err) {
            console.error(err)
            setError('Lỗi phân tích chuyên sâu')
            setStatus('error', 0)
        }
    }

    const handleQA = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!query.trim() || !currentDocumentId) return

        setIsSearching(true)
        setAnswer('')
        try {
            const { data, error } = await supabase.functions.invoke('contract-qa', {
                body: { contract_id: currentDocumentId, query }
            })
            if (error) throw error
            setAnswer(data.answer)
            setSources(data.sources || [])
        } catch (err) {
            console.error(err)
            setAnswer('Lỗi khi tìm câu trả lời. Vui lòng thử lại.')
        } finally {
            setIsSearching(false)
        }
    }

    if (status === 'success' && risks.length === 0 && !answer) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-6">
                <div className="w-16 h-16 bg-gold-primary/10 rounded-full flex items-center justify-center">
                    {isHashMatch ? (
                        <Zap className="text-gold-primary animate-pulse" size={32} />
                    ) : (
                        <FileText className="text-gold-primary" size={32} />
                    )}
                </div>
                <div className="max-w-xs">
                    <Typography variant="h3" className="mb-2">
                        {isHashMatch ? 'Đã nhận diện hợp đồng' : 'Sẵn sàng phân tích rủi ro'}
                    </Typography>
                    <Typography variant="body" className="text-slate-400">
                        {isHashMatch
                            ? 'File này đã được phân tích trước đó. Bạn có thể xem lại ngay lập tức hoặc yêu cầu Deep Audit mới.'
                            : 'Nội dung đã được bóc tách locally. Bạn có muốn kích hoạt Deep Audit (Llama-3-70B) hoặc đặt câu hỏi cho AI?'}
                    </Typography>
                </div>
                <div className="w-full space-y-3">
                    <Button
                        variant="primary"
                        className="w-full bg-gold-primary text-black font-bold h-12 shadow-gold"
                        onClick={handleDeepAudit}
                    >
                        Bắt đầu Deep Audit
                    </Button>

                    <div className="relative mt-4">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleQA()}
                            placeholder="Hỏi AI về hợp đồng này..."
                            className="w-full bg-navy-base border border-slate-border rounded-full py-3 pl-5 pr-12 text-sm focus:border-gold-primary outline-none transition-all"
                        />
                        <button
                            onClick={() => handleQA()}
                            disabled={isSearching || !query.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-slate-800 rounded-full text-gold-primary hover:text-gold-muted transition-all"
                        >
                            {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                </div>
                <Typography variant="caption" className="text-slate-500">
                    * Tiết kiệm ~80% token bằng cách chỉ phân tích khi cần
                </Typography>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col p-6">
            <div className="flex items-center gap-2 mb-4">
                <Typography variant="h3" className="text-base uppercase tracking-wider text-gold-primary/80">Kết quả đánh giá AI</Typography>
                {isAnalyzing && <span className="text-[10px] bg-gold-primary/20 text-gold-primary px-2 py-0.5 rounded-full animate-pulse">Đang quét...</span>}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-1">
                {/* AI Answer Section */}
                {answer && (
                    <div className="bg-gold-primary/5 border border-gold-primary/20 rounded-xl p-5 mb-2 animate-in slide-in-from-top duration-500">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 bg-gold-primary rounded-md">
                                <Search size={14} className="text-black" />
                            </div>
                            <Typography variant="subtitle" className="text-gold-primary">Giải đáp từ Hybrid Search</Typography>
                        </div>
                        <Typography variant="body" className="text-slate-200 leading-relaxed mb-4">{answer}</Typography>
                        {sources.length > 0 && (
                            <div className="pt-3 border-t border-gold-primary/10">
                                <Typography variant="caption" className="text-gold-muted/60 block mb-2 uppercase tracking-tighter">Nguồn trích dẫn:</Typography>
                                <div className="space-y-2">
                                    {sources.slice(0, 2).map((s, i) => (
                                        <p key={i} className="text-[10px] text-slate-500 italic bg-slate-900/40 p-2 rounded leading-normal">
                                            "...{s.content.slice(0, 120)}..."
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}
                        <Button variant="ghost" size="sm" className="mt-4 h-7 text-[10px]" onClick={() => { setAnswer(''); setQuery(''); }}>Xóa câu trả lời</Button>
                    </div>
                )}

                {risks.length === 0 && !isAnalyzing && !answer && (
                    <div className="text-center py-16 opacity-50">
                        <Typography variant="subtitle" className="text-sm">Tải lên hợp đồng để bắt đầu</Typography>
                    </div>
                )}

                {risks.map((r, i) => (
                    <div key={i} className="bg-slate-800/40 border border-slate-border rounded-xl p-5 hover:border-gold-muted/40 transition-all duration-300 group">
                        <div className="flex items-start justify-between mb-3">
                            <RiskBadge level={r.level} />
                            <Typography variant="caption" className="text-gold-muted font-mono">{r.clause_ref}</Typography>
                        </div>
                        <Typography variant="body" className="text-sm mb-3 leading-relaxed text-slate-300">{r.description}</Typography>
                        {r.citation && (
                            <div className="mt-3 pt-3 border-t border-slate-border/50">
                                <p className="text-[10px] text-gold-muted/60 font-mono pl-2 border-l-2 border-gold-primary/40 uppercase">
                                    Căn cứ: {r.citation}
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Q&A Input Bar at Bottom */}
            {(status === 'success' || risks.length > 0) && (
                <div className="mt-4 pt-4 border-t border-slate-border/50">
                    <form onSubmit={handleQA} className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Hỏi thêm về hợp đồng..."
                            className="w-full bg-navy-base border border-slate-border rounded-full py-3 pl-5 pr-12 text-sm focus:border-gold-primary outline-none transition-all placeholder:text-slate-500"
                        />
                        <button
                            type="submit"
                            disabled={isSearching || !query.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gold-primary rounded-full text-black hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                        >
                            {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </form>
                </div>
            )}
        </div>
    )
}

export function ContractAnalysis() {
    return (
        <SplitView
            ratio="55/45"
            left={<UploadZone />}
            right={<RiskPanel />}
            className="h-full"
        />
    )
}

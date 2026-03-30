import { useCallback, useState } from 'react'
import { Upload, FileText } from 'lucide-react'
import { SplitView } from '../components/layout/SplitView'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Typography } from '../components/ui/Typography'
import { Button } from '../components/ui/Button'
import { useUploadStore, useAnalysisStore } from '../store'
import { supabase } from '../lib/supabase'

// Type for Risk Review response
interface RiskResponse {
    risks: Array<{
        clause_ref: string
        level: 'critical' | 'moderate' | 'note'
        description: string
        citation: string
    }>
}

function UploadZone() {
    const { status, progress, setFile, setStatus, setExtractedText, reset, error, setError, extractedText } = useUploadStore()
    const { startAnalysis, setRisks, setDocument } = useAnalysisStore()
    const [isDragging, setIsDragging] = useState(false)

    const handleFile = useCallback(async (file: File) => {
        setFile(file)
        setStatus('uploading', 10)
        setError(null)

        try {
            // 1. Upload & Parse
            const formData = new FormData()
            formData.append('file', file)

            const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-document', {
                body: formData
            })

            if (parseError) throw parseError

            const docId = parseData.document_id
            const text = parseData.text_content

            setStatus('parsing', 60)
            setExtractedText(text)
            setDocument(docId)

            // 2. Risk Review
            startAnalysis()
            const { data: riskData, error: riskError } = await supabase.functions.invoke('risk-review', {
                body: { clause_text: text }
            })

            if (riskError) throw riskError

            const risks = (riskData as RiskResponse).risks
            setRisks(risks)
            setStatus('success', 100)

            // 3. Update contract title (optional, standard metadata)
            await supabase.from('contracts').insert({
                document_id: docId,
                title: file.name,
                status: 'analyzed'
            })

        } catch (err) {
            console.error('Analysis failed:', err)
            setError((err as Error).message)
            setStatus('error', 0)
        }
    }, [setFile, setStatus, setExtractedText, setDocument, startAnalysis, setRisks, setError])

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
    const { risks, isAnalyzing } = useAnalysisStore()

    return (
        <div className="h-full flex flex-col p-6">
            <div className="flex items-center gap-2 mb-4">
                <Typography variant="h3" className="text-base">Đánh giá rủi ro AI</Typography>
                {isAnalyzing && <span className="text-xs text-gold-primary animate-pulse">Đang phân tích...</span>}
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
                {risks.length === 0 && !isAnalyzing && (
                    <div className="text-center py-16">
                        <Typography variant="subtitle" className="text-sm">Tải lên hợp đồng để bắt đầu phân tích</Typography>
                    </div>
                )}
                {risks.map((r, i) => (
                    <div key={i} className="p-4 rounded-lg bg-navy-elevated border border-slate-border animate-slide-up group hover:border-gold-primary/30 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                            <RiskBadge level={r.level} />
                            <Typography variant="caption" className="font-mono text-gold-muted uppercase tracking-widest">{r.clause_ref}</Typography>
                        </div>
                        <Typography variant="body" className="text-sm mb-2 leading-relaxed">{r.description}</Typography>
                        {r.citation && (
                            <p className="text-[10px] text-gold-muted/60 font-mono border-l border-gold-primary/30 pl-2 mt-2 uppercase">
                                Tham chiếu: {r.citation}
                            </p>
                        )}
                    </div>
                ))}
            </div>
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

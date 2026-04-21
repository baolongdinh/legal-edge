import { useCallback, useRef, useState } from 'react'
import {
    Bot,
    Check,
    Globe,
    Loader2,
    Sparkles,
    Printer,
    FileDown,
    Plus,
    Gavel,
    Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { useEditorStore, type DraftIntakeQuestion } from '../store'
import { generateContractSuggestion, supabase } from '../lib/supabase'
import { exportToPDF, exportToDocx } from '../lib/export'
import { cn } from '../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'input' | 'researching' | 'clarify' | 'result'

interface Citation {
    citation_text: string
    citation_url: string
    source_domain: string
    source_title: string
    source_excerpt?: string
    source_type: 'official' | 'secondary' | 'document_context'
}

interface GenerationResult {
    content: string
    document_label?: string
    citations: Citation[]
    clarification_pack?: {
        title: string
        description?: string
        questions: DraftIntakeQuestion[]
    }
    status?: 'ok' | 'needs_clarification' | 'document_type_mismatch'
    mismatch_reason?: string
    verification_summary?: {
        citation_count: number
        official_count: number
        secondary_count: number
    }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
    { id: 'input', label: 'Yêu cầu' },
    { id: 'researching', label: 'Nghiên cứu pháp lý' },
    { id: 'clarify', label: 'Làm rõ thông tin' },
    { id: 'result', label: 'Hợp đồng' },
]

function StepBar({ current }: { current: Step }) {
    const currentIdx = STEPS.findIndex((s) => s.id === current)
    return (
        <div className="flex items-center gap-0 w-full max-w-xl mx-auto px-4">
            {STEPS.map((step, idx) => {
                const done = idx < currentIdx
                const active = idx === currentIdx
                return (
                    <div key={step.id} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-2">
                            <div className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
                                done
                                    ? 'bg-primary text-on-primary'
                                    : active
                                        ? 'bg-primary/20 text-primary ring-2 ring-primary/30'
                                        : 'bg-surface-container text-on-surface-variant'
                            )}>
                                {done ? <Check size={14} strokeWidth={3} /> : idx + 1}
                            </div>
                            <span className={cn(
                                'text-[10px] font-bold uppercase tracking-wider transition-colors duration-300',
                                active ? 'text-primary' : done ? 'text-on-surface/60' : 'text-on-surface-variant/40'
                            )}>
                                {step.label}
                            </span>
                        </div>
                        {idx < STEPS.length - 1 && (
                            <div className={cn(
                                'flex-1 h-[2px] mx-4 mb-5 transition-all duration-500',
                                done ? 'bg-primary' : 'bg-surface-container'
                            )} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ─── Legal research pulse animation ──────────────────────────────────────────

function ResearchingView({ citations }: { citations: Citation[] }) {
    return (
        <div className="flex flex-col items-center justify-center gap-10 py-16 px-6 max-w-xl mx-auto w-full">
            {/* Animated orb */}
            <div className="relative flex items-center justify-center">
                <div className="absolute w-32 h-32 rounded-full bg-primary/10 animate-ping" />
                <div className="absolute w-24 h-24 rounded-full bg-primary/15 animate-pulse" />
                <div className="relative w-16 h-16 rounded-full bg-surface-container-lowest shadow-xl flex items-center justify-center border border-on-surface/5">
                    <Globe size={24} className="text-primary animate-spin" style={{ animationDuration: '3s' }} />
                </div>
            </div>

            <div className="text-center space-y-3">
                <Typography variant="h3" className="font-serif text-primary">Đang nghiên cứu pháp luật</Typography>
                <p className="text-sm leading-relaxed text-on-surface-variant max-w-md mx-auto">
                    Hệ thống AI đang đối soát các bộ luật chuyên ngành, nghị định và thông tư hiện hành để đảm bảo tính pháp lý cao nhất cho hợp đồng của bạn.
                </p>
            </div>

            {citations.length > 0 && (
                <div className="w-full space-y-3 animate-fadeIn">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60 text-center mb-4">Các nguồn đang được xử lý</p>
                    <div className="grid gap-2">
                        {citations.map((c, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-4 rounded-xl bg-surface-container-low px-5 py-4 border border-on-surface/5"
                                style={{ animationDelay: `${i * 0.15}s` }}
                            >
                                <div className={cn(
                                    'w-2 h-2 rounded-full shrink-0',
                                    c.source_type === 'official' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                                )} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-on-surface truncate uppercase tracking-tight">{c.citation_text || c.source_title}</p>
                                    <p className="text-[10px] text-on-surface-variant truncate font-medium opacity-70">{c.source_domain}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DraftEditor() {
    const {
        draftTitle,
        activeDraft,
        activeDraftId,
        draftRequest,
        intakeQuestions,
        intakeAnswers,
        setDraft,
        setDraftDocument,
        setDraftTitle,
        setDraftRequest,
        setIntakePack,
        setIntakeAnswer,
        clearIntake,
        resetDraft,
    } = useEditorStore()

    const [step, setStep] = useState<Step>('input')
    const [clarifyCount, setClarifyCount] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved')
    const [researchCitations, setResearchCitations] = useState<Citation[]>([])
    const [result, setResult] = useState<GenerationResult | null>(null)

    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // ── Step 1 → 2: Submit initial request ──────────────────────────────────

    const handleSubmitRequest = useCallback(async () => {
        if (!draftRequest.trim()) {
            toast.error('Vui lòng mô tả yêu cầu hợp đồng của bạn.')
            return
        }

        setIsLoading(true)
        setStep('researching')
        setClarifyCount(0)
        setResearchCitations([])
        setResult(null)
        clearIntake()

        try {
            const response = await generateContractSuggestion({
                prompt: draftRequest.trim(),
                mode: 'draft',
            })

            if (response.citations?.length) {
                setResearchCitations(response.citations.slice(0, 4))
            }

            await new Promise((r) => setTimeout(r, 1200)) // Smoother transition

            setResult({ ...response, citations: response.citations || [] })

            if (
                response.status === 'needs_clarification' ||
                response.status === 'document_type_mismatch'
            ) {
                setIntakePack({
                    questions: response.clarification_pack?.questions ?? [],
                    documentType: response.document_type ?? null,
                    documentLabel: response.document_label ?? null,
                })
                setStep('clarify')
            } else {
                setDraft(response.content)
                if (!draftTitle || draftTitle === 'Bản thảo hợp đồng') {
                    setDraftTitle(response.document_label || 'Hợp đồng')
                }
                clearIntake()
                setStep('result')
            }
        } catch (err) {
            console.error(err)
            toast.error('AI chưa thể xử lý yêu cầu. Vui lòng thử lại.')
            setStep('input')
        } finally {
            setIsLoading(false)
        }
    }, [draftRequest, draftTitle, clearIntake, setDraft, setDraftTitle, setIntakePack])

    const handleSubmitClarification = useCallback(async () => {
        const missing = intakeQuestions.filter((q) => q.required && !intakeAnswers[q.id]?.trim())
        if (missing.length > 0) {
            toast.error('Vui lòng trả lời các câu hỏi bắt buộc (*).')
            return
        }

        setIsLoading(true)
        setStep('researching')

        try {
            const force_generation = clarifyCount >= 10
            const response = await generateContractSuggestion({
                prompt: draftRequest.trim(),
                mode: 'draft',
                intake_answers: intakeAnswers,
                parameters: { force_generation },
            })

            if (response.citations?.length) {
                setResearchCitations(response.citations.slice(0, 4))
            }

            await new Promise((r) => setTimeout(r, 900))

            setResult({ ...response, citations: response.citations || [] })

            if (response.status === 'needs_clarification' || response.status === 'document_type_mismatch') {
                setClarifyCount((prev) => prev + 1)
                setIntakePack({
                    questions: response.clarification_pack?.questions ?? [],
                    documentType: response.document_type ?? null,
                    documentLabel: response.document_label ?? null,
                })
                setStep('clarify')
            } else {
                setDraft(response.content)
                if (!draftTitle || draftTitle === 'Bản thảo hợp đồng') {
                    setDraftTitle(response.document_label || 'Hợp đồng')
                }
                clearIntake()
                setStep('result')
            }
        } catch (err) {
            console.error(err)
            toast.error('Không thể tạo hợp đồng. Vui lòng thử lại.')
            setStep('clarify')
        } finally {
            setIsLoading(false)
        }
    }, [intakeQuestions, intakeAnswers, draftRequest, clarifyCount, draftTitle, clearIntake, setDraft, setDraftTitle, setIntakePack])

    // ── Save draft ────────────────────────────────────────────────────────────

    const handleSave = useCallback(async () => {
        if (!activeDraft.trim()) return

        // Optimistic State
        setIsSaving(true)
        setSaveState('saving')

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Vui lòng đăng nhập để lưu bản thảo.')

            const payload = {
                user_id: user.id,
                title: draftTitle.trim() || 'Bản thảo hợp đồng',
                content_md: activeDraft,
                status: 'draft',
                updated_at: new Date().toISOString(),
            }

            if (activeDraftId) {
                // Background update
                const { error } = await supabase.from('contracts').update(payload).eq('id', activeDraftId)
                if (error) throw error
            } else {
                // For new documents, we still need to wait for ID, but we can pre-set the state
                const { data, error } = await supabase
                    .from('contracts')
                    .insert(payload)
                    .select('id, title, content_md')
                    .single()
                if (error) throw error
                setDraftDocument({ id: data.id, title: data.title, content: data.content_md ?? activeDraft })
            }

            setSaveState('saved')
            toast.success('Đã lưu bản thảo.')
        } catch (err) {
            setSaveState('unsaved')
            toast.error((err as Error).message || 'Không thể lưu bản thảo.')
        } finally {
            setIsSaving(false)
        }
    }, [activeDraft, activeDraftId, draftTitle, setDraftDocument])

    const handleExport = async (format: 'pdf' | 'docx' | 'print') => {
        if (!activeDraft.trim()) return

        const title = draftTitle || 'Hợp đồng LegalShield'

        if (format === 'print') {
            const printIframe = document.createElement('iframe')
            printIframe.style.position = 'fixed'
            printIframe.style.right = '0'
            printIframe.style.bottom = '0'
            printIframe.style.width = '0'
            printIframe.style.height = '0'
            printIframe.style.border = '0'
            document.body.appendChild(printIframe)

            const content = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>\${title}</title>
                    <style>
                        body { font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.6; color: #000; }
                        h1 { text-align: center; text-transform: uppercase; margin-bottom: 30px; font-size: 20px; }
                        p { margin-bottom: 12px; text-align: justify; font-size: 14px; }
                        .header { text-align: center; margin-bottom: 40px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br>
                        Độc lập - Tự do - Hạnh phúc<br>
                        -------------------
                    </div>
                    <h1>\${title}</h1>
                    \${activeDraft.split('\n').map(line => \`<p>\${line || '&nbsp;'}</p>\`).join('')}
                </body>
                </html>
            `

            printIframe.contentWindow?.document.open()
            printIframe.contentWindow?.document.write(content)
            printIframe.contentWindow?.document.close()

            setTimeout(() => {
                printIframe.contentWindow?.focus()
                printIframe.contentWindow?.print()
                setTimeout(() => document.body.removeChild(printIframe), 1000)
            }, 500)
            return
        }

        const toastId = toast.loading(`Đang tạo file \${format.toUpperCase()}...`)
        try {
            if (format === 'pdf') {
                await exportToPDF(title, activeDraft)
            } else {
                await exportToDocx(title, activeDraft)
            }
            toast.success(`Đã xuất file \${format.toUpperCase()} thành công!`, { id: toastId })
        } catch (error) {
            console.error(`Export \${format} failed:`, error)
            toast.error(`Lỗi khi xuất file \${format.toUpperCase()}`, { id: toastId })
        }
    }

    const handleReset = () => {
        resetDraft()
        setStep('input')
        setClarifyCount(0)
        setResult(null)
        setResearchCitations([])
        setSaveState('saved')
    }

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="h-full flex flex-col bg-surface overflow-hidden">
            {/* Header Area */}
            <header className="flex-shrink-0 bg-surface-bright px-8 py-6 flex items-center justify-between shadow-[0_1px_0_0_rgba(0,0,0,0.05)] z-20">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 ring-4 ring-primary/5">
                        <Bot size={22} strokeWidth={2.5} />
                    </div>
                    <div>
                        <Typography variant="label" className="text-[10px] uppercase tracking-[0.25em] text-primary/80 font-bold mb-0.5">Agentic soạn thảo</Typography>
                        <h1 className="text-xl font-serif font-bold text-on-surface">Cố vấn Pháp lý Số</h1>
                    </div>
                </div>

                {step === 'result' && (
                    <div className="flex items-center gap-4 animate-fadeIn">
                        <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-xl border border-on-surface/5">
                            <div className={cn(
                                'w-2 h-2 rounded-full',
                                saveState === 'saved' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                            )} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/70">
                                {saveState === 'saved' ? 'Đã lưu' : saveState === 'saving' ? 'Đang lưu…' : 'Chưa lưu'}
                            </span>
                        </div>

                        <div className="flex bg-surface-container-low p-1 rounded-xl border border-on-surface/5">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleExport('print')}
                                title="In hợp đồng"
                                className="h-9 w-9 p-0 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all"
                            >
                                <Printer size={16} />
                            </Button>
                            <div className="w-px h-4 bg-on-surface/10 self-center mx-1" />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleExport('pdf')}
                                title="Xuất PDF"
                                className="h-9 w-9 p-0 text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all"
                            >
                                <FileDown size={16} />
                            </Button>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleSave()}
                            disabled={isSaving}
                            className="h-10 px-5 gap-2 font-bold uppercase text-[10px] tracking-widest border-primary/20 hover:border-primary/40 hover:bg-primary/5"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Lưu ngay
                        </Button>

                        <Button
                            variant="primary"
                            size="sm"
                            className="h-10 px-5 gap-2 bg-primary text-on-primary font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
                            onClick={handleReset}
                        >
                            <Plus size={16} strokeWidth={3} />
                            Tạo mới
                        </Button>
                    </div>
                )}
            </header>

            {/* Workflow Navigation */}
            <nav className="flex-shrink-0 py-6 bg-surface-container shadow-inner">
                <StepBar current={step} />
            </nav>

            {/* Canvas */}
            <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-surface select-none">
                <div className="max-w-[1200px] mx-auto">

                    {/* ── STEP 1: Input ────────────────────────────────────────── */}
                    {step === 'input' && (
                        <div className="max-w-2xl mx-auto px-8 py-16 space-y-12 animate-fadeIn">
                            <div className="text-center space-y-4">
                                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-[10px] font-bold text-primary uppercase tracking-[0.25em]">
                                    <Sparkles size={12} strokeWidth={3} />
                                    Khởi tạo ý tưởng
                                </div>
                                <h2 className="text-4xl font-serif font-medium text-on-surface leading-tight">Bạn muốn soạn thảo văn bản nào?</h2>
                                <p className="text-base text-on-surface-variant/80 max-w-lg mx-auto leading-relaxed">
                                    Mô tả ngắn gọn nhu cầu của bạn. AI sẽ lập tức tra cứu tiền lệ pháp luật và đề xuất khung sườn chuyên nghiệp nhất.
                                </p>
                            </div>

                            <div className="space-y-4 group">
                                <div className="relative">
                                    <textarea
                                        value={draftRequest}
                                        onChange={(e) => setDraftRequest(e.target.value)}
                                        rows={8}
                                        placeholder={`Ví dụ: "Hợp đồng tư vấn giải pháp Chuyển đổi số giữa LegalShield và Client X..."`}
                                        className="w-full rounded-2xl border-2 border-surface-container-high bg-surface-bright px-6 py-6 text-base leading-relaxed text-on-surface outline-none placeholder:text-on-surface-variant/30 focus:border-primary/30 focus:ring-4 focus:ring-primary/5 resize-none transition-all duration-300 shadow-sm group-hover:shadow-md"
                                    />
                                    <div className="absolute right-4 bottom-4 flex items-center gap-2 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                                        <span>Duy nhất tại Việt Nam</span>
                                        <div className="w-1 h-1 rounded-full bg-primary/40" />
                                        <span>AI Precision</span>
                                    </div>
                                </div>
                                <p className="text-xs text-on-surface-variant/60 font-medium px-2">
                                    * Thông tin càng chi tiết giúp AI nhận diện rủi ro pháp lý chính xác hơn.
                                </p>
                            </div>

                            <div className="flex flex-col items-center gap-8">
                                <Button
                                    variant="primary"
                                    size="lg"
                                    className="w-full py-5 text-sm font-bold uppercase tracking-[0.2em] bg-primary text-on-primary shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all"
                                    onClick={() => void handleSubmitRequest()}
                                    disabled={isLoading || !draftRequest.trim()}
                                >
                                    {isLoading
                                        ? <><Loader2 size={18} className="animate-spin mr-2" /> Đang cấu trúc dữ liệu…</>
                                        : <><Bot size={18} className="mr-2" /> Bắt đầu phân tích & soạn thảo</>
                                    }
                                </Button>

                                {/* Guidelines Card */}
                                <div className="w-full rounded-3xl bg-surface-container-low p-8 border border-on-surface/5 space-y-6">
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Các mốc thông tin khuyến nghị</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                        {[
                                            'Mục đích thương mại & Pháp lý chính',
                                            'Nhân diện các bên (Pháp nhân/Cá nhân)',
                                            'Giá trị, tiến độ & phương thức thanh toán',
                                            'Phạm vi trách nhiệm & Bồi thường',
                                            'Xử lý bảo mật & Sở hữu trí tuệ',
                                            'Pháp luật áp dụng & Giải quyết tranh chấp',
                                        ].map((tip) => (
                                            <div key={tip} className="flex items-center gap-3 text-sm text-on-surface-variant font-medium">
                                                <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                    <Check size={10} className="text-emerald-600" strokeWidth={4} />
                                                </div>
                                                {tip}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 2: Researching ──────────────────────────────────── */}
                    {step === 'researching' && (
                        <ResearchingView citations={researchCitations} />
                    )}

                    {/* ── STEP 3: Clarify ──────────────────────────────────────── */}
                    {step === 'clarify' && (
                        <div className="max-w-3xl mx-auto px-8 py-16 space-y-12 animate-fadeIn">
                            <div className="text-center space-y-4">
                                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-[10px] font-bold text-primary uppercase tracking-[0.25em]">
                                    <Bot size={12} strokeWidth={3} />
                                    Giai đoạn Hiệu chuẩn
                                </div>
                                <h2 className="text-4xl font-serif font-medium text-on-surface">
                                    {result?.clarification_pack?.title || 'Cần tinh chỉnh các thông số'}
                                </h2>
                                <p className="text-base text-on-surface-variant/80 max-w-xl mx-auto">
                                    {result?.clarification_pack?.description || 'Để văn bản chặt chẽ hơn, vui lòng cung cấp thêm các chi tiết nghiệp vụ dưới đây.'}
                                </p>
                            </div>

                            <div className="grid gap-6">
                                {intakeQuestions.map((q) => (
                                    <div key={q.id} className="relative group p-6 rounded-2xl bg-surface-container-low border border-on-surface/5 hover:border-primary/20 transition-all">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                                                {q.label}
                                                {q.required && <span className="text-primary text-lg leading-none">*</span>}
                                            </label>
                                            <button
                                                onClick={() => setIntakeAnswer(q.id, 'Tôi sẽ tự hoàn thiện sau (...)')}
                                                className="text-[10px] font-bold text-primary/60 hover:text-primary uppercase tracking-[0.15em] transition-colors"
                                            >
                                                Bổ sung sau
                                            </button>
                                        </div>
                                        <textarea
                                            value={intakeAnswers[q.id] ?? ''}
                                            onChange={(e) => setIntakeAnswer(q.id, e.target.value)}
                                            placeholder={q.placeholder}
                                            rows={2}
                                            className="w-full bg-surface-container-lowest rounded-xl px-5 py-4 text-base text-on-surface border border-on-surface/5 focus:border-primary/30 focus:ring-4 focus:ring-primary/5 outline-none resize-none transition-all"
                                        />
                                        {q.help_text && (
                                            <p className="mt-2 text-[11px] font-medium text-on-surface-variant/50 flex items-center gap-1.5">
                                                <Sparkles size={10} className="text-primary/40" />
                                                {q.help_text}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center gap-4 pt-4">
                                <Button
                                    variant="ghost"
                                    onClick={() => setStep('input')}
                                    className="px-8 h-12 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high"
                                >
                                    Quay lại bước 1
                                </Button>
                                <Button
                                    variant="primary"
                                    className="flex-1 py-5 text-sm font-bold uppercase tracking-[0.2em] bg-primary text-on-primary shadow-xl shadow-primary/20"
                                    onClick={() => void handleSubmitClarification()}
                                    disabled={isLoading}
                                >
                                    {isLoading
                                        ? <><Loader2 size={18} className="animate-spin mr-2" /> Đang tổng hợp…</>
                                        : <><Sparkles size={18} className="mr-2" /> Xác nhận & Soạn thảo</>
                                    }
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 4: Result ───────────────────────────────────────── */}
                    {step === 'result' && (
                        <div className="flex gap-10 px-8 py-12 animate-fadeIn">
                            {/* Editor Area */}
                            <div className="flex-1 min-w-0">
                                <div className="bg-surface-bright rounded-[2rem] shadow-[0_32px_96px_-12px_rgba(0,0,0,0.12)] border border-on-surface/5 overflow-hidden transition-all duration-700">
                                    {/* Traditional Header Style */}
                                    <div className="px-16 pt-20 pb-16 border-b border-surface-container text-center space-y-6">
                                        <div className="max-w-[400px] mx-auto space-y-2">
                                            <p className="text-[12px] font-bold uppercase tracking-[0.4em] text-on-surface">Cộng hòa xã hội chủ nghĩa việt nam</p>
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface opacity-80">Độc lập - Tự do - Hạnh phúc</p>
                                            <div className="mx-auto w-32 h-[1px] bg-on-surface opacity-20 mt-4" />
                                        </div>

                                        <input
                                            value={draftTitle}
                                            onChange={(e) => {
                                                setDraftTitle(e.target.value)
                                                setSaveState('unsaved')
                                            }}
                                            className="w-full text-center text-3xl font-serif font-bold text-on-surface uppercase tracking-widest bg-transparent outline-none border-b border-transparent focus:border-primary/20 pb-4 transition-all"
                                            placeholder="Tên văn bản pháp lý"
                                        />

                                        <div className="flex items-center justify-center gap-2 pt-2">
                                            <div className="px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
                                                <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">
                                                    LegalShield AI Verified
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content Area */}
                                    <div className="px-20 py-16 min-h-[800px] select-text">
                                        <textarea
                                            ref={textareaRef}
                                            value={activeDraft}
                                            onChange={(e) => {
                                                setDraft(e.target.value)
                                                setSaveState('unsaved')
                                            }}
                                            spellCheck={false}
                                            rows={30}
                                            className="w-full bg-transparent resize-none outline-none text-on-surface font-serif text-[1.15rem] leading-[2.2] placeholder:text-on-surface/10 selection:bg-primary/10 custom-scrollbar"
                                            placeholder="Nội dung văn bản sẽ xuất hiện tại đây..."
                                        />
                                    </div>

                                    {/* Footer Seal */}
                                    <div className="px-16 py-10 bg-surface-container/30 border-t border-surface-container flex items-center justify-between">
                                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40">
                                            Văn bản khởi tạo tự động bởi LegalShield AI • {new Date().toLocaleDateString('vi-VN')}
                                        </div>
                                        <div className="w-12 h-12 rounded-full border-2 border-on-surface/5 flex items-center justify-center opacity-30 grayscale">
                                            <Gavel size={16} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Reference & Intelligence Panel */}
                            <div className="w-80 flex-shrink-0 space-y-6">
                                <div className="sticky top-8 space-y-6">
                                    {/* Citations Card */}
                                    <section className="bg-surface-container-low rounded-3xl p-6 border border-on-surface/5 overflow-hidden">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary">Cơ sở pháp lý</h3>
                                            <Bot size={14} className="text-primary/40" />
                                        </div>

                                        <div className="space-y-3">
                                            {result?.citations?.map((c, i) => (
                                                <a
                                                    key={i}
                                                    href={c.citation_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="group block p-4 bg-surface-container-lowest rounded-2xl border border-on-surface/5 hover:border-primary/20 transition-all shadow-sm"
                                                >
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className={cn(
                                                            'w-1.5 h-1.5 rounded-full shrink-0',
                                                            c.source_type === 'official' ? 'bg-emerald-500' : 'bg-amber-500'
                                                        )} />
                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant group-hover:text-primary transition-colors">
                                                            {c.source_domain}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] font-medium leading-relaxed text-on-surface h-10 line-clamp-2">
                                                        {c.citation_text || c.source_title}
                                                    </p>
                                                </a>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Security Notice */}
                                    <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles size={14} className="text-primary" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Lưu ý chuyên môn</span>
                                        </div>
                                        <p className="text-[11px] leading-relaxed text-on-surface-variant font-medium">
                                            Các điều khoản trên đã được tối ưu hóa theo quy định hiện hành. Tuy nhiên, với các giao dịch đặc thù, bạn nên tham vấn thêm ý kiến luật sư.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

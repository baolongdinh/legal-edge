import { useCallback, useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
    Bot,
    Check,
    ChevronRight,
    Download,
    FileText,
    Globe,
    Loader2,
    RotateCcw,
    Save,
    Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { useEditorStore, type DraftIntakeQuestion } from '../store'
import { generateContractSuggestion, supabase } from '../lib/supabase'

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
                        <div className="flex flex-col items-center gap-1">
                            <div className={clsx(
                                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-300',
                                done
                                    ? 'bg-gold-primary border-gold-primary text-navy-base'
                                    : active
                                        ? 'border-gold-primary text-gold-primary bg-gold-primary/10'
                                        : 'border-slate-border text-slate-muted bg-transparent'
                            )}>
                                {done ? <Check size={13} /> : idx + 1}
                            </div>
                            <span className={clsx(
                                'text-[10px] font-medium whitespace-nowrap',
                                active ? 'text-gold-primary' : done ? 'text-paper-dark/60' : 'text-slate-muted'
                            )}>
                                {step.label}
                            </span>
                        </div>
                        {idx < STEPS.length - 1 && (
                            <div className={clsx(
                                'flex-1 h-px mx-2 mb-4 transition-all duration-500',
                                done ? 'bg-gold-primary' : 'bg-slate-border'
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
                <div className="absolute w-28 h-28 rounded-full bg-gold-primary/10 animate-ping" />
                <div className="absolute w-20 h-20 rounded-full bg-gold-primary/15 animate-pulse" />
                <div className="relative w-14 h-14 rounded-full bg-gold-primary/20 border border-gold-primary/40 flex items-center justify-center">
                    <Globe size={22} className="text-gold-primary animate-spin" style={{ animationDuration: '3s' }} />
                </div>
            </div>

            <div className="text-center space-y-2">
                <Typography variant="label" className="text-base">Đang nghiên cứu pháp luật Việt Nam</Typography>
                <p className="text-sm leading-6 text-slate-muted">
                    AI đang tìm kiếm các quy định pháp luật liên quan, bộ luật dân sự, nghị định và án lệ để đảm bảo hợp đồng của bạn tuân thủ đúng pháp lý.
                </p>
            </div>

            {citations.length > 0 && (
                <div className="w-full space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-muted mb-3">Nguồn đang thu thập</p>
                    {citations.map((c, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 rounded-xl border border-slate-border bg-navy-elevated/70 px-4 py-3 animate-fadeIn"
                            style={{ animationDelay: `${i * 0.15}s` }}
                        >
                            <div className={clsx(
                                'mt-0.5 w-2 h-2 rounded-full flex-shrink-0',
                                c.source_type === 'official' ? 'bg-emerald-400' : 'bg-amber-400'
                            )} />
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-paper-dark truncate">{c.citation_text || c.source_title}</p>
                                <p className="text-[11px] text-slate-muted truncate">{c.source_domain}</p>
                            </div>
                        </div>
                    ))}
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
    const [isExporting, setIsExporting] = useState(false)
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

            // Populate citations so ResearchingView can show them briefly
            if (response.citations?.length) {
                setResearchCitations(response.citations.slice(0, 4))
            }

            // Small pause so user sees the research animation
            await new Promise((r) => setTimeout(r, 900))

            setResult({ ...response, citations: response.citations || [] })

            if (
                response.status === 'needs_clarification' ||
                response.status === 'document_type_mismatch'
            ) {
                // Move to clarification step
                setIntakePack({
                    questions: response.clarification_pack?.questions ?? [],
                    documentType: response.document_type ?? null,
                    documentLabel: response.document_label ?? null,
                })
                setStep('clarify')
            } else {
                // Directly show result
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
            // Trust AI more, but keep a safety net at 10 rounds
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

            // Small pause for effect
            await new Promise((r) => setTimeout(r, 700))

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
                const { error } = await supabase.from('contracts').update(payload).eq('id', activeDraftId)
                if (error) throw error
            } else {
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

    const handleExport = useCallback(async () => {
        if (!activeDraft.trim()) return
        setIsExporting(true)
        try {
            // We use a dedicated print-friendly approach to ensure perfect Vietnamese font support
            // jsPDF standard fonts don't support Unicode accents, and embedding fonts is heavy.
            // window.print() is the most reliable way to get high-quality PDF with perfect text and fonts.

            const printableContent = `
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.8; margin: 2cm 2.5cm; color: #111; text-align: justify; white-space: pre-wrap;">
                    <h1 style="text-align: center; font-size: 16pt; text-transform: uppercase; margin-bottom: 24pt;">${draftTitle || 'HỢP ĐỒNG'}</h1>
                    ${activeDraft
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Simple markdown bold
                    .replace(/\n\n/g, '<br/><br/>')
                    .replace(/\n/g, '<br/>')
                }
                </div>
            `;

            const printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            document.body.appendChild(printFrame);

            const doc = printFrame.contentWindow?.document || printFrame.contentDocument;
            if (doc) {
                doc.open();
                doc.write(`
                    <html>
                        <head>
                            <title>${draftTitle || 'Hợp đồng'}</title>
                            <style>
                                @page { size: A4; margin: 0; }
                                body { margin: 0; padding: 0; }
                            </style>
                        </head>
                        <body onload="window.focus(); window.print();">${printableContent}</body>
                    </html>
                `);
                doc.close();

                // Cleanup after a delay to allow the print dialog to open
                setTimeout(() => {
                    document.body.removeChild(printFrame);
                }, 1000);
            }

            toast.success('Đã chuẩn bị bản in / PDF.')
        } catch (err) {
            console.error('Export failed:', err)
            toast.error((err as Error).message || 'Không thể xuất PDF.')
        } finally {
            setIsExporting(false)
        }
    }, [activeDraft, draftTitle])

    // ── Reset ─────────────────────────────────────────────────────────────────

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
        <div className="h-full flex flex-col bg-navy-base overflow-hidden">
            {/* Top bar */}
            <div className="flex-shrink-0 border-b border-slate-border bg-navy-elevated/60 px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl border border-gold-primary/25 bg-gold-primary/10 flex items-center justify-center text-gold-primary flex-shrink-0">
                        <FileText size={17} />
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-muted font-medium">Soạn thảo hợp đồng</p>
                        <p className="text-sm font-semibold text-paper-dark leading-tight">AI pháp lý Việt Nam</p>
                    </div>
                </div>

                {step === 'result' && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={clsx(
                            'text-xs uppercase tracking-[0.14em]',
                            saveState === 'saved' ? 'text-emerald-400' : saveState === 'saving' ? 'text-gold-primary' : 'text-slate-muted'
                        )}>
                            {saveState === 'saved' ? 'Đã lưu' : saveState === 'saving' ? 'Đang lưu…' : 'Chưa lưu'}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={isSaving}>
                            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            Lưu
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleExport()} disabled={isExporting}>
                            {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                            Xuất PDF
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleReset}>
                            <RotateCcw size={13} />
                            Tạo mới
                        </Button>
                    </div>
                )}
            </div>

            {/* Step bar */}
            <div className="flex-shrink-0 py-5 border-b border-slate-border bg-navy-elevated/30">
                <StepBar current={step} />
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

                {/* ── STEP 1: Input ────────────────────────────────────────── */}
                {step === 'input' && (
                    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
                        <div className="text-center space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-gold-primary/20 bg-gold-primary/8 px-4 py-1.5 text-xs font-semibold text-gold-primary uppercase tracking-[0.18em]">
                                <Sparkles size={12} />
                                Bước 1 — Yêu cầu hợp đồng
                            </div>
                            <h2 className="text-2xl font-semibold text-paper-dark">Bạn cần soạn hợp đồng gì?</h2>
                            <p className="text-sm leading-6 text-slate-muted max-w-lg mx-auto">
                                Mô tả ngắn gọn: loại hợp đồng, các bên liên quan, giá trị, thời hạn và
                                các điều khoản đặc biệt. AI sẽ tra cứu pháp luật Việt Nam trước khi soạn.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <textarea
                                value={draftRequest}
                                onChange={(e) => setDraftRequest(e.target.value)}
                                rows={8}
                                placeholder={`Ví dụ:\n"Hợp đồng dịch vụ phần mềm giữa Công ty A (bên thuê) và Freelancer B (bên cung cấp). Thời hạn 3 tháng, thanh toán 50% đầu + 50% nghiệm thu. Có điều khoản bảo mật, quyền sở hữu trí tuệ và phạt vi phạm. Áp dụng pháp luật Việt Nam, giải quyết tranh chấp tại TAND TP.HCM."`}
                                className="w-full rounded-2xl border border-slate-border bg-navy-elevated px-5 py-4 text-sm leading-7 text-paper-dark outline-none placeholder:text-slate-muted focus:border-gold-primary resize-none transition-colors"
                            />
                            <p className="text-xs text-slate-muted">
                                Càng chi tiết, hợp đồng AI tạo ra càng chính xác. Bạn sẽ được hỏi thêm ở bước tiếp theo nếu cần.
                            </p>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full py-3 text-sm"
                            onClick={() => void handleSubmitRequest()}
                            disabled={isLoading || !draftRequest.trim()}
                        >
                            {isLoading
                                ? <><Loader2 size={15} className="animate-spin" /> Đang xử lý…</>
                                : <><Bot size={15} /> Bắt đầu soạn thảo với AI <ChevronRight size={14} /></>
                            }
                        </Button>

                        {/* Tips */}
                        <div className="rounded-2xl border border-slate-border bg-navy-elevated/50 p-5 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-muted">Gợi ý thông tin cần có</p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    'Loại hợp đồng (dịch vụ, mua bán, thuê…)',
                                    'Thông tin các bên (tên, MST nếu có)',
                                    'Giá trị hợp đồng & điều khoản thanh toán',
                                    'Thời hạn & điều kiện chấm dứt',
                                    'Điều khoản bảo mật / sở hữu trí tuệ',
                                    'Cơ chế giải quyết tranh chấp',
                                ].map((tip) => (
                                    <div key={tip} className="flex items-start gap-2 text-xs text-slate-muted leading-5">
                                        <Check size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                                        {tip}
                                    </div>
                                ))}
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
                    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
                        <div className="text-center space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-gold-primary/20 bg-gold-primary/8 px-4 py-1.5 text-xs font-semibold text-gold-primary uppercase tracking-[0.18em]">
                                <Bot size={12} />
                                Bước 3 — AI hỏi thêm
                            </div>
                            <h2 className="text-2xl font-semibold text-paper-dark">
                                {result?.clarification_pack?.title || 'Cần làm rõ thêm một số điểm'}
                            </h2>
                            {result?.clarification_pack?.description && (
                                <p className="text-sm leading-6 text-slate-muted max-w-lg mx-auto">
                                    {result.clarification_pack.description}
                                </p>
                            )}
                            {result?.mismatch_reason && (
                                <p className="text-sm leading-6 text-amber-300/90 max-w-lg mx-auto">
                                    {result.mismatch_reason}
                                </p>
                            )}
                        </div>

                        {/* Research citations summary */}
                        {result?.citations && result.citations.length > 0 && (
                            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4 space-y-2">
                                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-[0.16em]">
                                    Đã tra cứu {result.citations.length} nguồn pháp lý
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {result.citations.slice(0, 5).map((c, i) => (
                                        <a
                                            key={i}
                                            href={c.citation_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-border bg-navy-base/60 px-3 py-1 text-[11px] text-slate-muted hover:text-paper-dark hover:border-gold-muted transition-colors"
                                        >
                                            <span className={clsx(
                                                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                                c.source_type === 'official' ? 'bg-emerald-400' : 'bg-amber-400'
                                            )} />
                                            {c.source_domain}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-5">
                            {intakeQuestions.map((q) => (
                                <div key={q.id} className="space-y-2 group relative">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-paper-dark flex items-center gap-1">
                                            {q.label}
                                            {q.required && <span className="text-rose-400 text-xs">*</span>}
                                        </label>
                                        <button
                                            onClick={() => setIntakeAnswer(q.id, 'Tôi sẽ tự điền thông tin này sau (hãy để trống .....)')}
                                            className="text-[10px] text-slate-muted hover:text-gold-primary uppercase tracking-wider font-semibold transition-colors"
                                        >
                                            Để điền sau
                                        </button>
                                    </div>
                                    <textarea
                                        value={intakeAnswers[q.id] ?? ''}
                                        onChange={(e) => setIntakeAnswer(q.id, e.target.value)}
                                        placeholder={q.placeholder}
                                        rows={3}
                                        className="w-full rounded-xl border border-slate-border bg-navy-elevated px-4 py-3 text-sm text-paper-dark outline-none placeholder:text-slate-muted focus:border-gold-primary resize-none transition-colors"
                                    />
                                    {q.help_text && (
                                        <p className="text-xs text-slate-muted">{q.help_text}</p>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setStep('input')}
                                className="px-5"
                            >
                                ← Sửa yêu cầu
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 py-3"
                                onClick={() => void handleSubmitClarification()}
                                disabled={isLoading}
                            >
                                {isLoading
                                    ? <><Loader2 size={14} className="animate-spin" /> Đang tạo hợp đồng…</>
                                    : <><Sparkles size={14} /> Tạo hợp đồng từ thông tin trên</>
                                }
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── STEP 4: Result ───────────────────────────────────────── */}
                {step === 'result' && (
                    <div className="flex gap-6 max-w-[1100px] mx-auto px-6 py-8">
                        {/* Document */}
                        <div className="flex-1 min-w-0">
                            <div className="bg-paper-light text-navy-base rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.32)] border border-black/5 overflow-hidden">
                                {/* Doc header */}
                                <div className="px-10 pt-10 pb-6 border-b border-slate-200/60">
                                    <input
                                        value={draftTitle}
                                        onChange={(e) => {
                                            setDraftTitle(e.target.value)
                                            setSaveState('unsaved')
                                        }}
                                        className="w-full text-center text-2xl font-serif font-bold text-navy-base uppercase tracking-wider bg-transparent outline-none border-b-2 border-transparent focus:border-gold-primary/40 pb-1 transition-colors"
                                        placeholder="TÊN HỢP ĐỒNG"
                                    />
                                    <p className="text-center text-xs text-slate-500 mt-2">
                                        Soạn thảo bởi AI pháp lý LegalShield • Căn cứ pháp luật Việt Nam
                                    </p>
                                </div>

                                {/* Doc body */}
                                <div className="px-10 py-8">
                                    <textarea
                                        ref={textareaRef}
                                        value={activeDraft}
                                        onChange={(e) => {
                                            setDraft(e.target.value)
                                            setSaveState('unsaved')
                                        }}
                                        spellCheck={false}
                                        rows={40}
                                        className="w-full bg-transparent resize-none outline-none text-navy-base font-sans text-[14.5px] leading-8"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Sidebar: citations */}
                        {result?.citations && result.citations.length > 0 && (
                            <div className="w-64 flex-shrink-0 space-y-4">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-muted font-semibold mb-3">
                                        Căn cứ pháp lý
                                    </p>
                                    {result.verification_summary && (
                                        <div className="rounded-xl border border-slate-border bg-navy-elevated/60 px-4 py-3 mb-4 space-y-1 text-xs">
                                            <div className="flex justify-between text-slate-muted">
                                                <span>Nguồn chính thống</span>
                                                <span className="text-emerald-400">{result.verification_summary.official_count}</span>
                                            </div>
                                            <div className="flex justify-between text-slate-muted">
                                                <span>Nguồn thứ cấp</span>
                                                <span className="text-amber-400">{result.verification_summary.secondary_count}</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        {result.citations.map((c, i) => (
                                            <a
                                                key={i}
                                                href={c.citation_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="group block rounded-xl border border-slate-border bg-navy-elevated/60 px-3 py-3 hover:border-gold-muted transition-colors"
                                            >
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={clsx(
                                                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                                        c.source_type === 'official' ? 'bg-emerald-400' : 'bg-amber-400'
                                                    )} />
                                                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-muted group-hover:text-gold-primary transition-colors">
                                                        {c.source_domain}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-paper-dark leading-5 line-clamp-2">
                                                    {c.citation_text || c.source_title}
                                                </p>
                                            </a>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gold-primary/15 bg-gold-primary/5 p-4 space-y-2">
                                    <p className="text-xs font-semibold text-gold-primary">Lưu ý pháp lý</p>
                                    <p className="text-[11px] leading-5 text-slate-muted">
                                        Hợp đồng do AI tạo ra cần được luật sư kiểm tra trước khi ký kết, đặc biệt với các giao dịch có giá trị lớn.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

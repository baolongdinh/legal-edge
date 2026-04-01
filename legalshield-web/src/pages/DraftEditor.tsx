import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
    BookOpen,
    Bot,
    Download,
    FilePlus2,
    FileText,
    Loader2,
    Save,
    Search,
    ShieldAlert,
    Sparkles,
    Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { SplitView } from '../components/layout/SplitView'
import { Typography } from '../components/ui/Typography'
import { Button } from '../components/ui/Button'
import { RiskBadge } from '../components/ui/RiskBadge'
import { useEditorStore, type Clause, type DraftIntakeQuestion } from '../store'
import { supabase, analyzeRisks, exportToPDF, generateContractSuggestion } from '../lib/supabase'

const categoryColors: Record<string, string> = {
    'bảo mật': 'bg-blue-500/15 text-blue-200 border border-blue-400/20',
    'bồi thường': 'bg-rose-500/15 text-rose-200 border border-rose-400/20',
    'tranh chấp': 'bg-amber-500/15 text-amber-200 border border-amber-400/20',
    'thanh toán': 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20',
    'chung': 'bg-slate-500/15 text-slate-200 border border-slate-300/15',
}

type LibraryTab = 'templates' | 'clauses' | 'ai' | 'review'
type SortOption = 'relevant' | 'recent' | 'name'
type DraftInsertionTarget = 'append' | 'selection_replace' | 'cursor_insert'
type DraftActionMode = 'draft' | 'clause_insert' | 'rewrite'
type VerificationStatus = 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'

interface DraftEditorProps { clauseMode?: boolean }

interface SuggestionPayload {
    status?: 'ok' | 'needs_clarification' | 'document_type_mismatch'
    document_type?: string
    document_label?: string
    mismatch_reason?: string
    content: string
    source_action: DraftActionMode
    citations: Array<{
        citation_text: string
        citation_url: string
        source_domain: string
        source_title: string
        source_excerpt: string
        source_type: 'official' | 'secondary' | 'document_context'
        verification_status: VerificationStatus
    }>
    verification_status: VerificationStatus
    verification_summary: {
        requires_citation: boolean
        verification_status: VerificationStatus
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
    clarification_pack?: {
        title: string
        description?: string
        questions: DraftIntakeQuestion[]
    }
    template_references?: Array<{
        title: string
        url: string
        source_domain: string
        source_type: 'official' | 'secondary' | 'document_context'
        note?: string
    }>
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

function inferKind(item: { title: string; content: string; kind?: Clause['kind'] }): Clause['kind'] {
    if (item.kind) return item.kind

    const normalized = `${item.title}\n${item.content}`.toLowerCase()
    if (
        item.content.length > 1400 ||
        normalized.includes('cộng hòa xã hội chủ nghĩa') ||
        normalized.includes('điều 1') ||
        normalized.includes('hợp đồng')
    ) {
        return 'full_template'
    }

    return 'clause_snippet'
}

function formatDraftAsHtml(title: string, content: string) {
    const safeLines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('')

    return `<h1>${title || 'HỢP ĐỒNG'}</h1>${safeLines}`
}

function applyInsertion(currentDraft: string, insertedText: string, target: DraftInsertionTarget, selection: { start: number; end: number }) {
    const normalizedInserted = insertedText.trim()

    if (target === 'selection_replace' && selection.end > selection.start) {
        return `${currentDraft.slice(0, selection.start)}${normalizedInserted}${currentDraft.slice(selection.end)}`.trim()
    }

    if (target === 'cursor_insert') {
        const prefix = currentDraft.slice(0, selection.start)
        const suffix = currentDraft.slice(selection.end)
        const joinerBefore = prefix.trim() ? '\n\n' : ''
        const joinerAfter = suffix.trim() ? '\n\n' : ''
        return `${prefix}${joinerBefore}${normalizedInserted}${joinerAfter}${suffix}`.trim()
    }

    return currentDraft.trim() ? `${currentDraft.trim()}\n\n${normalizedInserted}` : normalizedInserted
}

export function DraftEditor({ clauseMode = false }: DraftEditorProps) {
    const {
        activeDraftId,
        draftTitle,
        activeDraft,
        searchQuery,
        draftRequest,
        intakeQuestions,
        intakeAnswers,
        resolvedDocumentLabel,
        setDraft,
        setDraftDocument,
        setDraftTitle,
        setSearch,
        clauseLibrary,
        setClauseLibrary,
        insertClause,
        recentClauseIds,
        setDraftRequest,
        setIntakePack,
        setIntakeAnswer,
        clearIntake,
        resetDraft,
    } = useEditorStore()

    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [sortBy, setSortBy] = useState<SortOption>('relevant')
    const [activeTab, setActiveTab] = useState<LibraryTab>(clauseMode ? 'clauses' : 'templates')
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved')
    const [isSaving, setIsSaving] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isReviewing, setIsReviewing] = useState(false)
    const [suggestion, setSuggestion] = useState<SuggestionPayload | null>(null)
    const [reviewPayload, setReviewPayload] = useState<{
        scope: 'selection' | 'full'
        risks: any[]
        verification_summary?: {
            citation_count: number
            official_count: number
            secondary_count: number
            unsupported_claim_count: number
        }
    } | null>(null)

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const autosaveTimerRef = useRef<number | null>(null)
    const hasLoadedRef = useRef(false)
    const selectionRef = useRef({ start: 0, end: 0 })

    useEffect(() => {
        const fetchTemplates = async () => {
            const { data, error } = await supabase.from('templates').select('*').order('created_at', { ascending: false })
            if (error || !data) return

            const mapped = data.map((item: any) => ({
                id: item.id,
                title: item.name,
                category: item.category || 'chung',
                content: item.content_md,
                kind: inferKind({ title: item.name, content: item.content_md, kind: item.template_kind }),
                source_type: 'curated' as const,
            }))

            setClauseLibrary(mapped)
        }

        void fetchTemplates()
    }, [setClauseLibrary])

    useEffect(() => {
        hasLoadedRef.current = true
    }, [])

    const categories = useMemo(() => {
        const quickCategories = ['all', 'phổ biến', 'thanh toán', 'bảo mật', 'bồi thường', 'tranh chấp', 'chung']
        const dynamic = Array.from(new Set(clauseLibrary.map((item) => item.category))).filter(Boolean)
        return Array.from(new Set([...quickCategories, ...dynamic]))
    }, [clauseLibrary])

    const libraryItems = useMemo(() => {
        const targetKind: Clause['kind'] = activeTab === 'templates' ? 'full_template' : 'clause_snippet'
        const baseItems = clauseLibrary.filter((item) => inferKind(item) === targetKind)

        const filtered = baseItems.filter((item) => {
            const matchesSearch = !searchQuery.trim() || `${item.title} ${item.content}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
            const matchesCategory = selectedCategory === 'all'
                || (selectedCategory === 'phổ biến' ? recentClauseIds.includes(item.id) : item.category === selectedCategory)

            return matchesSearch && matchesCategory
        })

        if (sortBy === 'name') {
            return [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'vi'))
        }

        if (sortBy === 'recent') {
            return [...filtered].sort((a, b) => {
                const indexA = recentClauseIds.indexOf(a.id)
                const indexB = recentClauseIds.indexOf(b.id)
                return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB)
            })
        }

        return [...filtered].sort((a, b) => {
            const recentBoostA = recentClauseIds.includes(a.id) ? 1 : 0
            const recentBoostB = recentClauseIds.includes(b.id) ? 1 : 0
            return recentBoostB - recentBoostA || b.content.length - a.content.length
        })
    }, [activeTab, clauseLibrary, recentClauseIds, searchQuery, selectedCategory, sortBy])

    const selectedItem = useMemo(
        () => libraryItems.find((item) => item.id === selectedItemId) || libraryItems[0] || null,
        [libraryItems, selectedItemId]
    )

    useEffect(() => {
        if (!selectedItemId && libraryItems[0]) {
            setSelectedItemId(libraryItems[0].id)
        }
        if (selectedItemId && !libraryItems.some((item) => item.id === selectedItemId)) {
            setSelectedItemId(libraryItems[0]?.id ?? null)
        }
    }, [libraryItems, selectedItemId])

    const persistDraft = useCallback(async (intent: 'manual' | 'autosave') => {
        if (!draftTitle.trim() && !activeDraft.trim()) return

        setSaveState('saving')
        setIsSaving(intent === 'manual')

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
                const { error } = await supabase
                    .from('contracts')
                    .update(payload)
                    .eq('id', activeDraftId)
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
            if (intent === 'manual') {
                toast.success('Đã lưu bản thảo.')
            }
        } catch (err) {
            console.error('Save failed:', err)
            setSaveState('unsaved')
            toast.error((err as Error).message || 'Không thể lưu bản thảo.')
        } finally {
            setIsSaving(false)
        }
    }, [activeDraft, activeDraftId, draftTitle, setDraftDocument])

    useEffect(() => {
        if (!hasLoadedRef.current) return

        setSaveState('unsaved')
        if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)

        if (!activeDraft.trim() && !draftTitle.trim()) return

        autosaveTimerRef.current = window.setTimeout(() => {
            void persistDraft('autosave')
        }, 1500)

        return () => {
            if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
        }
    }, [activeDraft, draftTitle, persistDraft])

    const updateSelection = () => {
        const textarea = textareaRef.current
        if (!textarea) return
        selectionRef.current = {
            start: textarea.selectionStart || 0,
            end: textarea.selectionEnd || 0,
        }
    }

    const handleInsertSelectedItem = (target: DraftInsertionTarget) => {
        if (!selectedItem) return
        insertClause(clauseLibrary, selectedItem.id, target, selectionRef.current)
        setSuggestion(null)
        toast.success(target === 'append' ? 'Đã chèn điều khoản vào cuối bản thảo.' : 'Đã chèn điều khoản vào vị trí đang chọn.')
        textareaRef.current?.focus()
    }

    const handleUseTemplate = () => {
        if (!selectedItem) return
        setDraftDocument({
            title: selectedItem.title,
            content: selectedItem.content,
        })
        setSuggestion(null)
        toast.success('Đã dùng mẫu làm nền cho bản thảo.')
    }

    const handleExport = async () => {
        setIsExporting(true)
        try {
            const payload = await exportToPDF(formatDraftAsHtml(draftTitle, activeDraft), activeDraftId || undefined)
            window.open(payload.pdf_url, '_blank', 'noopener,noreferrer')
            toast.success(`Đã tạo PDF (${payload.size_kb} KB).`)
        } catch (err) {
            console.error('Export failed:', err)
            toast.error('Không thể xuất PDF.')
        } finally {
            setIsExporting(false)
        }
    }

    const handleDraftAction = async (mode: DraftActionMode, explicitAnswers?: Record<string, string>) => {
        if (!draftRequest.trim() && mode !== 'rewrite') {
            toast.error('Vui lòng nhập yêu cầu cho AI.')
            return
        }

        if (mode === 'rewrite' && selectionRef.current.start === selectionRef.current.end) {
            toast.error('Hãy chọn một đoạn trong bản thảo trước khi yêu cầu AI viết lại.')
            return
        }

        setIsGenerating(true)
        try {
            const response = await generateContractSuggestion({
                prompt: mode === 'rewrite' ? (draftRequest.trim() || 'Viết lại đoạn này theo văn phong chặt chẽ hơn.') : draftRequest.trim(),
                template_id: mode === 'draft' ? selectedItem?.kind === 'full_template' ? selectedItem.id : undefined : undefined,
                current_draft: activeDraft,
                selection_context: mode === 'rewrite'
                    ? activeDraft.slice(selectionRef.current.start, selectionRef.current.end)
                    : mode === 'clause_insert'
                        ? activeDraft.slice(Math.max(0, selectionRef.current.start - 300), selectionRef.current.end + 300)
                        : undefined,
                intake_answers: explicitAnswers,
                mode,
            })

            const nextSuggestion = {
                ...response,
                source_action: mode,
            } satisfies SuggestionPayload

            if (response.status === 'needs_clarification' || response.status === 'document_type_mismatch') {
                setIntakePack({
                    questions: response.clarification_pack?.questions ?? [],
                    documentType: response.document_type ?? null,
                    documentLabel: response.document_label ?? null,
                })
            } else {
                clearIntake()
            }

            setSuggestion(nextSuggestion)
            setActiveTab('ai')
        } catch (err) {
            console.error('AI drafting failed:', err)
            toast.error('AI chưa thể tạo đề xuất cho yêu cầu này.')
        } finally {
            setIsGenerating(false)
        }
    }

    const handleSubmitClarification = async () => {
        const missingRequired = intakeQuestions.filter((question) => question.required && !intakeAnswers[question.id]?.trim())
        if (missingRequired.length > 0) {
            toast.error('Hãy trả lời các mục bắt buộc trước khi tạo bản nháp.')
            return
        }

        await handleDraftAction('draft', intakeAnswers)
    }

    const handleApplySuggestion = () => {
        if (!suggestion || suggestion.status !== 'ok') return

        if (suggestion.source_action === 'draft') {
            setDraft(suggestion.content)
            if (!draftTitle || draftTitle === 'Bản thảo hợp đồng') {
                setDraftTitle(selectedItem?.title || suggestion.document_label || 'Bản thảo AI')
            }
        } else {
            const target: DraftInsertionTarget = suggestion.source_action === 'rewrite'
                ? 'selection_replace'
                : (selectionRef.current.start !== selectionRef.current.end ? 'cursor_insert' : 'append')
            const nextDraft = applyInsertion(activeDraft, suggestion.content, target, selectionRef.current)
            setDraft(nextDraft)
        }

        clearIntake()
        toast.success('Đã áp dụng đề xuất AI vào bản thảo.')
    }

    const handleRiskReview = async (scope: 'selection' | 'full') => {
        const selectedText = activeDraft.slice(selectionRef.current.start, selectionRef.current.end).trim()
        const clauseText = scope === 'selection' ? selectedText : activeDraft.trim()

        if (!clauseText) {
            toast.error(scope === 'selection' ? 'Hãy chọn một đoạn để phân tích.' : 'Bản thảo đang trống.')
            return
        }

        setIsReviewing(true)
        try {
            const data = await analyzeRisks(clauseText, scope === 'selection' ? activeDraft : undefined)
            setReviewPayload({
                scope,
                risks: data.risks || [],
                verification_summary: (data as any).verification_summary,
            })
            setActiveTab('review')
        } catch (err) {
            console.error('Risk review failed:', err)
            toast.error('Không thể phân tích rủi ro lúc này.')
        } finally {
            setIsReviewing(false)
        }
    }

    const leftTabs: Array<{ id: LibraryTab; label: string; icon: typeof BookOpen }> = [
        { id: 'templates', label: 'Mẫu', icon: FilePlus2 },
        { id: 'clauses', label: 'Điều khoản', icon: BookOpen },
        { id: 'ai', label: 'AI Assist', icon: Bot },
        { id: 'review', label: 'Review', icon: ShieldAlert },
    ]

    const libraryPanel = (
        <div className="h-full flex flex-col border-r border-slate-border bg-navy-base">
            <div className="p-4 border-b border-slate-border space-y-3">
                <div className="grid grid-cols-4 gap-2">
                    {leftTabs.map((tab) => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={clsx(
                                    'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                                    activeTab === tab.id
                                        ? 'border-gold-primary bg-gold-primary/10 text-gold-primary'
                                        : 'border-slate-border text-slate-muted hover:border-slate-muted hover:text-paper-dark'
                                )}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                {(activeTab === 'templates' || activeTab === 'clauses') && (
                    <>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={activeTab === 'templates' ? 'Tìm mẫu hợp đồng...' : 'Tìm điều khoản...'}
                                className="w-full pl-9 pr-3 py-2 text-sm bg-navy-base border border-slate-border rounded-md text-paper-dark placeholder-slate-muted focus:outline-none focus:border-gold-primary transition-colors"
                            />
                        </div>

                        <div className="flex gap-1.5 flex-wrap">
                            {categories.map((category) => (
                                <button
                                    key={category}
                                    onClick={() => setSelectedCategory(category)}
                                    className={clsx(
                                        'px-2.5 py-1 text-xs rounded-full border transition-colors',
                                        selectedCategory === category
                                            ? 'border-gold-primary text-gold-primary bg-gold-primary/10'
                                            : 'border-slate-border text-slate-muted hover:border-slate-muted'
                                    )}
                                >
                                    {category === 'all' ? 'Tất cả' : category}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'relevant' as const, label: 'Liên quan' },
                                { id: 'recent' as const, label: 'Gần đây' },
                                { id: 'name' as const, label: 'Theo tên' },
                            ].map((option) => (
                                <button
                                    key={option.id}
                                    onClick={() => setSortBy(option.id)}
                                    className={clsx(
                                        'rounded-md border px-2 py-1.5 text-xs transition-colors',
                                        sortBy === option.id
                                            ? 'border-gold-primary bg-gold-primary/10 text-gold-primary'
                                            : 'border-slate-border text-slate-muted hover:text-paper-dark'
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {(activeTab === 'templates' || activeTab === 'clauses') && (
                <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)_auto]">
                    <div className="overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {libraryItems.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-border p-4 text-sm text-slate-muted">
                                Chưa có dữ liệu phù hợp. Hãy thử tìm kiếm hoặc thêm mẫu vào bảng `templates`.
                            </div>
                        )}
                        {libraryItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setSelectedItemId(item.id)}
                                className={clsx(
                                    'w-full text-left p-3 rounded-xl border transition-colors',
                                    selectedItem?.id === item.id
                                        ? 'border-gold-primary bg-gold-primary/5'
                                        : 'border-slate-border bg-navy-elevated hover:border-gold-muted'
                                )}
                            >
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className={clsx('text-[11px] px-2 py-0.5 rounded-full capitalize', categoryColors[item.category] ?? categoryColors['chung'])}>
                                        {item.category}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-[0.16em] text-slate-muted">
                                        {item.source_type === 'curated' ? 'mẫu nội bộ' : item.source_type}
                                    </span>
                                </div>
                                <Typography variant="body" className="text-sm font-medium">{item.title}</Typography>
                                <p className="mt-2 text-xs leading-5 text-slate-muted line-clamp-3">
                                    {item.content}
                                </p>
                            </button>
                        ))}
                    </div>

                    <div className="border-t border-slate-border p-4 space-y-3 bg-navy-elevated/40">
                        <div className="space-y-1">
                            <Typography variant="label">{activeTab === 'templates' ? 'Xem trước mẫu' : 'Xem trước điều khoản'}</Typography>
                            <Typography variant="body" className="text-sm font-medium">{selectedItem?.title || 'Chưa chọn nội dung'}</Typography>
                        </div>
                        <div className="rounded-xl border border-slate-border bg-navy-base/60 p-4 text-sm leading-6 text-paper-dark/80 max-h-48 overflow-y-auto">
                            {selectedItem?.content || 'Chọn một nội dung từ thư viện để xem trước.'}
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {activeTab === 'templates' ? (
                                <>
                                    <Button variant="outline" size="sm" onClick={handleUseTemplate} disabled={!selectedItem}>
                                        <FileText size={14} />
                                        Dùng làm nền bản thảo
                                    </Button>
                                    {clauseMode && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                handleUseTemplate()
                                                setActiveTab('clauses')
                                            }}
                                            disabled={!selectedItem}
                                        >
                                            <BookOpen size={14} />
                                            Tạo bản thảo từ mẫu này
                                        </Button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => handleInsertSelectedItem('append')} disabled={!selectedItem}>
                                        <BookOpen size={14} />
                                        Chèn vào cuối
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleInsertSelectedItem('cursor_insert')} disabled={!selectedItem}>
                                        <Wand2 size={14} />
                                        Chèn tại vị trí con trỏ
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleInsertSelectedItem('selection_replace')} disabled={!selectedItem}>
                                        <Sparkles size={14} />
                                        Thay thế đoạn đang chọn
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ai' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                    <div className="space-y-2">
                        <Typography variant="label">AI drafting assist</Typography>
                        <textarea
                            value={draftRequest}
                            onChange={(e) => setDraftRequest(e.target.value)}
                            placeholder="Ví dụ: Tôi cần hợp đồng dịch vụ marketing cho công ty nhỏ, thanh toán 3 đợt, có bảo mật dữ liệu khách hàng và phạt chậm thanh toán."
                            className="min-h-[120px] w-full rounded-xl border border-slate-border bg-navy-elevated px-4 py-3 text-sm text-paper-dark outline-none placeholder:text-slate-muted focus:border-gold-primary"
                        />
                        <p className="text-xs leading-5 text-slate-muted">
                            Hãy mô tả bằng ngôn ngữ bình thường. AI sẽ tự kiểm tra bạn đang cần đúng loại hợp đồng/hồ sơ nào, tra cứu căn cứ và gom câu hỏi còn thiếu để bạn trả lời một lần.
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleDraftAction('draft')} disabled={isGenerating}>
                                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
                                Phân tích yêu cầu & chuẩn bị bản nháp
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDraftAction('clause_insert')} disabled={isGenerating}>
                                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                                Chèn điều khoản theo mô tả
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDraftAction('rewrite')} disabled={isGenerating}>
                                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                Viết lại đoạn đang chọn
                            </Button>
                        </div>
                    </div>

                    {suggestion?.clarification_pack && (
                        <div className="rounded-2xl border border-gold-primary/20 bg-gold-primary/5 p-4 space-y-4">
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                    <Typography variant="label">{suggestion.clarification_pack.title}</Typography>
                                    <span className="rounded-full border border-gold-primary/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-primary">
                                        {suggestion.status === 'document_type_mismatch' ? 'Đã chỉnh loại tài liệu' : 'Cần làm rõ'}
                                    </span>
                                </div>
                                <p className="text-sm leading-6 text-paper-dark/80">
                                    {suggestion.mismatch_reason || suggestion.clarification_pack.description}
                                </p>
                                {resolvedDocumentLabel && (
                                    <p className="text-xs uppercase tracking-[0.16em] text-slate-muted">
                                        Loại tài liệu đang xử lý: {resolvedDocumentLabel}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-3">
                                {intakeQuestions.map((question) => (
                                    <div key={question.id} className="space-y-1.5">
                                        <label className="text-sm font-medium text-paper-dark">
                                            {question.label}
                                            {question.required && <span className="ml-1 text-rose-300">*</span>}
                                        </label>
                                        <textarea
                                            value={intakeAnswers[question.id] ?? ''}
                                            onChange={(e) => setIntakeAnswer(question.id, e.target.value)}
                                            placeholder={question.placeholder}
                                            className="min-h-[88px] w-full rounded-xl border border-slate-border bg-navy-elevated px-4 py-3 text-sm text-paper-dark outline-none placeholder:text-slate-muted focus:border-gold-primary"
                                        />
                                        {question.help_text && (
                                            <p className="text-xs text-slate-muted">{question.help_text}</p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <Button variant="outline" size="sm" onClick={() => void handleSubmitClarification()} disabled={isGenerating}>
                                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                Tạo bản nháp từ bộ trả lời này
                            </Button>
                        </div>
                    )}

                    <div className="rounded-2xl border border-slate-border bg-navy-elevated/50 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <Typography variant="label">Đề xuất AI</Typography>
                            {suggestion && <VerificationBadge status={suggestion.verification_status} />}
                        </div>
                        <div className="max-h-[240px] overflow-y-auto rounded-xl bg-navy-base/60 p-4 text-sm leading-6 text-paper-dark/85 whitespace-pre-wrap">
                            {suggestion?.content || 'Đề xuất AI sẽ hiển thị ở đây. Nội dung không tự chèn vào bản thảo cho đến khi bạn bấm Áp dụng.'}
                        </div>
                        {suggestion?.verification_summary && (
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-muted">
                                <div>{suggestion.verification_summary.official_count} nguồn chính thống</div>
                                <div>{suggestion.verification_summary.secondary_count} nguồn thứ cấp</div>
                                <div>{suggestion.verification_summary.citation_count} citation</div>
                                <div>{suggestion.verification_summary.unsupported_claim_count} claim cần kiểm tra</div>
                            </div>
                        )}
                        {suggestion?.template_references && suggestion.template_references.length > 0 && (
                            <div className="space-y-2">
                                <Typography variant="label">Mẫu tham khảo đã thu thập</Typography>
                                {suggestion.template_references.map((reference) => (
                                    <a
                                        key={reference.url}
                                        href={reference.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block rounded-lg border border-slate-border bg-navy-base/60 px-3 py-2 text-xs text-paper-dark hover:border-gold-muted"
                                    >
                                        <div className="font-semibold">{reference.title}</div>
                                        <div className="text-slate-muted">{reference.source_domain}</div>
                                        {reference.note && <div className="mt-1 text-slate-muted/90">{reference.note}</div>}
                                    </a>
                                ))}
                            </div>
                        )}
                        {suggestion?.claim_audit && suggestion.claim_audit.length > 0 && (
                            <div className="space-y-2">
                                {suggestion.claim_audit.filter((item) => !item.supported).slice(0, 2).map((item) => (
                                    <div key={item.claim} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                                        {item.claim}
                                    </div>
                                ))}
                            </div>
                        )}
                        {suggestion?.citations && suggestion.citations.length > 0 && (
                            <div className="space-y-2">
                                {suggestion.citations.slice(0, 2).map((citation) => (
                                    <a
                                        key={citation.citation_url}
                                        href={citation.citation_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block rounded-lg border border-slate-border bg-navy-base/60 px-3 py-2 text-xs text-paper-dark hover:border-gold-muted"
                                    >
                                        <div className="font-semibold">{citation.citation_text}</div>
                                        <div className="text-slate-muted">{citation.source_domain}</div>
                                    </a>
                                ))}
                            </div>
                        )}
                        <Button variant="outline" size="sm" onClick={handleApplySuggestion} disabled={!suggestion || suggestion.status !== 'ok'}>
                            <Sparkles size={14} />
                            Áp dụng vào bản thảo
                        </Button>
                    </div>
                </div>
            )}

            {activeTab === 'review' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleRiskReview('selection')} disabled={isReviewing}>
                            {isReviewing ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                            Quick review đoạn chọn
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRiskReview('full')} disabled={isReviewing}>
                            {isReviewing ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                            Full review toàn bộ bản thảo
                        </Button>
                    </div>

                    <div className="rounded-2xl border border-slate-border bg-navy-elevated/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Typography variant="label">Kết quả review</Typography>
                            {reviewPayload && (
                                <span className="text-xs uppercase tracking-[0.16em] text-slate-muted">
                                    {reviewPayload.scope === 'selection' ? 'Đoạn chọn' : 'Toàn bộ'}
                                </span>
                            )}
                        </div>
                        {reviewPayload?.verification_summary && (
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-muted">
                                <div>{reviewPayload.verification_summary.official_count} nguồn chính thống</div>
                                <div>{reviewPayload.verification_summary.secondary_count} nguồn thứ cấp</div>
                                <div>{reviewPayload.verification_summary.citation_count} citation</div>
                                <div>{reviewPayload.verification_summary.unsupported_claim_count} claim chưa khớp</div>
                            </div>
                        )}
                        <div className="space-y-3">
                            {(reviewPayload?.risks || []).length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-border px-4 py-6 text-sm text-slate-muted">
                                    Chưa có kết quả. Chọn một đoạn hoặc phân tích toàn bộ bản thảo để xem risk cards.
                                </div>
                            )}
                            {(reviewPayload?.risks || []).map((risk: any) => (
                                <div key={`${risk.clause_ref}-${risk.description}`} className="rounded-xl border border-slate-border bg-navy-base/70 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <RiskBadge level={risk.level} />
                                        <VerificationBadge status={risk.verification_status} />
                                    </div>
                                    <Typography variant="body" className="text-sm font-medium">{risk.clause_ref}</Typography>
                                    <p className="text-sm leading-6 text-paper-dark/80">{risk.description}</p>
                                    {risk.citation_text && (
                                        <a href={risk.citation_url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-border px-3 py-2 text-xs text-gold-primary hover:border-gold-muted">
                                            {risk.citation_text}
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )

    const editorPanel = (
        <div className="h-full flex flex-col bg-grid">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-border">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl border border-gold-primary/20 bg-gold-primary/10 flex items-center justify-center text-gold-primary">
                        <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                        <Typography variant="label">Bản thảo hợp đồng</Typography>
                        <div className="mt-1 flex items-center gap-2">
                            <input
                                value={draftTitle}
                                onChange={(e) => setDraftTitle(e.target.value)}
                                placeholder="Tên bản thảo"
                                className="min-w-[260px] max-w-[420px] rounded-md border border-slate-border bg-navy-elevated px-3 py-2 text-sm text-paper-dark outline-none focus:border-gold-primary"
                            />
                            <span className={clsx(
                                'text-xs uppercase tracking-[0.16em]',
                                saveState === 'saved' ? 'text-emerald-300' : saveState === 'saving' ? 'text-gold-primary' : 'text-slate-muted'
                            )}>
                                {saveState === 'saved' ? 'Đã lưu' : saveState === 'saving' ? 'Đang lưu' : 'Chưa lưu'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void persistDraft('manual')} disabled={isSaving}>
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Lưu bản thảo
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleExport} disabled={isExporting}>
                        {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Xuất PDF
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRiskReview('selection')} disabled={isReviewing}>
                        {isReviewing ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                        Review đoạn chọn
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRiskReview('full')} disabled={isReviewing}>
                        {isReviewing ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                        Review toàn bộ
                    </Button>
                    <Button variant="ghost" size="sm" onClick={resetDraft}>
                        <FilePlus2 size={14} />
                        Bản nháp mới
                    </Button>
                </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto">
                <div className="max-w-[760px] mx-auto bg-paper-light text-navy-base rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.28)] min-h-[960px] p-10 border border-black/5">
                    <h1 className="font-serif text-4xl font-bold text-center mb-8 uppercase tracking-wide">
                        {draftTitle || 'HỢP ĐỒNG'}
                    </h1>
                    <textarea
                        ref={textareaRef}
                        value={activeDraft}
                        onChange={(e) => setDraft(e.target.value)}
                        onSelect={updateSelection}
                        onKeyUp={updateSelection}
                        onClick={updateSelection}
                        spellCheck={false}
                        placeholder="Bắt đầu soạn thảo, chèn điều khoản từ thư viện, hoặc dùng AI để tạo đề xuất..."
                        className="w-full h-full min-h-[780px] bg-transparent resize-none outline-none text-navy-base font-sans text-[15px] leading-8"
                    />
                </div>
            </div>
        </div>
    )

    return (
        <SplitView
            ratio={clauseMode ? '33/67' : '25/75'}
            left={libraryPanel}
            right={editorPanel}
            className="h-full"
        />
    )
}

import { create } from 'zustand'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

// --- Global UI State ---
interface UIState {
    sidebarExpanded: boolean
    activeModal: 'none' | 'upload_contract' | 'settings'
    toggleSidebar: () => void
    setModal: (modal: UIState['activeModal']) => void
}

export const useUIStore = create<UIState>((set) => ({
    sidebarExpanded: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
    activeModal: 'none',
    toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
    setModal: (modal) => set({ activeModal: modal }),
}))

// --- Risk / Analysis State ---
export interface RiskBadge {
    id?: string
    clause_ref: string
    level: 'critical' | 'moderate' | 'note'
    description: string
    risk_quote?: string
    suggested_revision?: string
    citation: string
    citation_url?: string
    citation_text?: string
    source_domain?: string
    source_title?: string
    source_excerpt?: string
    source_type?: 'official' | 'secondary' | 'document_context'
    verification_status?: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'
    retrieved_at?: string
    evidence?: {
        title: string
        url: string
        content: string
        source_domain: string
        source_type: 'official' | 'secondary' | 'document_context'
        retrieved_at: string
        matched_article?: string
        score?: number
    }
}

interface AnalysisState {
    isAnalyzing: boolean
    currentDocumentId: string | null
    risks: RiskBadge[]
    isHashMatch: boolean
    setDocument: (id: string, isHashMatch?: boolean) => void
    setRisks: (risks: RiskBadge[]) => void
    startAnalysis: () => void
    addRisk: (risk: RiskBadge) => void
    clearRisks: () => void
}

import { persist, createJSONStorage } from 'zustand/middleware'
import { get, set, del } from 'idb-keyval'

// Custom storage using IndexedDB (idb-keyval)
const storage = {
    getItem: async (name: string) => (await get(name)) || null,
    setItem: async (name: string, value: string) => await set(name, value),
    removeItem: async (name: string) => await del(name),
}

export const useAnalysisStore = create<AnalysisState>()(
    persist(
        (set) => ({
            isAnalyzing: false,
            currentDocumentId: null,
            risks: [],
            isHashMatch: false,
            setDocument: (id, isHashMatch = false) => set({ currentDocumentId: id, isHashMatch }),
            setRisks: (risks) => set({ risks, isAnalyzing: false }),
            startAnalysis: () => set({ isAnalyzing: true, risks: [] }),
            addRisk: (risk) => set((s) => ({ risks: [...s.risks, risk] })),
            clearRisks: () => set({ risks: [], isAnalyzing: false, currentDocumentId: null, isHashMatch: false }),
        }),
        {
            name: 'legalshield-analysis-storage',
            storage: createJSONStorage(() => storage),
        }
    )
)

// --- Upload State (Analysis view) ---
interface UploadState {
    file: File | null
    attachments: string[]
    status: 'idle' | 'uploading' | 'parsing' | 'success' | 'error'
    progress: number
    extractedText: string | null
    error: string | null
    setFile: (file: File) => void
    setAttachments: (attachments: string[]) => void
    addAttachment: (attachment: string) => void
    removeAttachment: (index: number) => void
    setStatus: (status: UploadState['status'], progress?: number) => void
    setExtractedText: (text: string) => void
    setError: (error: string | null) => void
    reset: () => void
}

export const useUploadStore = create<UploadState>((set) => ({
    file: null,
    attachments: [],
    status: 'idle',
    progress: 0,
    extractedText: null,
    error: null,
    setFile: (file) => set({ file, status: 'idle', progress: 0, error: null, attachments: [] }),
    setAttachments: (attachments) => set({ attachments }),
    addAttachment: (attachment) => set((s) => ({ attachments: [...s.attachments, attachment] })),
    removeAttachment: (index) => set((s) => ({ attachments: s.attachments.filter((_, i) => i !== index) })),
    setStatus: (status, progress = 0) => set({ status, progress }),
    setExtractedText: (text) => set({ extractedText: text, status: 'success', progress: 100 }),
    setError: (error) => set({ error, status: 'error' }),
    reset: () => set({ file: null, status: 'idle', progress: 0, extractedText: null, error: null, attachments: [] }),
}))

// --- User / Billing State ---
interface UserState {
    user: { id: string; email: string; name: string; username?: string; avatarUrl?: string } | null
    subscription: 'free' | 'pro' | 'enterprise'
    apiCallsUsed: number
    apiCallsLimit: number
    setUser: (user: UserState['user']) => void
    setSubscription: (plan: UserState['subscription']) => void
    syncUser: () => Promise<void>
    syncSubscription: (userId: string) => Promise<void>
    logout: () => Promise<void>
}

export const useUserStore = create<UserState>((set) => ({
    user: null,
    subscription: 'free',
    apiCallsUsed: 0,
    apiCallsLimit: 10,
    setUser: (user) => set({ user }),
    setSubscription: (subscription) => set({ subscription }),
    syncUser: async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
            set({ user: null, subscription: 'free', apiCallsUsed: 0, apiCallsLimit: 10 })
            return
        }

        const { data: profile } = await supabase
            .from('users')
            .select('full_name, avatar_url')
            .eq('id', authUser.id)
            .maybeSingle()

        set({
            user: {
                id: authUser.id,
                email: authUser.email!,
                name: profile?.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'Người dùng',
                username: authUser.user_metadata?.username || authUser.email?.split('@')[0],
                avatarUrl: profile?.avatar_url || authUser.user_metadata?.avatar_url || authUser.user_metadata?.avatar
            }
        })

        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('plan, api_calls_used, api_calls_limit')
            .eq('user_id', authUser.id)
            .maybeSingle()

        if (subscription) {
            set({
                subscription: subscription.plan as any,
                apiCallsUsed: subscription.api_calls_used,
                apiCallsLimit: subscription.api_calls_limit
            })
        }
    },
    syncSubscription: async (userId: string) => {
        const { data } = await supabase
            .from('subscriptions')
            .select('plan, api_calls_used, api_calls_limit')
            .eq('user_id', userId)
            .maybeSingle()

        if (data) {
            set({
                subscription: data.plan as any,
                apiCallsUsed: data.api_calls_used,
                apiCallsLimit: data.api_calls_limit
            })
        }
    },
    logout: async () => {
        await supabase.auth.signOut()
        set({ user: null, subscription: 'free', apiCallsUsed: 0, apiCallsLimit: 10 })
        window.location.href = '/'
    }
}))

// --- Payment Hook ---
export const usePayment = () => {
    const [isLoading, setIsLoading] = useState(false)
    const { user } = useUserStore()

    const processPayment = async (provider: 'stripe' | 'momo' | 'vnpay', planId: string = 'pro') => {
        if (!user) return
        setIsLoading(true)
        try {
            let res: any
            const origin = window.location.origin

            if (provider === 'momo') {
                res = await supabase.functions.invoke('momo-payment', {
                    body: {
                        plan_id: planId,
                        redirect_url: `${origin}/profile?momo=success`,
                        ipn_url: `${origin}/functions/v1/payment-webhook?provider=momo`
                    }
                })
            } else if (provider === 'vnpay') {
                res = await supabase.functions.invoke('vnpay-payment', {
                    body: { plan_id: planId, return_url: `${origin}/profile?vnpay=success` }
                })
            } else {
                res = await supabase.functions.invoke('create-checkout-session', {
                    body: {
                        plan_id: planId === 'pro' ? 'pro_monthly' : planId,
                        success_url: `${origin}/profile?success=true`,
                        cancel_url: `${origin}/profile?canceled=true`
                    }
                })
            }

            if (res.error) throw res.error
            if (res.data?.checkout_url) {
                window.location.href = res.data.checkout_url
            }
        } catch (err) {
            console.error(`${provider} payment error:`, err)
            throw err
        } finally {
            setIsLoading(false)
        }
    }

    return { processPayment, isLoading }
}

// --- Clause Editor State ---
export interface Clause {
    id: string
    category: string
    title: string
    content: string
    kind?: 'full_template' | 'clause_snippet'
    source_type?: 'curated' | 'web_crawled' | 'ai_generated' | 'user_saved'
    source_domain?: string | null
    source_note?: string | null
    source_url?: string | null
    template_file_url?: string | null
    preview_file_url?: string | null
    file_kind?: 'pdf' | 'doc' | 'docx' | 'html' | 'unknown'
}

export interface DraftIntakeQuestion {
    id: string
    label: string
    placeholder: string
    help_text?: string
    required?: boolean
}

interface EditorState {
    activeDraftId: string | null
    draftTitle: string
    activeDraft: string
    clauseLibrary: Clause[]
    searchQuery: string
    recentClauseIds: string[]
    draftRequest: string
    intakeQuestions: DraftIntakeQuestion[]
    intakeAnswers: Record<string, string>
    resolvedDocumentType: string | null
    resolvedDocumentLabel: string | null
    setDraft: (content: string) => void
    setDraftDocument: (payload: { id?: string | null; title?: string; content?: string }) => void
    setDraftTitle: (title: string) => void
    setSearch: (query: string) => void
    setClauseLibrary: (clauses: Clause[]) => void
    rememberClauseUse: (clauseId: string) => void
    insertClause: (clauses: Clause[], clauseId: string, target?: 'append' | 'selection_replace' | 'cursor_insert', selection?: { start: number; end: number }) => void
    setDraftRequest: (request: string) => void
    setIntakePack: (payload: { questions: DraftIntakeQuestion[]; documentType?: string | null; documentLabel?: string | null }) => void
    setIntakeAnswer: (questionId: string, answer: string) => void
    clearIntake: () => void
    resetDraft: () => void
}

export const useEditorStore = create<EditorState>()(
    persist(
        (set) => ({
            activeDraftId: null,
            draftTitle: 'Bản thảo hợp đồng',
            activeDraft: '',
            clauseLibrary: [],
            searchQuery: '',
            recentClauseIds: [],
            draftRequest: '',
            intakeQuestions: [],
            intakeAnswers: {},
            resolvedDocumentType: null,
            resolvedDocumentLabel: null,
            setDraft: (content) => set({ activeDraft: content }),
            setDraftDocument: ({ id, title, content }) => set((state) => ({
                activeDraftId: id ?? state.activeDraftId,
                draftTitle: title ?? state.draftTitle,
                activeDraft: content ?? state.activeDraft,
            })),
            setDraftTitle: (draftTitle) => set({ draftTitle }),
            setSearch: (query) => set({ searchQuery: query }),
            setClauseLibrary: (clauseLibrary) => set({ clauseLibrary }),
            rememberClauseUse: (clauseId) => set((state) => ({
                recentClauseIds: [clauseId, ...state.recentClauseIds.filter((id) => id !== clauseId)].slice(0, 12),
            })),
            insertClause: (clauses, clauseId, target = 'append', selection) => {
                const clause = clauses.find((c) => c.id === clauseId)
                if (!clause) return

                set((state) => {
                    const normalizedClause = clause.content.trim()
                    const currentDraft = state.activeDraft || ''

                    if (
                        (target === 'selection_replace' || target === 'cursor_insert') &&
                        selection &&
                        selection.start >= 0 &&
                        selection.end >= selection.start
                    ) {
                        const insertText = target === 'cursor_insert'
                            ? `${selection.start > 0 ? '\n\n' : ''}${normalizedClause}\n\n`
                            : normalizedClause
                        return {
                            activeDraft: `${currentDraft.slice(0, selection.start)}${insertText}${currentDraft.slice(selection.end)}`.trim(),
                            recentClauseIds: [clauseId, ...state.recentClauseIds.filter((id) => id !== clauseId)].slice(0, 12),
                        }
                    }

                    const nextDraft = currentDraft.trim()
                        ? `${currentDraft.trim()}\n\n${normalizedClause}`
                        : normalizedClause

                    return {
                        activeDraft: nextDraft,
                        recentClauseIds: [clauseId, ...state.recentClauseIds.filter((id) => id !== clauseId)].slice(0, 12),
                    }
                })
            },
            setDraftRequest: (draftRequest) => set({ draftRequest }),
            setIntakePack: ({ questions, documentType, documentLabel }) => set((state) => ({
                intakeQuestions: questions,
                resolvedDocumentType: documentType ?? state.resolvedDocumentType,
                resolvedDocumentLabel: documentLabel ?? state.resolvedDocumentLabel,
                intakeAnswers: questions.reduce<Record<string, string>>((acc, question) => {
                    acc[question.id] = state.intakeAnswers[question.id] ?? ''
                    return acc
                }, {}),
            })),
            setIntakeAnswer: (questionId, answer) => set((state) => ({
                intakeAnswers: {
                    ...state.intakeAnswers,
                    [questionId]: answer,
                },
            })),
            clearIntake: () => set({
                intakeQuestions: [],
                intakeAnswers: {},
                resolvedDocumentType: null,
                resolvedDocumentLabel: null,
            }),
            resetDraft: () => set({
                activeDraftId: null,
                draftTitle: 'Bản thảo hợp đồng',
                activeDraft: '',
                searchQuery: '',
                draftRequest: '',
                intakeQuestions: [],
                intakeAnswers: {},
                resolvedDocumentType: null,
                resolvedDocumentLabel: null,
            }),
        }),
        {
            name: 'legalshield-editor-storage',
            storage: createJSONStorage(() => storage),
            partialize: (state) => ({
                activeDraftId: state.activeDraftId,
                draftTitle: state.draftTitle,
                activeDraft: state.activeDraft,
                searchQuery: state.searchQuery,
                recentClauseIds: state.recentClauseIds,
                draftRequest: state.draftRequest,
                intakeQuestions: state.intakeQuestions,
                intakeAnswers: state.intakeAnswers,
                resolvedDocumentType: state.resolvedDocumentType,
                resolvedDocumentLabel: state.resolvedDocumentLabel,
            }),
        }
    )
)

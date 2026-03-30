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
    sidebarExpanded: true,
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
    citation: string
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
    status: 'idle' | 'uploading' | 'parsing' | 'success' | 'error'
    progress: number
    extractedText: string | null
    error: string | null
    setFile: (file: File) => void
    setStatus: (status: UploadState['status'], progress?: number) => void
    setExtractedText: (text: string) => void
    setError: (error: string | null) => void
    reset: () => void
}

export const useUploadStore = create<UploadState>((set) => ({
    file: null,
    status: 'idle',
    progress: 0,
    extractedText: null,
    error: null,
    setFile: (file) => set({ file, status: 'idle', progress: 0, error: null }),
    setStatus: (status, progress = 0) => set({ status, progress }),
    setExtractedText: (text) => set({ extractedText: text, status: 'success', progress: 100 }),
    setError: (error) => set({ error, status: 'error' }),
    reset: () => set({ file: null, status: 'idle', progress: 0, extractedText: null, error: null }),
}))

// --- User / Billing State ---
interface UserState {
    user: { id: string; email: string; name: string; avatarUrl?: string } | null
    subscription: 'free' | 'pro' | 'enterprise'
    apiCallsUsed: number
    apiCallsLimit: number
    setUser: (user: UserState['user']) => void
    setSubscription: (plan: UserState['subscription']) => void
    syncSubscription: (userId: string) => Promise<void>
}

export const useUserStore = create<UserState>((set) => ({
    user: null,
    subscription: 'free',
    apiCallsUsed: 0,
    apiCallsLimit: 10,
    setUser: (user) => set({ user }),
    setSubscription: (subscription) => set({ subscription }),
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
    category: 'bảo mật' | 'bồi thường' | 'tranh chấp' | 'thanh toán' | 'chung'
    title: string
    content: string
}

interface EditorState {
    activeDraft: string
    clauseLibrary: Clause[]
    searchQuery: string
    setDraft: (content: string) => void
    setSearch: (query: string) => void
    insertClause: (clauses: Clause[], clauseId: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
    activeDraft: '',
    clauseLibrary: [],
    searchQuery: '',
    setDraft: (content) => set({ activeDraft: content }),
    setSearch: (query) => set({ searchQuery: query }),
    insertClause: (clauses, clauseId) => {
        const clause = clauses.find((c) => c.id === clauseId)
        if (clause) {
            set((s) => ({ activeDraft: s.activeDraft + '\n\n' + clause.content }))
        }
    },
}))

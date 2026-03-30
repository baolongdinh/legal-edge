import { create } from 'zustand'

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
    setDocument: (id: string) => void
    setRisks: (risks: RiskBadge[]) => void
    startAnalysis: () => void
    addRisk: (risk: RiskBadge) => void
    clearRisks: () => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
    isAnalyzing: false,
    currentDocumentId: null,
    risks: [],
    setDocument: (id) => set({ currentDocumentId: id }),
    setRisks: (risks) => set({ risks, isAnalyzing: false }),
    startAnalysis: () => set({ isAnalyzing: true, risks: [] }),
    addRisk: (risk) => set((s) => ({ risks: [...s.risks, risk] })),
    clearRisks: () => set({ risks: [], isAnalyzing: false, currentDocumentId: null }),
}))

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
}

export const useUserStore = create<UserState>((set) => ({
    user: null,
    subscription: 'free',
    apiCallsUsed: 0,
    apiCallsLimit: 10,
    setUser: (user) => set({ user }),
    setSubscription: (subscription) => set({ subscription }),
}))

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

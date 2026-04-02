import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[LegalShield] Missing Supabase env vars. Copy .env.example to .env.local and fill in values.')
}

// Uses Supabase's built-in JWT session token — goes through Supavisor pooler
// (PostgREST + Edge Functions APIs, never direct TCP to port 5432)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
})

// ─── API helpers ──────────────────────────────────────────────────────────────

const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`
const SESSION_CACHE_TTL_MS = 10_000

let cachedToken: { value: string | null; expiresAt: number } = {
    value: null,
    expiresAt: 0,
}

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
    const now = Date.now()
    if (!forceRefresh && cachedToken.expiresAt > now) {
        return cachedToken.value
    }

    const session = (await supabase.auth.getSession()).data.session
    cachedToken = {
        value: session?.access_token ?? null,
        expiresAt: now + SESSION_CACHE_TTL_MS,
    }
    return cachedToken.value
}

export async function getCurrentUser() {
    const { data } = await supabase.auth.getUser()
    return data.user
}

export async function invokeEdgeFunction<T>(
    name: string,
    options?: {
        body?: unknown
        method?: string
        headers?: Record<string, string>
        responseType?: 'json'
    }
): Promise<T>
export async function invokeEdgeFunction(
    name: string,
    options: {
        body?: unknown
        method?: string
        headers?: Record<string, string>
        responseType: 'response'
    }
): Promise<Response>
export async function invokeEdgeFunction<T>(
    name: string,
    options: {
        body?: unknown
        method?: string
        headers?: Record<string, string>
        responseType?: 'json' | 'response'
    } = {}
): Promise<T | Response> {
    const {
        body,
        method = 'POST',
        headers = {},
        responseType = 'json',
    } = options
    const accessToken = await getAccessToken()
    const authHeaders = {
        ...headers,
        Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
    }

    if (responseType === 'response' || body instanceof FormData || method !== 'POST') {
        const fetchHeaders = new Headers(authHeaders)
        if (!(body instanceof FormData) && !fetchHeaders.has('Content-Type')) {
            fetchHeaders.set('Content-Type', 'application/json')
        }

        const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
            method,
            headers: fetchHeaders,
            body: body instanceof FormData
                ? body
                : body === undefined
                    ? undefined
                    : JSON.stringify(body) as BodyInit,
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }))
            throw new Error(err.error ?? 'Edge Function error')
        }

        return responseType === 'response' ? res : res.json()
    }

    const { data, error } = await supabase.functions.invoke(name, {
        body: body as any,
        headers: authHeaders,
    })

    if (error) throw error
    return data as T
}

async function callFunction<T>(name: string, body: unknown): Promise<T> {
    return invokeEdgeFunction<T>(name, { body }) as Promise<T>
}

// Risk analysis
export async function analyzeRisks(clauseText: string, context?: string) {
    return callFunction<{ risks: import('../store').RiskBadge[] }>('risk-review', {
        clause_text: clauseText,
        contract_context: context,
    })
}

// Contract generation (returns SSE stream)
export async function generateContractStream(prompt: string, templateId?: string) {
    return invokeEdgeFunction('generate-contract', {
        body: { prompt, template_id: templateId },
        responseType: 'response',
    })
}

export async function generateContractSuggestion(body: {
    prompt: string
    template_id?: string
    current_draft?: string
    selection_context?: string
    mode?: 'draft' | 'clause_insert' | 'rewrite'
    intake_answers?: Record<string, string>
    parameters?: Record<string, unknown>
}) {
    return callFunction<{
        status?: 'ok' | 'needs_clarification' | 'document_type_mismatch'
        document_type?: string
        document_label?: string
        mismatch_reason?: string
        content: string
        citations: Array<{
            citation_text: string
            citation_url: string
            source_domain: string
            source_title: string
            source_excerpt: string
            source_type: 'official' | 'secondary' | 'document_context'
            verification_status: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'
        }>
        verification_status: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'
        verification_summary: {
            requires_citation: boolean
            verification_status: 'official_verified' | 'secondary_verified' | 'unsupported' | 'conflicted' | 'unverified'
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
            questions: Array<{
                id: string
                label: string
                placeholder: string
                help_text?: string
                required?: boolean
            }>
        }
        template_references?: Array<{
            title: string
            url: string
            source_domain: string
            source_type: 'official' | 'secondary' | 'document_context'
            note?: string
        }>
    }>('generate-contract', {
        ...body,
        response_mode: 'json',
    })
}

// Document upload & parse
export async function uploadAndParseDocument(file: File) {
    const form = new FormData()
    form.append('file', file)
    return invokeEdgeFunction('parse-document', { body: form })
}

export async function deleteFileAssets(body: {
    contract_id?: string
    document_id?: string
    delete_contract?: boolean
    delete_document?: boolean
}) {
    return callFunction<{ ok: boolean; deleted_contract: boolean; deleted_document: boolean }>('delete-file-assets', body)
}

// Export PDF (DEPRECATED: Use client-side lib/export.ts instead)
// export async function exportToPDF(htmlContent: string, contractId?: string) {
//     return callFunction<{ pdf_url: string; size_kb: number }>('export-pdf', {
//         html_content: htmlContent,
//         contract_id: contractId,
//     })
// }

// Create checkout session (Stripe)
export async function createCheckoutSession(planId: string) {
    return callFunction<{ checkout_url: string }>('create-checkout-session', {
        plan_id: planId,
        success_url: `${window.location.origin}/dashboard?success=true`,
        cancel_url: `${window.location.origin}/pricing?canceled=true`,
    })
}

// MoMo Payment
export async function createMomoPayment(planId: string) {
    return callFunction<{ checkout_url: string }>('momo-payment', {
        plan_id: planId,
        redirect_url: `${window.location.origin}/dashboard?momo=success`,
        ipn_url: `${supabaseUrl}/functions/v1/payment-webhook?provider=momo`,
    })
}

// VNPAY Payment
export async function createVnpayPayment(planId: string) {
    return callFunction<{ checkout_url: string }>('vnpay-payment', {
        plan_id: planId,
        return_url: `${window.location.origin}/dashboard?vnpay=success`,
    })
}

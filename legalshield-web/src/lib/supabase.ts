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

async function callFunction<T>(name: string, body: unknown): Promise<T> {
    const session = (await supabase.auth.getSession()).data.session
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
        },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Edge Function error')
    }
    return res.json()
}

// Risk analysis
export async function analyzeRisks(clauseText: string, context?: string) {
    return callFunction<{ risks: import('./store').RiskBadge[] }>('risk-review', {
        clause_text: clauseText,
        contract_context: context,
    })
}

// Contract generation (returns SSE stream)
export async function generateContractStream(prompt: string, templateId?: string) {
    const session = (await supabase.auth.getSession()).data.session
    return fetch(`${FUNCTIONS_URL}/generate-contract`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
        },
        body: JSON.stringify({ prompt, template_id: templateId }),
    })
}

// Document upload & parse
export async function uploadAndParseDocument(file: File) {
    const session = (await supabase.auth.getSession()).data.session
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${FUNCTIONS_URL}/parse-document`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}` },
        body: form,
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

// Export PDF
export async function exportToPDF(htmlContent: string, contractId?: string) {
    return callFunction<{ pdf_url: string; size_kb: number }>('export-pdf', {
        html_content: htmlContent,
        contract_id: contractId,
    })
}

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

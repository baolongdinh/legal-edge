// Shared types and utilities for all LegalShield Edge Functions
// Import path: ../shared/types.ts

export interface GeminiEmbedPayload {
    model: string
    content: { parts: { text: string }[] }
}

export interface GroqChatPayload {
    model: string
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
    temperature?: number
    max_tokens?: number
    response_format?: { type: 'json_object' }
}

export interface RiskClause {
    clause_ref: string
    level: 'critical' | 'moderate' | 'note'
    description: string
    citation: string
}

export interface ChunkMatch {
    id: string
    content: string
    law_article: string
    source_url: string
    similarity: number
}

// Embed text via Gemini text-embedding-004
export async function embedText(text: string, geminiKey: string): Promise<number[]> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } }),
        }
    )
    if (!res.ok) throw new Error(`Gemini embed error: ${await res.text()}`)
    const data = await res.json()
    return data.embedding.values as number[]
}

/**
 * Round-robin key selector.
 * Reads GEMINI_API_KEYS or GROQ_API_KEYS (comma-separated list) from env.
 * Uses a simple modulo counter so each invocation picks the next key in rotation.
 * Falls back to the legacy single-key env var if list not set.
 *
 * Usage:
 *   const key = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
 *   const key = roundRobinKey('GROQ_API_KEYS', 'GROQ_API_KEY')
 */
const _counters: Record<string, number> = {}

export function roundRobinKey(listEnvVar: string, fallbackEnvVar: string): string {
    const raw = Deno.env.get(listEnvVar) ?? ''
    const keys = raw.split(',').map((k: string) => k.trim()).filter(Boolean)

    // Fall back to legacy single key if list not provided
    if (keys.length === 0) {
        const single = Deno.env.get(fallbackEnvVar)
        if (!single) throw new Error(`Missing env var: ${listEnvVar} or ${fallbackEnvVar}`)
        return single
    }

    // Atomic-ish counter (Deno isolates are single-threaded per request, so this is safe)
    const idx = (_counters[listEnvVar] ?? 0) % keys.length
    _counters[listEnvVar] = idx + 1

    return keys[idx]
}

// CORS headers for browser requests
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function jsonResponse(data: unknown, status = 200, cacheSeconds = 0) {
    const headers: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '99',
        'X-Edge-First-Validated': 'true'
    }
    if (cacheSeconds > 0) {
        headers['Cache-Control'] = `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=600`
    }
    return new Response(JSON.stringify(data), {
        status,
        headers,
    })
}

export function errorResponse(message: string, status = 500) {
    return jsonResponse({ error: message }, status)
}

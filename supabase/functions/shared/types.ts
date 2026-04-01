// Shared types and utilities for all LegalShield Edge Functions
// Import path: ../shared/types.ts
import { Redis } from 'https://esm.sh/@upstash/redis@1.28.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AuthenticatedUser {
    id: string
    email?: string | null
    user_metadata?: Record<string, unknown>
}

export interface AuthenticatedRequestContext {
    authHeader: string
    token: string
    user: AuthenticatedUser
}

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
    citation_url?: string
    citation_text?: string
    source_domain?: string
    source_title?: string
    source_excerpt?: string
    source_type?: CitationSourceType
    verification_status?: CitationVerificationStatus
    retrieved_at?: string
    evidence?: LegalSourceEvidence
}

export interface ChunkMatch {
    id: string
    content: string
    law_article: string
    source_url: string
    similarity: number
}

export type CitationVerificationStatus =
    | 'official_verified'
    | 'secondary_verified'
    | 'unsupported'
    | 'conflicted'
    | 'unverified'

export type CitationSourceType = 'official' | 'secondary' | 'document_context'

export interface LegalSourceEvidence {
    title: string
    url: string
    content: string
    source_domain: string
    source_type: CitationSourceType
    retrieved_at: string
    matched_article?: string
    score?: number
}

export interface LegalCitation {
    citation_text: string
    citation_url: string
    source_domain: string
    source_title: string
    source_excerpt: string
    source_type: CitationSourceType
    verification_status: CitationVerificationStatus
    retrieved_at: string
}

export interface VerificationSummary {
    requires_citation: boolean
    verification_status: CitationVerificationStatus
    citation_count: number
    official_count: number
    secondary_count: number
    unsupported_claim_count: number
}

export interface LegalClaimAudit {
    claim: string
    supported: boolean
    matched_citation_url?: string
    matched_source_domain?: string
    score?: number
}

export interface LegalAnswerPayload {
    answer: string
    citations: LegalCitation[]
    evidence: LegalSourceEvidence[]
    verification_status: CitationVerificationStatus
    verification_summary: VerificationSummary
    claim_audit?: LegalClaimAudit[]
    abstained?: boolean
}

export const OFFICIAL_LEGAL_DOMAINS = [
    'moj.gov.vn',
    'chinhphu.vn',
    'vbpl.vn',
    'xaydungchinhsach.chinhphu.vn',
]

export const SECONDARY_LEGAL_DOMAINS = [
    'thuvienphapluat.vn',
    'luatvietnam.vn',
    'lawnet.vn',
]

export const LEGAL_SOURCE_ALLOWLIST = [...OFFICIAL_LEGAL_DOMAINS, ...SECONDARY_LEGAL_DOMAINS]

const LEGAL_CITATION_HINTS = [
    'điều',
    'luật',
    'nghị định',
    'thông tư',
    'bộ luật',
    'căn cứ',
    'quy định',
    'xử phạt',
    'thời hạn',
    'bồi thường',
    'phạt vi phạm',
    'án lệ',
]

const LAW_TITLE_PATTERNS = [
    /(luật\s+[^\n,.]{4,120})/gi,
    /(bộ luật\s+[^\n,.]{4,120})/gi,
    /(nghị định\s+[^\n,.]{4,120})/gi,
    /(thông tư\s+[^\n,.]{4,120})/gi,
]

const RISK_SIGNAL_HINTS = [
    'phat',
    'boi thuong',
    'don phuong',
    'cham dut',
    'bao mat',
    'doc quyen',
    'so huu tri tue',
    'thanh toan',
    'nghia vu',
    'trach nhiem',
    'vi pham',
]

// ---------------------------------------------------------
// Embedding Providers (Jina AI & Gemini)
// ---------------------------------------------------------

export async function jinaEmbed(text: string, _unused?: string, dims = 512): Promise<number[]> {
    const res = await fetchWithRetry('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'jina-embeddings-v3',
            task: 'text-matching',
            dimensions: dims,
            late_chunking: false,
            embedding_type: 'float',
            input: [text]
        })
    }, { listEnvVar: 'JINA_API_KEYS', fallbackEnvVar: 'JINA_API_KEY' })

    const data = await res.json()
    return data.data[0].embedding as number[]
}
export async function voyageEmbed(text: string, _unused?: string, dims = 512): Promise<number[]> {
    const res = await fetchWithRetry('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'voyage-3',
            input: [text],
            output_dimension: dims
        })
    }, { listEnvVar: 'VOYAGE_API_KEYS', fallbackEnvVar: 'VOYAGE_API_KEY' })

    const data = await res.json()
    return data.data[0].embedding as number[]
}

/**
 * Global embedText helper with Jina-first strategy to avoid Gemini 429 limits.
 */
export async function embedText(text: string, _fallbackGeminiKey?: string, dims = 512): Promise<number[]> {
    const primaryProvider = (Deno.env.get('EMBEDDING_PROVIDER') ?? 'jina').toLowerCase()
    const providers = primaryProvider === 'voyage'
        ? ['voyage', 'jina', 'gemini']
        : primaryProvider === 'gemini'
            ? ['gemini', 'jina', 'voyage']
            : ['jina', 'voyage', 'gemini']

    for (const provider of providers) {
        try {
            if (provider === 'jina') return await jinaEmbed(text, '', dims)
            if (provider === 'voyage') return await voyageEmbed(text, '', dims)

            const VERSION = 'v1beta'
            const MODEL = 'gemini-embedding-2-preview'
            const res = await fetchWithRetry(
                `https://generativelanguage.googleapis.com/${VERSION}/models/${MODEL}:embedContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: { parts: [{ text }] },
                        outputDimensionality: dims,
                    }),
                },
                { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
            )
            const data = await res.json()
            return data.embedding.values as number[]
        } catch (error) {
            console.warn(`${provider} embedding failed:`, (error as Error).message)
        }
    }

    throw new Error('All embedding providers failed')
}

// ---------------------------------------------------------
// Exa Web Search Integrations for External Legal Context
// ---------------------------------------------------------

export async function exaSearch(query: string, _unused?: string, numResults = 3) {
    const res = await fetchWithRetry('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            numResults,
            useAutoprompt: true,
            // Prioritize Vietnamese legal domains
            includeDomains: ['thuvienphapluat.vn', 'luatvietnam.vn', 'lawnet.vn', 'moj.gov.vn', 'chinhphu.vn'],
            contents: {
                text: { maxCharacters: 1500 }
            }
        })
    }, { listEnvVar: 'EXA_API_KEYS', fallbackEnvVar: 'EXA_API_KEY' })

    const json = await res.json()
    return json.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.text,
        source_domain: getDomainFromUrl(r.url),
        source_type: classifySourceType(r.url),
        retrieved_at: new Date().toISOString(),
        score: scoreLegalSource(r.url, r.title, r.text, query),
    }))
}

export function normalizeLegalQuery(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

export function buildCacheKey(namespace: string, ...parts: Array<string | number | boolean | null | undefined>): string {
    const normalized = parts
        .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
        .map((part) => String(part).trim())
        .join(':')
    return `${namespace}:${simpleHash(normalized || namespace)}`
}

export function compactText(text: string, maxChars = 1200): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

export function buildCompactDocumentContext(summary?: string, excerpts: string[] = [], fallbackText?: string): string | null {
    const trimmedSummary = compactText(summary ?? '', 1400)
    const trimmedExcerpts = excerpts
        .map((excerpt) => compactText(excerpt, 700))
        .filter(Boolean)
        .slice(0, 3)

    if (!trimmedSummary && trimmedExcerpts.length === 0 && !fallbackText) return null

    return [
        trimmedSummary ? `TÓM TẮT TÀI LIỆU:\n${trimmedSummary}` : '',
        trimmedExcerpts.length > 0
            ? `ĐOẠN LIÊN QUAN NHẤT:\n${trimmedExcerpts.map((item, index) => `[${index + 1}] ${item}`).join('\n')}`
            : '',
        !trimmedSummary && trimmedExcerpts.length === 0 && fallbackText
            ? `TÀI LIỆU RÚT GỌN:\n${compactText(fallbackText, 2400)}`
            : '',
    ].filter(Boolean).join('\n\n')
}

export function isStandaloneQuestion(input: string): boolean {
    const normalized = normalizeLegalQuery(input)
    return !['noi tren', 'o tren', 'cai nay', 'van de nay', 'tiep theo', 'them nua', 'giai thich them'].some((hint) => normalized.includes(hint))
}

export function hasHighRiskSignals(input: string): boolean {
    const normalized = normalizeLegalQuery(input)
    return RISK_SIGNAL_HINTS.some((hint) => normalized.includes(hint))
}

export function simpleHash(input: string): string {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return Math.abs(hash >>> 0).toString(16)
}

export function requiresLegalCitation(input: string): boolean {
    const normalized = normalizeLegalQuery(input)
    return LEGAL_CITATION_HINTS.some((hint) => normalized.includes(hint))
}

export function classifySourceType(url: string): CitationSourceType {
    const domain = getDomainFromUrl(url)
    if (OFFICIAL_LEGAL_DOMAINS.some((allowed) => domain.endsWith(allowed))) return 'official'
    return 'secondary'
}

export function getDomainFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return ''
    }
}

export function isAllowedLegalUrl(url: string): boolean {
    const domain = getDomainFromUrl(url)
    return LEGAL_SOURCE_ALLOWLIST.some((allowed) => domain.endsWith(allowed))
}

export function scoreLegalSource(url: string, title: string, content: string, query: string): number {
    const normalizedQuery = normalizeLegalQuery(query)
    const normalizedTitle = normalizeLegalQuery(title)
    const normalizedContent = normalizeLegalQuery(content.slice(0, 1200))
    const queryArticles = extractArticleMentions(query)
    const titleArticles = extractArticleMentions(title)
    const contentArticles = extractArticleMentions(content.slice(0, 2000))
    const lawHints = extractLawTitleHints(query)

    let score = classifySourceType(url) === 'official' ? 100 : 60
    for (const token of normalizedQuery.split(' ')) {
        if (!token || token.length < 3) continue
        if (normalizedTitle.includes(token)) score += 5
        if (normalizedContent.includes(token)) score += 2
    }

    for (const article of queryArticles) {
        if (titleArticles.includes(article)) score += 30
        if (contentArticles.includes(article)) score += 15
    }

    for (const hint of lawHints) {
        const normalizedHint = normalizeLegalQuery(hint)
        if (normalizedTitle.includes(normalizedHint)) score += 18
        else if (normalizedContent.includes(normalizedHint)) score += 10
    }

    return score
}

export function rewriteLegalQuery(input: string): string[] {
    const normalized = input.trim()
    const variants = [normalized]

    if (requiresLegalCitation(input)) {
        variants.push(`văn bản pháp luật việt nam ${normalized}`)
        variants.push(`điều luật việt nam ${normalized}`)
        variants.push(`site:moj.gov.vn OR site:chinhphu.vn OR site:vbpl.vn ${normalized}`)
    }

    return Array.from(new Set(variants.filter(Boolean)))
}

export async function retrieveLegalEvidence(query: string, numResults = 5): Promise<LegalSourceEvidence[]> {
    const redis = getRedisClient()
    const cacheKey = buildCacheKey('cache:legal_evidence', normalizeLegalQuery(query), numResults)
    if (redis) {
        const cached = await redis.get<LegalSourceEvidence[]>(cacheKey)
        if (cached && Array.isArray(cached) && cached.length > 0) {
            return cached
        }
    }

    const queryVariants = rewriteLegalQuery(query).slice(0, 3)
    const allResults = (await Promise.all(queryVariants.map((variant) => exaSearch(variant, '', numResults)))).flat()

    const deduped = new Map<string, LegalSourceEvidence>()
    for (const result of allResults) {
        if (!result.url || !isAllowedLegalUrl(result.url)) continue
        if (!deduped.has(result.url)) {
            deduped.set(result.url, {
                ...(result as LegalSourceEvidence),
                matched_article: findBestMatchedArticle(query, result.title, result.content),
            })
        }
    }

    const ranked = [...deduped.values()]
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, numResults)

    if (redis && ranked.length > 0) {
        await redis.set(cacheKey, ranked, { ex: 60 * 60 * 6 })
    }

    return ranked
}

/**
 * Searches and verifies a legal citation using Exa AI.
 * Returns the most authoritative URL found for a given law/article reference.
 */
export async function verifyLegalCitation(citation: string, exaKey: string): Promise<string | undefined> {
    const results = await exaSearch(`Văn bản pháp luật: ${citation}`, exaKey, 1)
    if (results && results.length > 0) {
        return results[0].url
    }
    return undefined
}

/**
 * Advanced Fetch Wrapper with Retry, Exponential Backoff, and API Key Rotation.
 * Retries up to 5 times (total 6 attempts).
 * Automatically rotates keys if a listEnvVar is provided and a 429/5xx error occurs.
 */
export async function fetchWithRetry(
    url: string,
    options: RequestInit,
    config: {
        listEnvVar: string,
        fallbackEnvVar: string,
        maxRetries?: number,
        backoffBase?: number,
        timeoutMs?: number
    }
): Promise<Response> {
    const { listEnvVar, fallbackEnvVar, maxRetries = 5, backoffBase = 1000, timeoutMs = 20_000 } = config
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Get current key
            const currentKey = roundRobinKey(listEnvVar, fallbackEnvVar)

            // Inject key into Headers or URL
            const finalOptions = { ...options }
            const finalHeaders = new Headers(options.headers || {})
            let finalUrl = url

            // Specific Provider Logic
            if (url.includes('generativelanguage.googleapis.com')) {
                // Gemini uses URL param 'key'
                const urlObj = new URL(url)
                urlObj.searchParams.set('key', currentKey)
                finalUrl = urlObj.toString()
            } else if (url.includes('api.exa.ai')) {
                // Exa uses x-api-key header
                finalHeaders.set('x-api-key', currentKey)
            } else {
                // Generic Bearer (Groq, Jina, Voyage)
                finalHeaders.set('Authorization', `Bearer ${currentKey}`)
            }

            finalOptions.headers = finalHeaders
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(`Timeout after ${timeoutMs}ms`), timeoutMs)
            finalOptions.signal = controller.signal
            const response = await fetch(finalUrl, finalOptions)
            clearTimeout(timeout)

            // Success or Client Error (except 429) -> Return
            if (response.ok) return response
            if (response.status !== 429 && response.status < 500) return response

            const errorText = await response.text()
            console.warn(`[Retry ${attempt}/${maxRetries}] ${listEnvVar} failed (${response.status}): ${errorText.slice(0, 100)}...`)
            lastError = new Error(`${listEnvVar} error ${response.status}: ${errorText}`)

        } catch (e) {
            console.warn(`[Retry ${attempt}/${maxRetries}] Network/Logic error:`, (e as Error).message)
            lastError = e as Error
        }

        // Wait before retry
        if (attempt < maxRetries) {
            const delay = backoffBase * Math.pow(2, attempt)
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    throw lastError || new Error(`Failed after ${maxRetries} retries`)
}

/**
 * Round-robin key selector.
 * Reads GEMINI_API_KEYS or GROQ_API_KEYS (comma-separated list) from env.
 * NOTE: For retry logic, we naturally advance the counter each time.
 */
const _counters: Record<string, number> = {}

export function roundRobinKey(listEnvVar: string, fallbackEnvVar: string): string {
    const raw = Deno.env.get(listEnvVar) ?? ''
    const keys = raw.split(',').map((k: string) => k.trim()).filter(Boolean)

    if (keys.length === 0) {
        const single = Deno.env.get(fallbackEnvVar)
        if (!single) throw new Error(`Missing env var: ${listEnvVar} or ${fallbackEnvVar}`)
        return single
    }

    const idx = (_counters[listEnvVar] ?? 0) % keys.length
    _counters[listEnvVar] = idx + 1

    return keys[idx]
}

export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let nextIndex = 0

    const runWorker = async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++
            results[currentIndex] = await worker(items[currentIndex], currentIndex)
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.max(1, Math.min(limit, items.length || 1)) },
            () => runWorker()
        )
    )

    return results
}

export async function authenticateRequest(req: Request): Promise<AuthenticatedRequestContext> {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization')

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) throw new Error('Invalid Authorization header')

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const key = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseAuth = createClient(url, key, {
        global: { headers: { Authorization: authHeader } },
    })

    const authApi = supabaseAuth.auth as unknown as {
        getClaims?: (jwt: string) => Promise<{ data?: { claims?: Record<string, unknown> }, error?: { message?: string } }>
    }

    if (typeof authApi.getClaims === 'function') {
        try {
            const { data, error } = await authApi.getClaims(token)
            if (!error && data?.claims?.sub) {
                return {
                    authHeader,
                    token,
                    user: {
                        id: String(data.claims.sub),
                        email: (data.claims.email as string | undefined) ?? null,
                        user_metadata: (data.claims.user_metadata as Record<string, unknown> | undefined) ?? {},
                    },
                }
            }
        } catch (error) {
            console.warn('getClaims failed, falling back to getUser:', (error as Error).message)
        }
    }

    const { data: { user }, error } = await supabaseAuth.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    return {
        authHeader,
        token,
        user: {
            id: user.id,
            email: user.email ?? null,
            user_metadata: user.user_metadata ?? {},
        },
    }
}

export function logTelemetry(functionName: string, stage: string, metadata: Record<string, unknown> = {}) {
    console.log(JSON.stringify({
        type: 'telemetry',
        function: functionName,
        stage,
        ts: new Date().toISOString(),
        ...metadata,
    }))
}

/**
 * Programmatically validates that all URLs in a text are present in the allowList (actual search results).
 * Prevents LLM hallucinations of realistic but dead links.
 */
export function validateCitations(text: string, allowList: string[]): string {
    const urlRegex = /(https?:\/\/[^\s\)]+)/g
    return text.replace(urlRegex, (url) => {
        // Clean trailing punctuation
        const cleanUrl = url.replace(/[.,;:\)]+$/, '')
        const match = allowList.find(allowed => allowed.includes(cleanUrl) || cleanUrl.includes(allowed))
        return match ? cleanUrl : '[Link không khả dụng]'
    })
}

export function extractArticleMentions(text: string): string[] {
    const matches = text.match(/điều\s+\d+[a-z0-9\-]*/gi) || []
    return Array.from(new Set(matches.map((match) => normalizeLegalQuery(match))))
}

export function extractPotentialLegalClaims(answer: string): string[] {
    return answer
        .split(/(?<=[\.\!\?])\s+|\n+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => {
            const normalized = normalizeLegalQuery(part)
            return LEGAL_CITATION_HINTS.some((hint) => normalized.includes(hint))
                || extractArticleMentions(part).length > 0
        })
}

export function extractLawTitleHints(text: string): string[] {
    const hints = new Set<string>()
    for (const pattern of LAW_TITLE_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
            if (match[0]) hints.add(match[0].trim())
        }
    }
    return [...hints]
}

export function findBestMatchedArticle(...texts: string[]): string | undefined {
    const counts = new Map<string, number>()
    for (const text of texts) {
        for (const article of extractArticleMentions(text)) {
            counts.set(article, (counts.get(article) ?? 0) + 1)
        }
    }

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([article]) => article)[0]
}

export function scoreEvidenceForClaim(claim: string, evidence: LegalSourceEvidence): number {
    const normalizedClaim = normalizeLegalQuery(claim)
    const normalizedTitle = normalizeLegalQuery(evidence.title)
    const normalizedExcerpt = normalizeLegalQuery(evidence.content.slice(0, 1800))
    const claimArticles = extractArticleMentions(claim)
    const evidenceArticles = extractArticleMentions(`${evidence.title}\n${evidence.content}`)
    const lawHints = extractLawTitleHints(claim)

    let score = evidence.source_type === 'official' ? 24 : 10

    for (const article of claimArticles) {
        if (evidenceArticles.includes(article)) score += 35
        if (evidence.matched_article === article) score += 20
    }

    for (const hint of lawHints) {
        const normalizedHint = normalizeLegalQuery(hint)
        if (normalizedTitle.includes(normalizedHint)) score += 25
        else if (normalizedExcerpt.includes(normalizedHint)) score += 14
    }

    for (const token of normalizedClaim.split(' ')) {
        if (!token || token.length < 4) continue
        if (normalizedTitle.includes(token)) score += 4
        if (normalizedExcerpt.includes(token)) score += 2
    }

    return score
}

export function selectBestEvidenceForClaim(claim: string, evidence: LegalSourceEvidence[]): LegalSourceEvidence | undefined {
    const ranked = evidence
        .map((item) => ({ item, score: scoreEvidenceForClaim(claim, item) }))
        .sort((a, b) => b.score - a.score)[0]

    return ranked && ranked.score >= 35 ? ranked.item : undefined
}

export function auditClaimsAgainstEvidence(answer: string, evidence: LegalSourceEvidence[]): LegalClaimAudit[] {
    return extractPotentialLegalClaims(answer).map((claim) => {
        const ranked = evidence
            .map((item) => ({ item, score: scoreEvidenceForClaim(claim, item) }))
            .sort((a, b) => b.score - a.score)[0]

        return {
            claim,
            supported: Boolean(ranked && ranked.score >= 35),
            matched_citation_url: ranked?.score >= 35 ? ranked.item.url : undefined,
            matched_source_domain: ranked?.score >= 35 ? ranked.item.source_domain : undefined,
            score: ranked?.score,
        }
    })
}

function extractCitationText(answer: string, evidence: LegalSourceEvidence): string {
    const normalizedAnswer = normalizeLegalQuery(answer)
    const snippets = evidence.content.split(/[\n\.]/).map((part) => part.trim()).filter(Boolean)
    const matchedSnippet = snippets.find((part) => normalizedAnswer.includes(normalizeLegalQuery(part).slice(0, 40)))
    return matchedSnippet || evidence.title
}

export function buildLegalCitationsFromEvidence(answer: string, evidence: LegalSourceEvidence[]): LegalCitation[] {
    const rankedEvidence = evidence
        .map((item) => ({ item, score: scoreEvidenceForClaim(answer, item) }))
        .filter(({ score }) => score >= 35)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item)

    return rankedEvidence.slice(0, 3).map((item) => ({
        citation_text: extractCitationText(answer, item),
        citation_url: item.url,
        source_domain: item.source_domain,
        source_title: item.title,
        source_excerpt: item.content.slice(0, 280),
        source_type: item.source_type,
        verification_status: item.source_type === 'official' ? 'official_verified' : 'secondary_verified',
        retrieved_at: item.retrieved_at,
    }))
}

export function verifyMarkdownLinks(text: string, citations: LegalCitation[]): string {
    const allowList = citations.map((citation) => citation.citation_url)
    return validateCitations(text, allowList)
}

export function summarizeVerification(citations: LegalCitation[], requiresCitation: boolean): VerificationSummary {
    const officialCount = citations.filter((item) => item.verification_status === 'official_verified').length
    const secondaryCount = citations.filter((item) => item.verification_status === 'secondary_verified').length
    const unsupportedClaimCount = requiresCitation && citations.length === 0 ? 1 : 0

    let verificationStatus: CitationVerificationStatus = 'unverified'
    if (!requiresCitation) verificationStatus = 'unverified'
    else if (officialCount > 0) verificationStatus = 'official_verified'
    else if (secondaryCount > 0) verificationStatus = 'secondary_verified'
    else verificationStatus = 'unsupported'

    return {
        requires_citation: requiresCitation,
        verification_status: verificationStatus,
        citation_count: citations.length,
        official_count: officialCount,
        secondary_count: secondaryCount,
        unsupported_claim_count: unsupportedClaimCount,
    }
}

export function buildAbstainPayload(message: string, requiresCitation = true, evidence: LegalSourceEvidence[] = []): LegalAnswerPayload {
    const verification_summary = summarizeVerification([], requiresCitation)
    return {
        answer: message,
        citations: [],
        evidence,
        verification_status: 'unsupported',
        verification_summary,
        abstained: true,
    }
}

export function buildLegalAnswerPayload(answer: string, evidence: LegalSourceEvidence[], requiresCitation: boolean): LegalAnswerPayload {
    const citations = buildLegalCitationsFromEvidence(answer, evidence)
    const verifiedAnswer = verifyMarkdownLinks(answer, citations)
    const claimAudit = auditClaimsAgainstEvidence(answer, evidence)
    const unsupportedClaims = claimAudit.filter((claim) => !claim.supported)
    const baseSummary = summarizeVerification(citations, requiresCitation)

    const verification_summary: VerificationSummary = {
        ...baseSummary,
        unsupported_claim_count: requiresCitation
            ? Math.max(baseSummary.unsupported_claim_count, unsupportedClaims.length)
            : 0,
    }

    if (requiresCitation && citations.length === 0) {
        return buildAbstainPayload('Tôi chưa có đủ căn cứ từ nguồn pháp lý đáng tin cậy để khẳng định câu trả lời này. Vui lòng thử nêu rõ tên luật, điều luật hoặc bối cảnh cụ thể hơn.', true, evidence)
    }

    if (requiresCitation && claimAudit.length > 0 && unsupportedClaims.length === claimAudit.length) {
        return {
            ...buildAbstainPayload('Tôi chưa có đủ căn cứ từ nguồn pháp lý đáng tin cậy để xác thực các kết luận pháp lý trong câu trả lời này. Vui lòng nêu rõ tên luật, điều luật hoặc bối cảnh tranh chấp để tôi tra cứu chính xác hơn.', true, evidence),
            claim_audit: claimAudit,
        }
    }

    let verification_status = verification_summary.verification_status
    let finalAnswer = verifiedAnswer
    if (requiresCitation && unsupportedClaims.length > 0) {
        verification_status = 'conflicted'
        finalAnswer = `${verifiedAnswer}\n\nLưu ý: Một phần nhận định pháp lý ở trên chưa được đối chiếu đủ mạnh với nguồn dẫn chứng hiện có. Bạn nên kiểm tra lại với luật sư hoặc nêu rõ điều luật cần tra cứu.`
    }

    return {
        answer: finalAnswer,
        citations,
        evidence,
        verification_status,
        verification_summary,
        claim_audit: claimAudit,
        abstained: false,
    }
}

/**
 * Validates URLs inside a JSON object (specifically for risk-review output).
 * If a URL is hallucinated, it replaces it with the most relevant actual search result.
 */
export function validateJSONCitations(risksObj: any, allowList: string[]): any {
    if (!risksObj.risks || !Array.isArray(risksObj.risks)) return risksObj

    risksObj.risks = risksObj.risks.map((risk: any) => {
        if (!risk.citation_url) {
            // Optional: If citation text is present but no URL, try to fuzzy match from allowList
            if (risk.citation && allowList.length > 0) {
                const slug = risk.citation.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]/g, '')
                const fuzzyMatch = allowList.find(url => url.toLowerCase().includes(slug))
                if (fuzzyMatch) risk.citation_url = fuzzyMatch
            }
            return risk
        }

        const cleanTarget = risk.citation_url.replace(/[.,;:\)]+$/, '')
        const match = allowList.find(allowed =>
            allowed === cleanTarget ||
            cleanTarget.includes(allowed) ||
            allowed.includes(cleanTarget)
        )

        if (match) {
            risk.citation_url = match
        } else {
            console.warn(`[Hallucination Blocked] Removing fake URL: ${risk.citation_url}`)
            // Attempt one last fuzzy match by citation text before giving up
            const slug = risk.citation?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]/g, '')
            const fallbackMatch = slug ? allowList.find(url => url.toLowerCase().includes(slug)) : null
            risk.citation_url = fallbackMatch || undefined
        }
        return risk
    })
    return risksObj
}

export function mapRiskToVerifiedEvidence(risk: RiskClause, evidence: LegalSourceEvidence[]): RiskClause {
    const claimText = [risk.clause_ref, risk.description, risk.citation_text ?? risk.citation]
        .filter(Boolean)
        .join('\n')

    const bestEvidence = selectBestEvidenceForClaim(claimText, evidence)
    if (!bestEvidence) {
        return {
            ...risk,
            verification_status: risk.verification_status ?? 'unsupported',
        }
    }

    return {
        ...risk,
        citation: risk.citation_text ?? risk.citation,
        citation_text: risk.citation_text ?? risk.citation ?? extractCitationText(claimText, bestEvidence),
        citation_url: bestEvidence.url,
        source_domain: bestEvidence.source_domain,
        source_title: bestEvidence.title,
        source_excerpt: bestEvidence.content.slice(0, 280),
        source_type: bestEvidence.source_type,
        verification_status: bestEvidence.source_type === 'official' ? 'official_verified' : 'secondary_verified',
        retrieved_at: bestEvidence.retrieved_at,
        evidence: bestEvidence,
    }
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

// ---------------------------------------------------------
// Upstash Redis: Rate Limiting & Caching
// ---------------------------------------------------------

export function getRedisClient() {
    const url = Deno.env.get('UPSTASH_REDIS_REST_URL')
    const token = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')
    if (!url || !token) return null
    return new Redis({ url, token })
}

export function getSupabaseAdminClient() {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return null
    return createClient(url, key)
}

export async function getCachedLegalAnswer<T>(cacheKey: string): Promise<T | null> {
    const redis = getRedisClient()
    if (!redis) return null
    return await redis.get<T>(cacheKey)
}

export async function setCachedLegalAnswer(cacheKey: string, payload: unknown, ttlSeconds = 3600): Promise<void> {
    const redis = getRedisClient()
    if (!redis) return
    await redis.set(cacheKey, payload, { ex: ttlSeconds })
}

export async function deleteCachedValue(cacheKey: string): Promise<void> {
    const redis = getRedisClient()
    if (!redis) return
    await redis.del(cacheKey)
}

export async function persistVerifiedEvidence(query: string, evidence: LegalSourceEvidence[]): Promise<void> {
    const supabase = getSupabaseAdminClient()
    if (!supabase || evidence.length === 0) return

    const query_hash = simpleHash(normalizeLegalQuery(query))
    const rows = evidence.map((item) => ({
        query_text: query,
        query_hash,
        source_title: item.title,
        source_url: item.url,
        source_domain: item.source_domain,
        source_type: item.source_type,
        matched_article: item.matched_article,
        excerpt: item.content.slice(0, 500),
        verification_status: item.source_type === 'official' ? 'official_verified' : 'secondary_verified',
        score: item.score,
        metadata: {
            retrieved_at: item.retrieved_at,
        },
    }))

    try {
        await supabase.from('verified_evidence').insert(rows)
    } catch (error) {
        console.warn('persistVerifiedEvidence failed:', (error as Error).message)
    }
}

export async function persistAnswerAudit(params: {
    functionName: string
    userId?: string
    question: string
    payload: LegalAnswerPayload
    metadata?: Record<string, unknown>
}): Promise<void> {
    const supabase = getSupabaseAdminClient()
    if (!supabase) return

    const { functionName, userId, question, payload, metadata = {} } = params
    const request_hash = simpleHash(`${functionName}:${normalizeLegalQuery(question)}`)

    try {
        const { data: answerAudit, error } = await supabase
            .from('answer_audit')
            .insert({
                user_id: userId ?? null,
                function_name: functionName,
                request_hash,
                question,
                answer_text: payload.answer,
                verification_status: payload.verification_status,
                abstained: payload.abstained ?? false,
                citation_count: payload.verification_summary.citation_count,
                official_count: payload.verification_summary.official_count,
                secondary_count: payload.verification_summary.secondary_count,
                unsupported_claim_count: payload.verification_summary.unsupported_claim_count,
                claim_audit: payload.claim_audit ?? [],
                metadata,
            })
            .select('id')
            .single()

        if (error || !answerAudit?.id || payload.citations.length === 0) return

        await supabase.from('citation_events').insert(
            payload.citations.map((citation) => ({
                answer_audit_id: answerAudit.id,
                citation_text: citation.citation_text,
                citation_url: citation.citation_url,
                source_domain: citation.source_domain,
                source_type: citation.source_type,
                verification_status: citation.verification_status,
                metadata: {
                    source_title: citation.source_title,
                    retrieved_at: citation.retrieved_at,
                },
            }))
        )
    } catch (error) {
        console.warn('persistAnswerAudit failed:', (error as Error).message)
    }
}

/**
 * Basic Window Rate Limiting using Upstash Redis
 * @param userId The unique user ID
 * @param functionName e.g., 'risk-review', 'contract-qa'
 * @param limit Max requests per window
 * @param windowSecs Window duration in seconds
 */
export async function checkRateLimit(
    userId: string,
    functionName: string,
    limit = 10,
    windowSecs = 60
): Promise<{ allowed: boolean, remaining: number }> {
    const redis = getRedisClient()
    if (!redis) return { allowed: true, remaining: 99 } // Bypass if unconfigured

    const key = `ratelimit:${functionName}:${userId}`
    const current = await redis.incr(key)
    if (current === 1) {
        await redis.expire(key, windowSecs)
    }

    return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current)
    }
}

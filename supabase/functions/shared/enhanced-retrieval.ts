// Enhanced Retrieval Pipeline for Production-Ready Legal AI
// Multi-stage retrieval with strict quality gates and source authority scoring

import {
    LegalSourceEvidence,
    CitationSourceType,
    embedText,
    jinaRerank,
    exaSearch,
    classifySourceType,
    normalizeLegalQuery,
    extractArticleMentions,
    extractLawTitleHints,
    isAllowedLegalUrl,
    getDomainFromUrl,
    roundRobinKey,
    fetchWithRetry,
} from './types.ts'

// ============================================================
// CONFIGURATION - Production Quality Thresholds
// ============================================================

const RETRIEVAL_CONFIG = {
    // Vector search thresholds
    VECTOR_MATCH_THRESHOLD: 0.45,  // Tăng từ 0.3 để giảm noise
    VECTOR_MATCH_COUNT: 20,       // Lấy nhiều hơn để rerank
    
    // Source authority weights
    AUTHORITY_WEIGHTS: {
        OFFICIAL_BASE: 100,      // Chính thống: gov.vn, vbpl...
        SECONDARY_BASE: 60,      // Tin cậy: thuvienphapluat, luatvietnam
        ACADEMIC_BASE: 40,       // Học thuật: luận văn, nghiên cứu
        GENERAL_BASE: 20,        // Web tổng hợp
    },
    
    // Reranking
    RERANK_TOP_N: 3,            // Người dùng muốn top 3 chất lượng nhất
    MIN_RERANK_SCORE: 0.65,     // Ngưỡng chấp nhận relevance score
    
    // Quality gates
    MIN_OFFICIAL_SOURCES: 1,    // Phải có ít nhất 1 nguồn chính thống
    MAX_WEB_SOURCES: 2,         // Giới hạn nguồn web thông thường
    
    // Domain priorities (higher = more authoritative)
    OFFICIAL_DOMAINS: [
        'moj.gov.vn',           // Bộ Tư pháp
        'chinhphu.vn',          // Chính phủ
        'vbpl.vn',              // Văn bản pháp luật
        'quochoi.vn',           // Quốc hội
        'laws.gov.vn',          // Cổng thông tin Chính phủ
    ],
    
    HIGH_PRIORITY_DOMAINS: [
        'thuvienphapluat.vn',    // Thư viện pháp luật
        'luatvietnam.vn',        // Luật Việt Nam
        'lawnet.vn',             // LawNet
        'baobinhphuoc.com.vn',   // Báo Bình Phước (liên quan local)
    ],
}

// ============================================================
// TYPES
// ============================================================

interface RetrievalResult {
    evidence: LegalSourceEvidence[]
    topEvidence: LegalSourceEvidence[]  // Top 3 sau reranking
    authorityScore: number
    coverageScore: number
    hasOfficialSource: boolean
    retrievalMetadata: {
        vectorCount: number
        webCount: number
        rerankedCount: number
        avgRelevanceScore: number
    }
}

interface SourceQualityMetrics {
    authorityLevel: 'official' | 'high' | 'medium' | 'low'
    domainScore: number
    contentRelevance: number
    articleMatchScore: number
    freshnessScore: number
}

// ============================================================
// CORE RETRIEVAL PIPELINE
// ============================================================

/**
 * Production-grade multi-stage legal evidence retrieval
 * Stage 1: Vector search internal knowledge base
 * Stage 2: Live EXA web search
 * Stage 3: Source authority scoring
 * Stage 4: Jina reranking (top 3)
 * Stage 5: Quality validation
 */
export async function retrieveLegalEvidenceProduction(
    query: string,
    supabase: any,
    options: {
        requireOfficial?: boolean
        minResults?: number
        maxResults?: number
    } = {}
): Promise<RetrievalResult> {
    const { requireOfficial = true, minResults = 3, maxResults = 3 } = options
    
    console.log(`[EnhancedRetrieval] Starting retrieval for: "${query.slice(0, 80)}..."`)
    
    // Stage 1: Generate embedding
    const queryEmbedding = await embedText(query, '', 768)
    
    // Stage 2: Parallel multi-source retrieval
    const [vectorResults, webResults] = await Promise.all([
        retrieveFromVectorDB(supabase, query, queryEmbedding),
        retrieveFromWebSearch(query),
    ])
    
    console.log(`[EnhancedRetrieval] Vector: ${vectorResults.length}, Web: ${webResults.length}`)
    
    // Stage 3: Deduplication and source quality scoring
    const allCandidates = mergeAndDeduplicate(vectorResults, webResults)
    const scoredCandidates = allCandidates.map(source => ({
        ...source,
        qualityMetrics: calculateSourceQuality(source, query),
        compositeScore: 0, // Will be calculated
    }))
    
    // Stage 4: Multi-factor reranking
    const rerankedCandidates = await performMultiFactorReranking(scoredCandidates, query)
    
    // Stage 5: Select top 3 with strict quality criteria
    let topEvidence = selectTopEvidenceStrict(rerankedCandidates, RETRIEVAL_CONFIG.RERANK_TOP_N)
    
    // Stage 6: Quality validation
    const validation = validateRetrievalQuality(topEvidence, { requireOfficial, minResults })
    
    // If quality insufficient and web search enabled, expand search
    if (!validation.passes && webResults.length > 0) {
        console.log(`[EnhancedRetrieval] Initial quality check failed, expanding search...`)
        const expandedWeb = await retrieveFromWebSearch(query, 10) // Lấy thêm
        const expandedCandidates = mergeAndDeduplicate(vectorResults, expandedWeb)
        const expandedScored = expandedCandidates.map(source => ({
            ...source,
            qualityMetrics: calculateSourceQuality(source, query),
            compositeScore: 0,
        }))
        const expandedReranked = await performMultiFactorReranking(expandedScored, query)
        topEvidence = selectTopEvidenceStrict(expandedReranked, RETRIEVAL_CONFIG.RERANK_TOP_N)
    }
    
    // Final quality check
    const finalValidation = validateRetrievalQuality(topEvidence, { requireOfficial, minResults })
    
    const result: RetrievalResult = {
        evidence: rerankedCandidates.map(c => c as LegalSourceEvidence),
        topEvidence,
        authorityScore: calculateAuthorityScore(topEvidence),
        coverageScore: calculateCoverageScore(topEvidence, query),
        hasOfficialSource: topEvidence.some(e => e.source_type === 'official'),
        retrievalMetadata: {
            vectorCount: vectorResults.length,
            webCount: webResults.length,
            rerankedCount: rerankedCandidates.length,
            avgRelevanceScore: topEvidence.reduce((sum, e) => sum + (e.score || 0), 0) / topEvidence.length,
        },
    }
    
    console.log(`[EnhancedRetrieval] Complete. Top ${topEvidence.length} sources, Authority: ${result.authorityScore}, Official: ${result.hasOfficialSource}`)
    
    return result
}

// ============================================================
// STAGE IMPLEMENTATIONS
// ============================================================

async function retrieveFromVectorDB(
    supabase: any,
    query: string,
    embedding: number[]
): Promise<LegalSourceEvidence[]> {
    try {
        const { data, error } = await supabase.rpc('match_document_chunks', {
            query_embedding: embedding,
            match_threshold: RETRIEVAL_CONFIG.VECTOR_MATCH_THRESHOLD,
            match_count: RETRIEVAL_CONFIG.VECTOR_MATCH_COUNT,
            p_query_text: query,
        })
        
        if (error) {
            console.error('[EnhancedRetrieval] Vector search error:', error)
            return []
        }
        
        return (data || []).map((chunk: any) => ({
            title: `VBPL: ${chunk.law_article || 'Văn bản pháp luật'}`,
            url: chunk.source_url || `internal://${chunk.id}`,
            content: chunk.content,
            source_domain: getDomainFromUrl(chunk.source_url || ''),
            source_type: 'official' as CitationSourceType,
            retrieved_at: new Date().toISOString(),
            matched_article: chunk.law_article,
            score: Math.round(chunk.similarity * 100),
        }))
    } catch (e) {
        console.error('[EnhancedRetrieval] Vector retrieval failed:', e)
        return []
    }
}

async function retrieveFromWebSearch(
    query: string,
    numResults = 6
): Promise<LegalSourceEvidence[]> {
    // Multi-query expansion for better coverage
    const searchQueries = generateSearchVariants(query)
    
    const allResults: LegalSourceEvidence[] = []
    
    for (const searchQuery of searchQueries.slice(0, 2)) { // Giới hạn 2 queries để tiết kiệm cost
        try {
            const results = await exaSearch(searchQuery, '', numResults)
            const filtered = results.filter((r: LegalSourceEvidence) => isAllowedLegalUrl(r.url))
            allResults.push(...filtered)
        } catch (e) {
            console.warn('[EnhancedRetrieval] Web search failed for query:', searchQuery, e)
        }
    }
    
    return allResults
}

function generateSearchVariants(query: string): string[] {
    const normalized = normalizeLegalQuery(query)
    const variants = [query]
    
    // Thêm bối cảnh pháp lý Việt Nam
    if (!normalized.includes('viet nam') && !normalized.includes('vietnam')) {
        variants.push(`${query} pháp luật Việt Nam 2024 2025`)
    }
    
    // Thêm từ khóa văn bản pháp luật
    if (normalized.includes('hop dong') || normalized.includes('hợp đồng')) {
        variants.push(`mẫu hợp đồng ${query} mới nhất`)
        variants.push(`quy định hợp đồng ${query} Bộ Luật Dân sự`)
    }
    
    // Thêm từ khóa điều luật nếu phát hiện
    const articles = extractArticleMentions(query)
    if (articles.length > 0) {
        variants.push(`${articles.join(' ')} Bộ Luật Dân sự 2015`)
    }
    
    return Array.from(new Set(variants))
}

function mergeAndDeduplicate(
    vectorResults: LegalSourceEvidence[],
    webResults: LegalSourceEvidence[]
): LegalSourceEvidence[] {
    const seen = new Map<string, LegalSourceEvidence>()
    
    // Ưu tiên vector results (internal knowledge base)
    for (const result of vectorResults) {
        const key = normalizeUrl(result.url)
        if (!seen.has(key)) {
            seen.set(key, { ...result, source_type: 'official' })
        }
    }
    
    // Thêm web results nếu chưa có
    for (const result of webResults) {
        const key = normalizeUrl(result.url)
        if (!seen.has(key)) {
            seen.set(key, result)
        } else {
            // Merge: giữ content dài hơn
            const existing = seen.get(key)!
            if (result.content.length > existing.content.length) {
                existing.content = result.content
            }
        }
    }
    
    return Array.from(seen.values())
}

function normalizeUrl(url: string): string {
    try {
        const u = new URL(url)
        return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/+$/, '')
    } catch {
        return url.toLowerCase()
    }
}

// ============================================================
// SOURCE QUALITY SCORING
// ============================================================

function calculateSourceQuality(
    source: LegalSourceEvidence,
    query: string
): SourceQualityMetrics {
    const domain = getDomainFromUrl(source.url)
    
    // Authority level
    let authorityLevel: SourceQualityMetrics['authorityLevel'] = 'low'
    let domainScore = RETRIEVAL_CONFIG.AUTHORITY_WEIGHTS.GENERAL_BASE
    
    if (RETRIEVAL_CONFIG.OFFICIAL_DOMAINS.some(d => domain.includes(d))) {
        authorityLevel = 'official'
        domainScore = RETRIEVAL_CONFIG.AUTHORITY_WEIGHTS.OFFICIAL_BASE
    } else if (RETRIEVAL_CONFIG.HIGH_PRIORITY_DOMAINS.some(d => domain.includes(d))) {
        authorityLevel = 'high'
        domainScore = RETRIEVAL_CONFIG.AUTHORITY_WEIGHTS.SECONDARY_BASE
    } else if (source.source_type === 'official') {
        authorityLevel = 'official'
        domainScore = RETRIEVAL_CONFIG.AUTHORITY_WEIGHTS.OFFICIAL_BASE
    }
    
    // Content relevance
    const normalizedQuery = normalizeLegalQuery(query)
    const normalizedContent = normalizeLegalQuery(source.content.slice(0, 2000))
    const normalizedTitle = normalizeLegalQuery(source.title)
    
    let contentRelevance = 0
    for (const token of normalizedQuery.split(' ').filter(t => t.length > 3)) {
        if (normalizedTitle.includes(token)) contentRelevance += 5
        if (normalizedContent.includes(token)) contentRelevance += 2
    }
    
    // Article matching
    const queryArticles = extractArticleMentions(query)
    const contentArticles = extractArticleMentions(source.content)
    const titleArticles = extractArticleMentions(source.title)
    
    let articleMatchScore = 0
    for (const article of queryArticles) {
        if (titleArticles.includes(article)) articleMatchScore += 30
        else if (contentArticles.includes(article)) articleMatchScore += 15
        if (source.matched_article === article) articleMatchScore += 10
    }
    
    // Law title hints
    const lawHints = extractLawTitleHints(query)
    for (const hint of lawHints) {
        const normalizedHint = normalizeLegalQuery(hint)
        if (normalizedTitle.includes(normalizedHint)) contentRelevance += 20
        else if (normalizedContent.includes(normalizedHint)) contentRelevance += 10
    }
    
    return {
        authorityLevel,
        domainScore,
        contentRelevance,
        articleMatchScore,
        freshnessScore: 50, // Default, có thể cải thiện sau
    }
}

// ============================================================
// MULTI-FACTOR RERANKING
// ============================================================

interface ScoredCandidate extends LegalSourceEvidence {
    qualityMetrics: SourceQualityMetrics
    compositeScore: number
    rerankScore?: number
}

async function performMultiFactorReranking(
    candidates: ScoredCandidate[],
    query: string
): Promise<ScoredCandidate[]> {
    if (candidates.length <= 1) return candidates
    
    // Factor 1: Neural reranking với Jina
    let reranked: ScoredCandidate[] = candidates
    
    if (candidates.length > 3) {
        try {
            const docTexts = candidates.map(c => 
                `[${c.qualityMetrics.authorityLevel.toUpperCase()}] ${c.title}\n${c.content.slice(0, 1000)}`
            )
            
            const rerankResults = await jinaRerank(query, docTexts, candidates.length)
            
            // Map rerank scores
            reranked = rerankResults.map((r: { index: number; score: number }) => ({
                ...candidates[r.index],
                rerankScore: r.score,
            }))
            
        } catch (e) {
            console.warn('[EnhancedRetrieval] Neural reranking failed, using heuristic:', e)
            reranked = candidates.map(c => ({ ...c, rerankScore: 0.5 }))
        }
    }
    
    // Factor 2: Calculate composite score
    const withCompositeScore = reranked.map(c => {
        const q = c.qualityMetrics
        const neuralWeight = c.rerankScore || 0.5
        
        // Composite formula: weighted combination
        const compositeScore = 
            (q.domainScore * 0.35) +                    // Authority: 35%
            (q.contentRelevance * 2 * 0.25) +           // Relevance: 25%
            (q.articleMatchScore * 0.25) +               // Article match: 25%
            (neuralWeight * 100 * 0.15)                 // Neural rerank: 15%
        
        return {
            ...c,
            compositeScore,
        }
    })
    
    // Sort by composite score
    return withCompositeScore.sort((a, b) => b.compositeScore - a.compositeScore)
}

function selectTopEvidenceStrict(
    candidates: ScoredCandidate[],
    topN: number
): LegalSourceEvidence[] {
    // Filter: Phải đạt ngưỡng tối thiểu
    const qualified = candidates.filter(c => c.compositeScore >= 50)
    
    // Ensure diversity: Ít nhất 1 official nếu có thể
    const official = qualified.filter(c => c.qualityMetrics.authorityLevel === 'official')
    const others = qualified.filter(c => c.qualityMetrics.authorityLevel !== 'official')
    
    // Strategy: Ưu tiên official, sau đó là score cao nhất
    const selected: LegalSourceEvidence[] = []
    
    // Thêm official sources trước
    for (const source of official.slice(0, Math.min(2, topN))) {
        selected.push(source as LegalSourceEvidence)
    }
    
    // Thêm others để đủ topN
    for (const source of others) {
        if (selected.length >= topN) break
        // Tránh trùng lặp domain
        const domain = getDomainFromUrl(source.url)
        const hasSameDomain = selected.some(s => getDomainFromUrl(s.url) === domain)
        if (!hasSameDomain) {
            selected.push(source as LegalSourceEvidence)
        }
    }
    
    // Fill nếu chưa đủ
    for (const source of qualified) {
        if (selected.length >= topN) break
        if (!selected.some(s => s.url === source.url)) {
            selected.push(source as LegalSourceEvidence)
        }
    }
    
    return selected.slice(0, topN)
}

// ============================================================
// QUALITY VALIDATION
// ============================================================

interface QualityValidation {
    passes: boolean
    reasons: string[]
    recommendations: string[]
}

function validateRetrievalQuality(
    evidence: LegalSourceEvidence[],
    requirements: { requireOfficial: boolean; minResults: number }
): QualityValidation {
    const reasons: string[] = []
    const recommendations: string[] = []
    
    // Check 1: Số lượng
    if (evidence.length < requirements.minResults) {
        reasons.push(`Chỉ tìm thấy ${evidence.length}/${requirements.minResults} nguồn`)
        recommendations.push('Mở rộng tìm kiếm với từ khóa rộng hơn')
    }
    
    // Check 2: Official source
    const hasOfficial = evidence.some(e => e.source_type === 'official')
    if (requirements.requireOfficial && !hasOfficial) {
        reasons.push('Thiếu nguồn chính thống (.gov.vn)')
        recommendations.push('Tìm kiếm thêm từ cơ sở dữ liệu pháp luật chính thức')
    }
    
    // Check 3: Domain diversity
    const domains = new Set(evidence.map(e => getDomainFromUrl(e.url)))
    if (domains.size < evidence.length) {
        recommendations.push('Đa dạng hóa nguồn thông tin từ nhiều domain khác nhau')
    }
    
    return {
        passes: evidence.length >= requirements.minResults && (!requirements.requireOfficial || hasOfficial),
        reasons,
        recommendations,
    }
}

// ============================================================
// SCORING UTILITIES
// ============================================================

function calculateAuthorityScore(evidence: LegalSourceEvidence[]): number {
    if (evidence.length === 0) return 0
    
    const weights = {
        official: 100,
        high: 75,
        medium: 50,
        low: 25,
    }
    
    let totalScore = 0
    for (const source of evidence) {
        const domain = getDomainFromUrl(source.url)
        if (RETRIEVAL_CONFIG.OFFICIAL_DOMAINS.some(d => domain.includes(d))) {
            totalScore += weights.official
        } else if (RETRIEVAL_CONFIG.HIGH_PRIORITY_DOMAINS.some(d => domain.includes(d))) {
            totalScore += weights.high
        } else if (source.source_type === 'official') {
            totalScore += weights.official
        } else {
            totalScore += weights.medium
        }
    }
    
    return Math.round(totalScore / evidence.length)
}

function calculateCoverageScore(evidence: LegalSourceEvidence[], query: string): number {
    if (evidence.length === 0) return 0
    
    const queryKeywords = normalizeLegalQuery(query).split(' ').filter(w => w.length > 3)
    const coveredKeywords = new Set<string>()
    
    for (const source of evidence) {
        const content = normalizeLegalQuery(source.content)
        for (const keyword of queryKeywords) {
            if (content.includes(keyword)) {
                coveredKeywords.add(keyword)
            }
        }
    }
    
    return Math.round((coveredKeywords.size / queryKeywords.length) * 100)
}

// ============================================================
// EXPORTS FOR CONTRACT GENERATION
// ============================================================

/**
 * Wrapper for contract generation - trả về top 3 evidence chất lượng nhất
 */
export async function getTopEvidenceForContract(
    query: string,
    documentType: string,
    supabase: any
): Promise<{
    evidence: LegalSourceEvidence[]
    authorityScore: number
    hasOfficialSource: boolean
}> {
    // Enhance query với document type context
    const enhancedQuery = `[${documentType}] ${query}`
    
    const result = await retrieveLegalEvidenceProduction(enhancedQuery, supabase, {
        requireOfficial: true,
        minResults: 3,
        maxResults: 3,
    })
    
    return {
        evidence: result.topEvidence,
        authorityScore: result.authorityScore,
        hasOfficialSource: result.hasOfficialSource,
    }
}

/**
 * Kiểm tra xem có đủ evidence chất lượng để generate hợp đồng
 */
export function hasSufficientEvidence(
    evidence: LegalSourceEvidence[],
    minOfficialSources = 1
): { sufficient: boolean; reason?: string } {
    if (evidence.length < 3) {
        return { sufficient: false, reason: `Chỉ có ${evidence.length} nguồn tham khảo (cần ít nhất 3)` }
    }
    
    const officialCount = evidence.filter(e => e.source_type === 'official').length
    if (officialCount < minOfficialSources) {
        return { sufficient: false, reason: `Thiếu nguồn chính thống (${officialCount}/${minOfficialSources})` }
    }
    
    const avgScore = evidence.reduce((sum, e) => sum + (e.score || 0), 0) / evidence.length
    if (avgScore < 50) {
        return { sufficient: false, reason: `Chất lượng nguồn thấp (score: ${avgScore.toFixed(1)})` }
    }
    
    return { sufficient: true }
}

export {
    RETRIEVAL_CONFIG,
    type RetrievalResult,
    type SourceQualityMetrics,
}

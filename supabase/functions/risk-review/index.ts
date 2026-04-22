// Edge Function: POST /functions/v1/risk-review
// Analyzes contract text for risky clauses using an agentic search-first approach.
// 1. Extract keywords -> 2. Exa Search -> 3. Gemini/Groq Synthesis with verified URLs.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  authenticateRequest,
  buildCacheKey,
  corsHeaders,
  errorResponse,
  fetchWithRetry,
  jsonResponse,
  mapRiskToVerifiedEvidence,
  persistAnswerAudit,
  persistVerifiedEvidence,
  roundRobinKey,
  embedText,
  checkRateLimit,
  hasHighRiskSignals,
  exaSearch,
  getCachedLegalAnswer,
  logTelemetry,
  summarizeVerification,
  setCachedLegalAnswer,
  validateJSONCitations,
  jinaRerank, // US3: Use reranker
  RiskClause,
} from '../shared/types.ts'

/**
 * Robust JSON cleaner to strip markdown backticks and whitespace.
 */
function cleanJSONResponse(text: string): string {
  return text
    .replace(/^```json\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Rule-based risk extraction to reduce Gemini API calls
 */
function extractRisksByRules(clauseText: string): Array<{ topic: string, search_query: string }> {
  const risks: Array<{ topic: string, search_query: string }> = []
  const text = clauseText.toLowerCase()

  // Penalty clauses
  if (text.includes('phạt') || text.includes('penal') || text.includes('vi phạm')) {
    risks.push({
      topic: 'Phạt vi phạm hợp đồng',
      search_query: 'quy định phạt vi phạm hợp đồng dân sự Việt Nam'
    })
  }

  // Termination clauses
  if (text.includes('chấm dứt') || text.includes('terminate') || text.includes('hủy bỏ')) {
    risks.push({
      topic: 'Chấm dứt hợp đồng',
      search_query: 'điều kiện chấm dứt hợp đồng theo luật dân sự Việt Nam'
    })
  }

  // Payment terms
  if (text.includes('thanh toán') || text.includes('payment') || text.includes('tiền')) {
    risks.push({
      topic: 'Điều kiện thanh toán',
      search_query: 'nghĩa vụ thanh toán trong hợp đồng dân sự Việt Nam'
    })
  }

  // Liability clauses
  if (text.includes('trách nhiệm') || text.includes('bồi thường') || text.includes('liability')) {
    risks.push({
      topic: 'Trách nhiệm bồi thường',
      search_query: 'trách nhiệm dân sự bồi thường thiệt hại Việt Nam'
    })
  }

  // Dispute resolution
  if (text.includes('giải quyết tranh chấp') || text.includes('tòa án') || text.includes('trọng tài')) {
    risks.push({
      topic: 'Giải quyết tranh chấp',
      search_query: 'thẩm quyền giải quyết tranh chấp hợp đồng Việt Nam'
    })
  }

  return risks
}

/**
 * Fallback risk patterns when AI extraction fails
 */
function getFallbackRiskPatterns(clauseText: string): Array<{ topic: string, search_query: string }> {
  return [
    {
      topic: 'Đánh giá tổng thể rủi ro',
      search_query: 'các rủi ro phổ biến trong hợp đồng dân sự Việt Nam'
    }
  ]
}

/**
 * Check if error is quota exceeded
 */
function isQuotaExceeded(error: any): boolean {
  if (!error) return false
  const message = error.message || error.toString() || ''
  return message.includes('RESOURCE_EXHAUSTED') ||
         message.includes('quota exceeded') ||
         message.includes('Quota exceeded')
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user } = await authenticateRequest(req)

    const body = await req.json()
    const { clause_text, contract_context, mode = 'fast' } = body
    if (!clause_text) return errorResponse('Missing clause_text', 400)

    // Rate Limiting (10 requests per minute per user)
    const { allowed } = await checkRateLimit(user.id, 'risk-review', 10, 60)
    if (!allowed) return errorResponse('Rate limit exceeded. Please try again later.', 429)

    const exaKey = roundRobinKey('EXA_API_KEYS', 'EXA_API_KEY')
    const clauseHash = buildCacheKey('risk-review:clause', mode, clause_text)
    const cachedExact = await getCachedLegalAnswer<any>(clauseHash)
    if (cachedExact) {
      return jsonResponse({ ...cachedExact, cached: true }, 200, 3600)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: exactMatch } = await supabaseClient
      .from('semantic_cache')
      .select('result_json')
      .eq('content_hash', clauseHash)
      .maybeSingle()

    if (exactMatch?.result_json) {
      await setCachedLegalAnswer(clauseHash, exactMatch.result_json, 60 * 60)
      return jsonResponse({ ...exactMatch.result_json, cached: true }, 200, 3600)
    }

    if (mode === 'fast' && clause_text.length < 600 && !hasHighRiskSignals(clause_text)) {
      const screenedResponse = {
        risks: [
          {
            clause_ref: 'Điều khoản hiện tại',
            level: 'note',
            description: 'Chưa phát hiện tín hiệu rủi ro mạnh ở bước sàng lọc nhanh. Nên dùng Deep Audit nếu điều khoản này liên quan tới phạt vi phạm, bồi thường, chấm dứt hoặc nghĩa vụ thanh toán.',
            citation: 'Screened locally',
            verification_status: 'unverified',
          },
        ],
        evidence: [],
        verification_status: 'unverified',
        verification_summary: {
          requires_citation: false,
          verification_status: 'unverified',
          citation_count: 0,
          official_count: 0,
          secondary_count: 0,
          unsupported_claim_count: 0,
        },
        screened: true,
      }
      await setCachedLegalAnswer(clauseHash, screenedResponse, 60 * 30)
      return jsonResponse(screenedResponse, 200, 600)
    }

    // 1. Semantic Cache Check
    let embedding: number[] | null = null
    try {
      embedding = await embedText(clause_text)
    } catch (error) {
      console.warn('[Risk Review] Embedding failed, skipping semantic match. Error:', (error as Error).message)
      // Continue with rule-based / AI pipeline even if embedding fails
      embedding = null
    }

    if (embedding) {
      try {
        const { data: cacheMatch } = await supabaseClient.rpc('find_semantic_match', {
          p_embedding: embedding,
          p_threshold: 0.05
        })

        if (cacheMatch && cacheMatch.length > 0) {
          console.log('Semantic Cache Hit!')
          return jsonResponse({ ...cacheMatch[0].result_json, cached: true }, 200, 3600)
        }
      } catch (error) {
        console.warn('[Risk Review] find_semantic_match failed', (error as Error).message)
      }
    } else {
      console.log('[Risk Review] embedding not available, skipping semantic match');
    }

    // 2. Agentic Search-First Phase (Internal DB + Web Exa)
    console.log('[Agentic Risk] Identifying specific risks for targeted search...')

    // Check semantic cache for risk extraction first
    const riskExtractionCacheKey = buildCacheKey('risk-extraction', mode, clause_text)
    const cachedRisks = await getCachedLegalAnswer(riskExtractionCacheKey)
    let extracted_risks: any[] = []

    if (cachedRisks) {
      extracted_risks = cachedRisks.extracted_risks || []
      console.log('[Agentic Risk] Using cached risk extraction:', extracted_risks.length, 'risks')
    } else {
      // Rule-based extraction first (no API call)
      const ruleBasedRisks = extractRisksByRules(clause_text)
      if (ruleBasedRisks.length > 0) {
        extracted_risks = ruleBasedRisks.slice(0, 3)
        console.log('[Agentic Risk] Using rule-based extraction:', extracted_risks.length, 'risks')
      } else {
        // Fallback to AI extraction only when rules don't match
        try {
          const riskExtractorPrompt = `Bạn là chuyên gia phân tích rủi ro hợp đồng. Hãy phân tích điều khoản sau và xác định các điểm GÂY BẤT LỢI hoặc THIẾU MINH BẠCH cho người ký.
          Hãy lờ đi các điều khoản mẫu (boilerplate) thông thường trừ khi chúng có biến tướng gây hại.
          Với mỗi rủi ro thực sự, hãy tạo một câu truy vấn (search_query) để tìm căn cứ pháp lý tại Việt Nam.

          Nội dung: ${clause_text}

          Trả về JSON: { "extracted_risks": [ { "topic": "...", "search_query": "..." } ] }`

          // 1) Prefer GROQ for risk extraction if available (less likely to hit Gemini free-tier quota)
          let extractionError: Error | null = null
          let extractedResponse: any = null

          try {
            const groqExtractorRes = await fetchWithRetry(
              GROQ_API_URL,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'llama-3.3-70b-versatile',
                  messages: [
                    { role: 'system', content: 'Bạn là chuyên gia phân tích rủi ro hợp đồng.' },
                    { role: 'user', content: riskExtractorPrompt }
                  ],
                  temperature: 0,
                  response_format: { type: 'json_object' },
                }),
              },
              { listEnvVar: 'GROQ_API_KEYS', fallbackEnvVar: 'GROQ_API_KEY', maxRetries: 2, backoffBase: 300 }
            )

            if (groqExtractorRes.ok) {
              const groqData = await groqExtractorRes.json()
              const content = groqData.choices?.[0]?.message?.content || '{}'
              extractedResponse = JSON.parse(cleanJSONResponse(content))
            } else {
              console.log('[Agentic Risk] GROQ extraction failed, status', groqExtractorRes.status)
            }
          } catch (err) {
            extractionError = err as Error
            console.log('[Agentic Risk] GROQ extraction error', extractionError.message)
          }

          if (!extractedResponse) {
            // 2) Fall back to Gemini if GROQ is unavailable
            const geminiExtractorRes = await fetchWithRetry(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: riskExtractorPrompt }] }],
                  generationConfig: { response_mime_type: 'application/json' }
                })
              },
              { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY', maxRetries: 2, backoffBase: 300 }
            )

            if (geminiExtractorRes.ok) {
              const geminiData = await geminiExtractorRes.json()
              const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
              extractedResponse = JSON.parse(cleanJSONResponse(rawText))
            } else {
              console.log('[Agentic Risk] Gemini extraction failed, status', geminiExtractorRes.status)
            }
          }

          if (extractedResponse?.extracted_risks?.length > 0) {
            extracted_risks = extractedResponse.extracted_risks.slice(0, 5)
            console.log('[Agentic Risk] AI extraction found:', extracted_risks.length, 'risks')
          } else {
            console.log('[Agentic Risk] AI extraction did not return structured risks, using fallback patterns')
            extracted_risks = getFallbackRiskPatterns(clause_text)
          }
        } catch (error) {
          console.log('[Agentic Risk] AI extraction error, using fallback:', (error as Error).message)
          extracted_risks = getFallbackRiskPatterns(clause_text)
        }
      }

      // Cache the risk extraction results
      await setCachedLegalAnswer(riskExtractionCacheKey, { extracted_risks }, 60 * 30) // 30 min cache
    }

    console.log('[Agentic Risk] Targeted Topics:', (extracted_risks || []).map((r: any) => r.topic))

    // 2a. Parallel Search: Internal Law DB (Hybrid) + Web Exa
    const internalSearchTasks = extracted_risks.slice(0, 2).map(async (r: any) => {
      const qEmbedding = await embedText(r.search_query);
      const { data } = await supabaseClient.rpc('match_document_chunks', {
        query_embedding: qEmbedding,
        match_threshold: 0.3,
        match_count: 5,
        p_query_text: r.search_query
      });
      return (data || []).map((chunk: any) => ({
        content: chunk.content,
        url: `internal-law://${chunk.id}`,
        title: `Official Law: ${chunk.law_reference || 'Văn bản pháp luật'}`,
        source_type: 'official' as const
      }));
    });

    const webSearchTasks = extracted_risks.slice(0, 2).map((r: any) => exaSearch(r.search_query, exaKey, 5));

    // Flatten all candidates
    const nestedCandidates = await Promise.all([...internalSearchTasks, ...webSearchTasks]);
    const allCandidates = nestedCandidates.flat();
    console.log(`[Agentic Risk] Total candidates gathered: ${allCandidates.length}`);

    // 2b. US3: Reranking Selection
    const topEvidenceIndices = await jinaRerank(
      clause_text,
      allCandidates.map(c => `[SOURCE: ${c.title}]\n${c.content}`),
      5
    );

    const goldCandidates = topEvidenceIndices.map((te: any) => allCandidates[te.index]);
    const webContext = goldCandidates.map(c => `[NGUỒN: ${c.url}]\n${c.content}`).join('\n\n---\n\n')
    const allSearchUrls = goldCandidates.map(c => c.url)

    // 3. Synthesis Phase (Final Report)
    const systemPrompt = `Bạn là chuyên gia pháp lý Việt Nam cấp cao, chuyên về thẩm định hợp đồng (Legal Due Diligence).
    Nhiệm vụ: Phân tích rủi ro CHI TIẾT cho điều khoản được cung cấp.

    [CĂN CỨ PHÁP LÝ XÁC THỰC]:
    ${webContext || 'Không tìm thấy dữ liệu pháp luật cụ thể.'}

    YÊU CẦU NGHIÊM NGẶT (PHẢI CÓ):
    1. **risk_quote**: Phải trích dẫn CHÍNH XÁC (word-for-word) câu văn hoặc cụm từ trong hợp đồng gây ra rủi ro này. KHÔNG ĐƯỢC ĐỂ TRỐNG.
    2. **description**: Giải thích chi tiết tại sao nó rủi ro, dựa trên [CĂN CỨ PHÁP LÝ XÁC THỰC]. 
    3. **suggested_revision**: Đưa ra đoạn văn bản THAY THẾ cụ thể, chuyên nghiệp, bảo vệ quyền lợi tối đa cho người ký. Đây là phần hỗ trợ quan trọng nhất.
    4. **citation**: Nêu tên Điều, Luật cụ thể.
    5. **level**: critical (nguy hiểm), moderate (cần sửa), note (lưu ý).

    Cấu trúc JSON bắt buộc:
    {
      "risks": [
        {
          "clause_ref": "Điều X.Y",
          "level": "...",
          "risk_quote": "trích đoạn gốc từ hợp đồng...",
          "description": "giải thích rủi ro...",
          "suggested_revision": "văn bản đề xuất sửa đổi mới...",
          "citation": "...",
          "citation_url": "..."
        }
      ]
    }
    Chỉ trả về JSON.`

    let risks: { risks: RiskClause[] } = { risks: [] }
    const synthesisBody = {
      contents: [{ parts: [{ text: `${systemPrompt}\n\nĐIỀU KHOẢN HỢP ĐỒNG:\n${clause_text}` }] }],
      generationConfig: { response_mime_type: "application/json" }
    }

    // OPTIMIZATION: Prefer Groq for risk synthesis in this endpoint to avoid Gemini free-tier quota issues.
    let synthesisSuccess = false

    try {
      const groqRes = await fetchWithRetry(
        GROQ_API_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Điều khoản cần phân tích:\n${clause_text}` },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        },
        { listEnvVar: 'GROQ_API_KEYS', fallbackEnvVar: 'GROQ_API_KEY', maxRetries: 2, backoffBase: 300 }
      )

      if (groqRes.ok) {
        const groqData = await groqRes.json()
        const rawText = groqData.choices?.[0]?.message?.content || '{}'
        risks = JSON.parse(cleanJSONResponse(rawText))
        synthesisSuccess = true
        console.log('[Risk Synthesis] Groq primary success')
      } else {
        console.log('[Risk Synthesis] Groq primary failed, status', groqRes.status)
      }
    } catch (error) {
      console.log('[Risk Synthesis] Groq primary error:', (error as Error).message)
    }

    if (!synthesisSuccess && mode === 'fast') {
      try {
        const geminiRes = await fetchWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(synthesisBody)
          },
          { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY', maxRetries: 2, backoffBase: 300 }
        )

        if (geminiRes.ok) {
          const gData = await geminiRes.json()
          const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
          risks = JSON.parse(cleanJSONResponse(rawText))
          synthesisSuccess = true
          console.log('[Risk Synthesis] Gemini fallback success')
        } else {
          console.log('[Risk Synthesis] Gemini fallback failed, status', geminiRes.status)
        }
      } catch (error) {
        console.log('[Risk Synthesis] Gemini fallback error:', (error as Error).message)
      }
    }

    // Final fallback: rule-based analysis if both AI models fail
    if (!synthesisSuccess) {
      console.log('[Risk Synthesis] Using rule-based fallback analysis')
      risks = {
        risks: [
          {
            clause_ref: 'Điều khoản được phân tích',
            level: 'moderate',
            risk_quote: clause_text.substring(0, 100) + '...',
            description: 'Không thể phân tích chi tiết do giới hạn kỹ thuật. Khuyến nghị tham khảo ý kiến luật sư chuyên môn.',
            suggested_revision: 'Vui lòng liên hệ luật sư để được tư vấn cụ thể về điều khoản này.',
            citation: 'Phân tích tự động',
            citation_url: undefined
          }
        ]
      }
    }

    // 4. Hallucination Firewall: Programmatic Citation Validation
    risks = validateJSONCitations(risks, allSearchUrls)

    // T033: Ensure risk_quote and suggested_revision exist, otherwise fallback to generic
    risks.risks = (risks.risks || []).map((risk: any) => ({
      ...risk,
      risk_quote: risk.risk_quote || risk.clause_ref || 'Không có trích dẫn cụ thể',
      suggested_revision: risk.suggested_revision || 'Vui lòng liên hệ luật sư để được tư vấn đoạn soạn thảo thay thế cụ thể.'
    }))

    const flattenedEvidence = goldCandidates
    await persistVerifiedEvidence(clause_text, flattenedEvidence as any)
    risks.risks = (risks.risks || []).map((risk: any) => mapRiskToVerifiedEvidence(risk, flattenedEvidence as any))
    const verificationSummary = summarizeVerification(
      risks.risks
        .filter((risk: any) => risk.citation_url)
        .map((risk: any) => ({
          citation_text: risk.citation_text ?? risk.citation,
          citation_url: risk.citation_url,
          source_domain: risk.source_domain,
          source_title: risk.source_title,
          source_excerpt: risk.source_excerpt,
          source_type: risk.source_type,
          verification_status: risk.verification_status,
          retrieved_at: risk.retrieved_at,
        })),
      true,
    )

    const responsePayload = {
      ...risks,
      evidence: flattenedEvidence,
      verification_status: verificationSummary.verification_status,
      verification_summary: verificationSummary,
    }

    await persistAnswerAudit({
      functionName: 'risk-review',
      userId: user.id,
      question: clause_text,
      payload: {
        answer: JSON.stringify(risks.risks || []),
        citations: risks.risks
          .filter((risk: any) => risk.citation_url)
          .map((risk: any) => ({
            citation_text: risk.citation_text ?? risk.citation,
            citation_url: risk.citation_url,
            source_domain: risk.source_domain,
            source_title: risk.source_title,
            source_excerpt: risk.source_excerpt,
            source_type: risk.source_type,
            verification_status: risk.verification_status,
            retrieved_at: risk.retrieved_at,
          })),
        evidence: flattenedEvidence,
        verification_status: verificationSummary.verification_status,
        verification_summary: verificationSummary,
        abstained: false,
      },
      metadata: {
        mode,
        risk_count: (risks.risks || []).length,
      },
    })

    // 5. Save to Semantic Cache
    const semanticCacheRow: any = {
      content_hash: clauseHash,
      content_text: clause_text,
      result_json: responsePayload,
    }

    if (embedding) semanticCacheRow.embedding = embedding
    await supabaseClient.from('semantic_cache').upsert(semanticCacheRow, { onConflict: 'content_hash' })
    await setCachedLegalAnswer(clauseHash, responsePayload, 60 * 60)
    logTelemetry('risk-review', 'completed', {
      mode,
      evidence_count: flattenedEvidence.length,
      risk_count: (risks.risks || []).length,
      clause_chars: clause_text.length,
    })

    return jsonResponse(responsePayload, 200, 3600)
  } catch (err) {
    const message = (err as Error).message
    const status = message === 'Missing Authorization' || message === 'Invalid Authorization header' || message === 'Unauthorized'
      ? 401
      : 500
    return errorResponse(message, status)
  }
}

serve(handler)

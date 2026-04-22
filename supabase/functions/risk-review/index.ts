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
  RiskClause,
} from '../shared/types.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

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
    const embedding = await embedText(clause_text)
    const { data: cacheMatch } = await supabaseClient.rpc('find_semantic_match', {
      p_embedding: embedding,
      p_threshold: 0.05
    })

    if (cacheMatch && cacheMatch.length > 0) {
      console.log('Semantic Cache Hit!')
      return jsonResponse({ ...cacheMatch[0].result_json, cached: true }, 200, 3600)
    }

    // 2. Agentic Search-First Phase (Extract specific risks -> Targeted Search)
    console.log('[Agentic Risk] Identifying specific risks for targeted search...')
    const riskExtractorPrompt = `Bạn là chuyên gia phân tích rủi ro hợp đồng. Hãy phân tích điều khoản sau và xác định các điểm GÂY BẤT LỢI hoặc THIẾU MINH BẠCH cho người ký.
110:     Hãy lờ đi các điều khoản mẫu (boilerplate) thông thường trừ khi chúng có biến tướng gây hại.
111:     Với mỗi rủi ro thực sự, hãy tạo một câu truy vấn (search_query) để tìm căn cứ pháp lý tại Việt Nam.
112: 
113:     Nội dung: ${clause_text}
114: 
115:     Trả về JSON: { "extracted_risks": [ { "topic": "...", "search_query": "..." } ] }`

    const extractorRes = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: riskExtractorPrompt }] }],
          generationConfig: { response_mime_type: "application/json" }
        })
      },
      { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
    )

    if (!extractorRes.ok) throw new Error('Failed to extract risk topics')
    const extractorData = await extractorRes.json()
    const { extracted_risks } = JSON.parse(extractorData.candidates[0].content.parts[0].text)
    console.log('[Agentic Risk] Targeted Topics:', extracted_risks.map((r: any) => r.topic))

    // execute parallel searches for each specific risk
    const searchTasks = extracted_risks.slice(0, 3).map((r: any) => exaSearch(r.search_query, exaKey, 1))
    const searchResults = await Promise.all(searchTasks)
    const webContext = searchResults.flat().map(r => `[NGUỒN: ${r.url}]\n${r.content}`).join('\n\n---\n\n')
    const allSearchUrls = searchResults.flat().map(r => r.url)

    // 3. Synthesis Phase (Final Report)
    const systemPrompt = `Bạn là chuyên gia pháp lý Việt Nam cấp cao, chuyên về thẩm định hợp đồng (Legal Due Diligence).
142:     Nhiệm vụ: Phân tích rủi ro CHI TIẾT cho điều khoản được cung cấp.
143: 
144:     [BỐI CẢNH PHÁP LUẬT THẬT]:
145:     ${webContext || 'Không tìm thấy dữ liệu pháp luật cụ thể.'}
146: 
147:     YÊU CẦU NGHIÊM NGẶT:
148:     1. **risk_quote**: Phải trích dẫn CHÍNH XÁC câu văn/cụm từ trong hợp đồng gây ra rủi ro này.
149:     2. **description**: Giải thích rõ tại sao nó rủi ro, dựa trên [BỐI CẢNH PHÁP LUẬT THẬT]. Không nói chung chung.
150:     3. **suggested_revision**: Đưa ra đoạn văn bản thay thế cụ thể, chuyên nghiệp để bảo vệ quyền lợi người dùng.
151:     4. **citation**: Nêu tên Điều, Luật cụ thể.
152:     5. **level**: critical (nguy hiểm), moderate (cần sửa), note (lưu ý).
153: 
154:     Cấu trúc JSON:
155:     {
156:       "risks": [
157:         {
158:           "clause_ref": "Điều X.Y",
159:           "level": "...",
160:           "risk_quote": "đoạn trích gây rủi ro...",
161:           "description": "giải thích rủi ro...",
162:           "suggested_revision": "đề xuất sửa đổi...",
163:           "citation": "...",
164:           "citation_url": "..."
165:         }
166:       ]
167:     }
168:     Chỉ trả về JSON.`

    let risks: { risks: RiskClause[] } = { risks: [] }
    const synthesisBody = {
      contents: [{ parts: [{ text: `${systemPrompt}\n\nĐIỀU KHOẢN HỢP ĐỒNG:\n${clause_text}` }] }],
      generationConfig: { response_mime_type: "application/json" }
    }

    if (mode === 'fast') {
      const geminiRes = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(synthesisBody)
        },
        { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
      )
      const gData = await geminiRes.json()
      risks = JSON.parse(gData.candidates[0].content.parts[0].text)
    } else {
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
        { listEnvVar: 'GROQ_API_KEYS', fallbackEnvVar: 'GROQ_API_KEY' }
      )
      const groqData = await groqRes.json()
      risks = JSON.parse(groqData.choices[0].message.content)
    }

    // 4. Hallucination Firewall: Programmatic Citation Validation
    risks = validateJSONCitations(risks, allSearchUrls)

    const flattenedEvidence = searchResults.flat()
    await persistVerifiedEvidence(clause_text, flattenedEvidence)
    risks.risks = (risks.risks || []).map((risk: any) => mapRiskToVerifiedEvidence(risk, flattenedEvidence))
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
    await supabaseClient.from('semantic_cache').upsert({
      content_hash: clauseHash,
      content_text: clause_text,
      embedding: embedding,
      result_json: responsePayload,
    }, { onConflict: 'content_hash' })
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

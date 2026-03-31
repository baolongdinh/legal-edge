// Edge Function: POST /functions/v1/risk-review
// Analyzes contract text for risky clauses using an agentic search-first approach.
// 1. Extract keywords -> 2. Exa Search -> 3. Gemini/Groq Synthesis with verified URLs.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
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
  exaSearch,
  summarizeVerification,
  validateJSONCitations,
} from '../shared/types.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing Authorization', 401)

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', 401)

    const body = await req.json()
    const { clause_text, contract_context, mode = 'fast' } = body
    if (!clause_text) return errorResponse('Missing clause_text', 400)

    // Rate Limiting (10 requests per minute per user)
    const { allowed } = await checkRateLimit(user.id, 'risk-review', 10, 60)
    if (!allowed) return errorResponse('Rate limit exceeded. Please try again later.', 429)

    const exaKey = roundRobinKey('EXA_API_KEYS', 'EXA_API_KEY')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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
    const riskExtractorPrompt = `Phân tích sơ bộ điều khoản hợp đồng sau và xác định các khía cạnh pháp lý tiềm ẩn rủi ro.
    Với mỗi rủi ro, hãy tạo một câu truy vấn (search_query) tối ưu để tìm quy định pháp luật Việt Nam tương ứng.

    Nội dung điều khoản: ${clause_text}

    Trả về JSON: { "extracted_risks": [ { "topic": "...", "search_query": "..." } ] }`

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
    const systemPrompt = `Bạn là chuyên gia pháp lý Việt Nam cấp cao.
    Nhiệm vụ: Phân tích rủi ro của điều khoản hợp đồng dựa trên bối cảnh pháp lý thực tế được cung cấp.

    [BỐI CẢNH PHÁP LUẬT THẬT (Từ Internet)]:
    ${webContext || 'Không tìm thấy dữ liệu pháp luật cụ thể.'}

    Yêu cầu bắt buộc:
    1. Phân loại rủi ro (critical/moderate/note).
    2. Trích dẫn CHÍNH XÁC điều luật từ [BỐI CẢNH PHÁP LUẬT THẬT].
    3. MỖI RỦI RO PHẢI kèm theo "citation_url" trích từ [BỐI CẢNH PHÁP LUẬT THẬT].
    4. Ưu tiên đường link KHÁC NHAU cho các rủi ro khác nhau nếu có trong ngữ cảnh.

    Cấu trúc JSON:
    {
      "risks": [
        {
          "clause_ref": "Điều X.Y của hợp đồng",
          "level": "critical|moderate|note",
          "description": "Mô tả rủi ro chuyên nghiệp",
          "citation": "Điều X Luật Y",
          "citation_url": "URL thật duy nhất dẫn tới luật này"
        }
      ]
    }
    Chỉ trả về JSON.`

    let risks = { risks: [] }
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
    await supabaseClient.from('semantic_cache').insert({
      content_text: clause_text,
      embedding: embedding,
      result_json: responsePayload,
    })

    return jsonResponse(responsePayload, 200, 3600)
  } catch (err) {
    return errorResponse((err as Error).message)
  }
}

serve(handler)

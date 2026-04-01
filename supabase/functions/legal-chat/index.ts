// Edge Function: POST /functions/v1/legal-chat
// Provides AI-powered legal consultation using Gemini 1.5 Flash
// Security: Manual JWT verification via Supabase Auth API

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  authenticateRequest,
  buildCacheKey,
  buildAbstainPayload,
  buildCompactDocumentContext,
  buildLegalAnswerPayload,
  checkRateLimit,
  compactText,
  corsHeaders,
  errorResponse,
  fetchWithRetry,
  getCachedLegalAnswer,
  isStandaloneQuestion,
  jsonResponse,
  logTelemetry,
  normalizeLegalQuery,
  persistAnswerAudit,
  persistVerifiedEvidence,
  requiresLegalCitation,
  retrieveLegalEvidence,
  setCachedLegalAnswer,
} from '../shared/types.ts'

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user } = await authenticateRequest(req)

    // 2. Parse Request Body
    const {
      message,
      history = [],
      document_context,
      context_summary,
      context_excerpts = [],
      document_hash,
    } = await req.json()
    if (!message) return errorResponse('Thiếu nội dung tin nhắn', 400)

    const { allowed } = await checkRateLimit(user.id, 'legal-chat', 8, 60)
    if (!allowed) return errorResponse('Bạn đã gửi quá nhanh. Vui lòng thử lại sau ít phút.', 429)

    const compactDocumentContext = buildCompactDocumentContext(
      typeof context_summary === 'string' ? context_summary : undefined,
      Array.isArray(context_excerpts) ? context_excerpts : [],
      typeof document_context === 'string' ? document_context : undefined,
    )
    const normalizedMessage = normalizeLegalQuery(message)
    const canUseCache = isStandaloneQuestion(message) || history.length === 0
    const needsCitation = requiresLegalCitation(message)
    const evidence = needsCitation ? await retrieveLegalEvidence(message, 4) : []
    if (needsCitation && evidence.length > 0) {
      await persistVerifiedEvidence(message, evidence)
    }
    const answerCacheKey = canUseCache
      ? buildCacheKey(
        'cache:legal_answer:legal-chat',
        normalizedMessage,
        document_hash || 'global',
      )
      : null

    if (answerCacheKey) {
      const cachedPayload = await getCachedLegalAnswer<any>(answerCacheKey)
      if (cachedPayload) {
        return jsonResponse({ reply: cachedPayload.answer, ...cachedPayload, cached: true }, 200)
      }
    }

    if (needsCitation && evidence.length === 0) {
      const abstain = buildAbstainPayload(
        'Tôi chưa có đủ căn cứ từ nguồn pháp lý đáng tin cậy để trả lời chắc chắn. Vui lòng nêu rõ tên luật, điều khoản hoặc bối cảnh pháp lý cụ thể hơn.',
        true,
      )
      return jsonResponse({
        reply: abstain.answer,
        ...abstain,
      }, 200)
    }

    let systemPrompt = `Bạn là Trợ lý Pháp lý AI cao cấp của LegalShield Việt Nam. 
Nhiệm vụ của bạn là giải đáp các thắc mắc về luật pháp Việt Nam một cách chuyên nghiệp, chính xác.
Tên người dùng đang chat với bạn: ${user.user_metadata?.full_name || user.email || 'Người dùng'}.

Quy tắc ứng xử:
1. Luôn sử dụng tiếng Việt trang trọng, lịch sự.
2. Nếu câu hỏi là legal claim, chỉ được trả lời dựa trên các nguồn chứng cứ đã cung cấp.
3. Không được bịa điều luật, số điều, tên văn bản hoặc đường link.
4. Nếu chứng cứ chưa đủ, phải nói rõ là chưa đủ căn cứ để khẳng định.
5. Luôn thêm lời nhắc nhở tham vấn luật sư ở cuối câu trả lời.
6. Mỗi kết luận pháp lý quan trọng phải bám sát chứng cứ đã cung cấp.
7. Ngắn gọn, súc tích nhưng đầy đủ ý.`

    if (compactDocumentContext) {
      systemPrompt += `\n\nBỐI CẢNH TÀI LIỆU: Người dùng đã tải lên một tài liệu. Hãy ưu tiên trả lời dựa trên tóm tắt và các đoạn liên quan sau nếu câu hỏi có liên quan:\n"""\n${compactDocumentContext}\n"""`
    }

    if (evidence.length > 0) {
      const evidenceText = evidence
        .map((item, index) => `[#${index + 1}] ${item.title}\nURL: ${item.url}\nNguồn: ${item.source_domain}\nTrích đoạn: ${item.content.slice(0, 900)}`)
        .join('\n\n---\n\n')
      systemPrompt += `\n\nCHỨNG CỨ PHÁP LÝ ĐÃ XÁC THỰC:\n${evidenceText}`
    }

    const contents = history.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))

    contents.push({
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\nNgười dùng hỏi: ${message}` }]
    })

    const response = await fetchWithRetry(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      },
      { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${await response.text()}`)
    }

    const data = await response.json()
    const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Xin lỗi, tôi không thể tìm thấy câu trả lời phù hợp."
    const payload = buildLegalAnswerPayload(rawReply, evidence, needsCitation)
    logTelemetry('legal-chat', 'completed', {
      has_document_context: Boolean(compactDocumentContext),
      document_context_chars: compactDocumentContext?.length ?? 0,
      prompt_chars: compactText(systemPrompt, 8000).length,
      cacheable: Boolean(answerCacheKey),
      evidence_count: evidence.length,
    })
    await persistAnswerAudit({
      functionName: 'legal-chat',
      userId: user.id,
      question: message,
      payload,
      metadata: {
        has_document_context: Boolean(compactDocumentContext),
        document_hash: document_hash ?? null,
        history_count: history.length,
        normalized_message: normalizedMessage,
      },
    })
    if (answerCacheKey && !payload.abstained) {
      await setCachedLegalAnswer(answerCacheKey, payload, 60 * 60)
    }

    return jsonResponse({ reply: payload.answer, ...payload }, 200)
  } catch (err) {
    console.error('Chat function error:', err)
    const message = (err as Error).message
    const status = message === 'Missing Authorization' || message === 'Invalid Authorization header' || message === 'Unauthorized'
      ? 401
      : 500
    return errorResponse(message, status)
  }
}

serve(handler)

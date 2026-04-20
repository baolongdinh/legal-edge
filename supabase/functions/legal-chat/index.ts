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
  createClient,
  embedText,
  errorResponse,
  fetchWithRetry,
  getCachedLegalAnswer,
  hasRecentLegalEvidence,
  isStandaloneQuestion,
  jsonResponse,
  logTelemetry,
  normalizeLegalQuery,
  persistAnswerAudit,
  persistVerifiedEvidence,
  requiresLegalCitation,
  retrieveChatMemory,
  retrieveLegalEvidence,
  setCachedLegalAnswer,
  getSemanticCache,
  setSemanticCache,
  storeChatMemory,
  storeEvidenceInMemory,
  jinaRerank,
  LegalSourceEvidence,
} from '../shared/types.ts'

/**
 * Task T002: Rewrite message + history into a single standalone legal query.
 */
async function buildStandaloneQuery(history: any[], currentMessage: string): Promise<string> {
  if (history.length === 0) return currentMessage.trim();

  const prompt = `Bạn là một chuyên gia phân tích ngữ cảnh pháp lý. 
Dựa vào lịch sử trò chuyện và câu hỏi mới nhất, hãy viết lại câu hỏi này thành một câu hỏi độc lập (Standalone Query), đầy đủ ý nghĩa, bao gồm tất cả các bối cảnh quan trọng (đối tượng, loại hợp đồng, tình huống) từ lịch sử để có thể dùng tìm kiếm vector hoặc internet một cách chính xác nhất.

Lịch sử trò chuyện:
${history.slice(-5).map(m => `${m.role === 'user' ? 'Người dùng' : 'AI'}: ${m.content}`).join('\n')}

Câu hỏi mới: "${currentMessage}"

Yêu cầu:
- Trả về DUY NHẤT câu hỏi đã được viết lại.
- Nếu câu hỏi mới đã đủ ý, hãy trả về nguyên văn.
- Ngôn ngữ: Tiếng Việt.

Câu hỏi độc lập:`;

  try {
    const response = await fetchWithRetry(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 250, temperature: 0.1 }
        })
      },
      { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
    );

    if (!response.ok) return currentMessage.trim();
    const data = await response.json();
    const rewritten = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return rewritten || currentMessage.trim();
  } catch (e) {
    console.warn('Standalone query rewrite failed:', e);
    return currentMessage.trim();
  }
}

/**
 * Task T003: HyDE (Hypothetical Document Embeddings).
 * Generate a "fake" legal answer to improve vector search similarity.
 */
async function generateHypotheticalDocument(query: string): Promise<string> {
  const prompt = `Hãy đóng vai một Luật sư Việt Nam. 
Dựa trên câu hỏi pháp lý sau, hãy viết một đoạn trích dẫn giả định (Hypothetical Document) từ một văn bản pháp luật hoặc công văn hướng dẫn có thể chứa câu trả lời. 
Đoạn trích này phải mang ngôn từ trang trọng, hàn lâm, chứa các từ khóa chuyên môn pháp lý liên quan.

Câu hỏi: "${query}"

Yêu cầu:
- Chỉ viết đoạn trích dẫn (không chào hỏi, không kết luận).
- Độ dài khoảng 100-200 từ.
- Ngôn ngữ: Tiếng Việt.

Đoạn trích giả định:`;

  try {
    const response = await fetchWithRetry(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.4 }
        })
      },
      { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
    );

    if (!response.ok) return query; // Fallback to original
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || query;
  } catch (e) {
    console.warn('HyDE doc generation failed:', e);
    return query;
  }
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user } = await authenticateRequest(req)

    const {
      message,
      history = [],
      document_context,
      context_summary,
      context_excerpts = [],
      document_hash,
      contract_text, // Consultant context
      risk_report,   // Consultant context
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
    const needsCitation = requiresLegalCitation(message)
    // Only cache standalone, citation-free questions that are context-independent
    const canUseCache = !needsCitation && (isStandaloneQuestion(message) || history.length === 0)

    // @ts-ignore: Deno global
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-ignore: Deno global
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(url, key)

    // --- STEP 1: EXACT CACHE CHECK (Fast Path) ---
    const answerCacheKey = canUseCache
      ? buildCacheKey('cache:legal_answer:legal-chat', normalizedMessage, document_hash || 'global')
      : null

    if (answerCacheKey) {
      const cachedPayload = await getCachedLegalAnswer<any>(answerCacheKey)
      if (cachedPayload) {
        return jsonResponse({ reply: cachedPayload.answer, ...cachedPayload, cached: true }, 200)
      }
    }

    // --- STEP 2: STANDALONE QUERY & SEMANTIC CACHE (Medium Path) ---
    const standaloneQuery = await buildStandaloneQuery(history, message)
    const queryEmbeddingForCache = await embedText(standaloneQuery || message, undefined, 768)

    if (queryEmbeddingForCache.length > 0) {
      const semanticCached = await getSemanticCache(supabase, queryEmbeddingForCache, 0.05)
      if (semanticCached) {
        return jsonResponse({
          reply: semanticCached.reply || semanticCached.answer,
          ...semanticCached,
          semantic_cached: true
        }, 200)
      }
    }
    // ---------------------------------

    // 2.1 HyDE: Hypothetical Document for better embeddings (T003/T004)

    // 2.1 HyDE: Hypothetical Document for better embeddings (T003/T004)
    const hydeDoc = await generateHypotheticalDocument(standaloneQuery)

    let memories: Awaited<ReturnType<typeof retrieveChatMemory>> = []
    let messageEmbedding: number[] = []
    let exaEvidence: LegalSourceEvidence[] = []
    let localLawChunks: any[] = []

    // 2.2 Start Parallel Promises
    const fetchMemoryPromise = embedText(standaloneQuery, undefined, 768)
      .then(async (embedding) => {
        messageEmbedding = embedding
        memories = await retrieveChatMemory(supabase, messageEmbedding, user.id, standaloneQuery)
      })
      .catch(e => console.warn('Memory retrieval failed:', (e as Error).message))

    const fetchExaPromise = needsCitation
      ? retrieveLegalEvidence(standaloneQuery, 10).catch(e => {
        console.warn('Exa retrieval failed:', (e as Error).message)
        return []
      })
      : Promise.resolve([])

    const fetchLocalLawPromise = (needsCitation || Boolean(document_hash))
      ? embedText(hydeDoc, undefined, 768).then(emb =>
        supabase.rpc('match_document_chunks', {
          query_embedding: emb,
          match_threshold: 0.2, // Lowered to get more candidates for reranking
          match_count: 25,
          p_query_text: standaloneQuery // HYBRID: Add keyword search
        }).then(({ data }) => data || [])
      ).catch(e => {
        console.warn('Local RAG failed:', e)
        return []
      })
      : Promise.resolve([])

    const [, parallelExa, parallelLocalLaw] = await Promise.all([
      fetchMemoryPromise,
      fetchExaPromise,
      fetchLocalLawPromise
    ])

    exaEvidence = parallelExa as LegalSourceEvidence[]
    localLawChunks = parallelLocalLaw as any[]

    // --- STEP 3: JINA RERANKING & DYNAMIC ABORT (T005/T006) ---
    let combinedEvidence: LegalSourceEvidence[] = []

    // Map Local Law Chunks to Evidence Type
    const localEvidenceItems: LegalSourceEvidence[] = localLawChunks.map(c => ({
      url: '',
      title: c.law_article || 'Tài liệu nội bộ',
      content: c.content,
      source_domain: 'legalshield.local',
      source_type: 'official',
      verification_status: 'verified',
      retrieved_at: new Date().toISOString()
    }))

    const candidates = [...exaEvidence, ...localEvidenceItems]

    if (candidates.length > 0) {
      try {
        const candidateTexts = candidates.map(c => `[${c.source_domain}] ${c.title}: ${c.content.slice(0, 1000)}`)
        const rerankResults = await jinaRerank(standaloneQuery, candidateTexts, 8)

        // Task T006: Dynamic Threshold (0.35)
        combinedEvidence = rerankResults
          .filter(r => r.score >= 0.35)
          .map(r => candidates[r.index])
          .filter(Boolean)
      } catch (err) {
        console.warn('Jina rerank in chat failed:', err)
        combinedEvidence = candidates.slice(0, 5)
      }
    }

    if (needsCitation && combinedEvidence.length === 0 && !hasRecentLegalEvidence(memories)) {
      const abstain = buildAbstainPayload(
        'Tôi chưa tìm thấy căn cứ pháp lý nào đủ tin cậy trong kho dữ liệu hoặc internet để giải đáp chính xác câu hỏi này. Vui lòng cung cấp thêm thông tin về văn bản luật cụ thể.',
        true,
      )
      return jsonResponse({ reply: abstain.answer, ...abstain }, 200)
    }

    // --- STEP 4: BUILD PROMPT ---
    let systemPrompt = `Bạn là Trợ lý Pháp lý AI cao cấp của LegalShield Việt Nam. 
Nhiệm vụ của bạn là tư vấn pháp luật, giải đáp thắc mắc và SẴN SÀNG SOẠN THẢO các dự thảo văn bản pháp lý (đơn khởi kiện, hợp đồng, văn bản tố tụng...) khi người dùng có yêu cầu.
Tên người dùng đang chat với bạn: ${user.user_metadata?.full_name || user.email || 'Người dùng'}.

Quy tắc ứng xử:
1. Luôn sử dụng tiếng Việt trang trọng, lịch sự.
2. TUYỆT ĐỐI KHÔNG từ chối yêu cầu soạn thảo văn bản. Hãy luôn cung cấp mẫu văn bản hoặc dự thảo tốt nhất có thể dựa trên thông tin người dùng cung cấp.
3. Nếu câu hỏi yêu cầu độ chính xác pháp lý (legal claim), chỉ được trả lời dựa trên các nguồn chứng cứ đã cung cấp.
4. Không được bịa điều luật, số điều, tên văn bản hoặc đường link.
5. Nếu chứng cứ chưa đủ, phải nói rõ là chưa đủ căn cứ để khẳng định.
6. BẮT BUỘC TRÍCH DẪN IN-LINE: Mỗi kết luận, điều khoản pháp lý lấy từ "CHỨNG CỨ PHÁP LÝ", bạn PHẢI ghim nguồn bằng cú pháp [#X] ngay cuối câu.
7. Ngắn gọn, súc tích nhưng đầy đủ ý.
8. Ở cuối câu trả lời, hãy thêm một lời nhắc nhở ngắn gọn gọn gàng về việc tham vấn luật sư thực tế nếu cần thiết.`

    // --- CONSULTANT MODE OVERRIDE ---
    if (contract_text || risk_report) {
      systemPrompt = `Bạn là Chuyên gia Tư vấn Hợp đồng cấp cao (Contract Consultant). 
Nhiệm vụ: Giải đáp mọi thắc mắc của người dùng liên quan đến văn bản hợp đồng và báo cáo rủi ro đã được cung cấp.
Phong cách: Chuyên nghiệp, thận trọng, bảo vệ quyền lợi người dùng tối đa.
Hãy luôn đối chiếu với nội dung hợp đồng gốc và các rủi ro đã phát hiện để đưa ra lời khuyên chính xác.`

      if (contract_text) {
        systemPrompt += `\n\nNỘI DUNG HỢP ĐỒNG GỐC ĐANG XỬ LÝ:\n"""\n${compactText(contract_text, 4000)}\n"""`
      }
      if (risk_report) {
        const reportText = typeof risk_report === 'string' ? risk_report : JSON.stringify(risk_report, null, 2)
        systemPrompt += `\n\nBÁO CÁO RỦI RO CẦN LƯU Ý:\n"""\n${compactText(reportText, 3000)}\n"""`
      }
    }

    // Build memory context
    const messageMemories = memories.filter(m => m.content_type !== 'evidence')
    const evidenceMemories = memories.filter(m => m.content_type === 'evidence')

    const memoryContext = messageMemories.length > 0
      ? messageMemories.map(m => `[${m.role === 'user' ? 'Người dùng' : 'AI'}]: ${m.content}`).join('\n')
      : ''
    const memoryEvidenceContext = evidenceMemories.length > 0
      ? evidenceMemories.map(m => m.content).join('\n\n---\n\n')
      : ''

    if (memoryContext) {
      systemPrompt += `\n\nBỐI CẢNH TỪ QUÁ KHỨ (LONG-TERM MEMORY):\n"""\n${memoryContext}\n"""`
    }

    if (memoryEvidenceContext && combinedEvidence.length === 0) {
      systemPrompt += `\n\nNGUỒN PHÁP LÝ TỪ BỘ NHỚ (đã tra cứu trước đó):\n"""\n${memoryEvidenceContext}\n"""`
    }

    if (compactDocumentContext) {
      systemPrompt += `\n\nBỐI CẢNH TÀI LIỆU CỤ THỂ:\n"""\n${compactDocumentContext}\n"""`
    }

    if (combinedEvidence.length > 0) {
      const xmlEvidence = combinedEvidence
        .map((item, index) => `[#${index + 1}] ${item.title}\nURL: ${item.url || 'N/A'}\nNguồn: ${item.source_domain}\nTrích đoạn: ${item.content.slice(0, 1000)}`)
        .join('\n\n---\n\n')
      systemPrompt += `\n\nCHỨNG CỨ PHÁP LÝ ĐÃ XÁC THỰC (ƯU TIÊN TRÍCH DẪN):\n${xmlEvidence}`
    }

    const contents = history.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))

    contents.push({
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\nNgười dùng hỏi: ${message}` }]
    })
    // ---------------------------

    // --- STEP 5: GEMINI CALL ---
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
    const rawReply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Xin lỗi, tôi không thể tìm thấy câu trả lời phù hợp.'
    const payload = buildLegalAnswerPayload(rawReply, combinedEvidence, needsCitation)
    // ---------------------------

    // --- STEP 6: STORE TO MEMORY (fire-and-forget, compact) ---
    if (messageEmbedding.length > 0) {
      // User message: full text
      storeChatMemory(supabase, {
        user_id: user.id,
        role: 'user',
        content: message,
        embedding: messageEmbedding,
      }).catch(e => console.warn('Memory user store failed:', (e as Error).message))

      // AI reply: store compact version (first 400 chars + cited URLs)
      const citedUrls = payload.citations.map(c => c.citation_url).filter(Boolean).join(' ')
      const compactReply = rawReply.slice(0, 400) + (citedUrls ? `\n[Nguồn: ${citedUrls}]` : '')

      embedText(compactReply, undefined, 768).then(replyEmbedding =>
        storeChatMemory(supabase, {
          user_id: user.id,
          role: 'assistant',
          content: compactReply,
          embedding: replyEmbedding,
        })
      ).catch(e => console.warn('Memory reply store failed:', (e as Error).message))
    }
    // ----------------------------------------------------------

    logTelemetry('legal-chat', 'completed', {
      has_document_context: Boolean(compactDocumentContext),
      document_context_chars: compactDocumentContext?.length ?? 0,
      prompt_chars: compactText(systemPrompt, 8000).length,
      cacheable: Boolean(answerCacheKey),
      evidence_count: combinedEvidence.length,
      evidence_from_memory: combinedEvidence.length > 0 && memories.some(m => m.content_type === 'evidence'),
      has_memory: memories.length > 0,
      has_memory_evidence: evidenceMemories.length > 0,
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
        standalone_query: standaloneQuery,
        memory_recall: Boolean(memoryContext),
        exa_skipped: combinedEvidence.length > 0 && !needsCitation,
      },
    })
    if (answerCacheKey && !payload.abstained) {
      await setCachedLegalAnswer(answerCacheKey, payload, 60 * 60)
    }

    // --- NEW: STORE TO SEMANTIC CACHE ---
    if (!payload.abstained && queryEmbeddingForCache.length > 0) {
      await setSemanticCache(supabase, standaloneQuery || message, queryEmbeddingForCache, {
        reply: payload.answer,
        ...payload
      })
    }
    // ------------------------------------

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

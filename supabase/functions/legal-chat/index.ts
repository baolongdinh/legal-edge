// Edge Function: POST /functions/v1/legal-chat
// Provides AI-powered legal consultation using Gemini 2.5 Flash Lite
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
  fetchImage,
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
  callLLM,
  callVisionLLM,
  fetchImageFromStorage,
  IntentEvaluation,
} from '../shared/types.ts'

/**
 * Task: Evaluate user intent, complexity, and drafting needs.
 * Uses Groq (via callLLM) for ultra-fast pre-flight analysis.
 */
async function evaluateIntent(
  message: string,
  history: any[],
  context_summary?: string,
): Promise<IntentEvaluation> {
  const prompt = `Bạn là một Chuyên gia Phân tích Ý định Pháp lý. 
Nhiệm vụ của bạn là phân tích câu hỏi của người dùng và lịch sử trò chuyện để xác định các yếu tố sau:
1. Intent: 'general' (chào hỏi, tán gẫu), 'analysis' (hỏi đáp/phân tích pháp luật), 'drafting' (yêu cầu soạn thảo văn bản/đơn/hợp đồng), 'citation_request' (yêu cầu tìm văn bản luật cụ thể).
2. Needs Citations: Có cần trích dẫn điều luật/cơ sở pháp lý không? (Luôn đúng nếu là drafting/analysis).
3. Complexity: Độ phức tạp của vấn đề ('low', 'medium', 'high').
4. Is Drafting: Người dùng có đang yêu cầu soạn thảo một văn bản pháp lý mới hoặc sửa đổi văn bản hiện có không?
5. Suggested Standalone Query: Một câu hỏi độc lập, đầy đủ ngữ cảnh để tra cứu RAG (Vector Search).
6. Reasoning: Giải thích ngắn gọn lý do phân loại.

Lịch sử trò chuyện:
${history.slice(-3).map((m) => `${m.role === 'user' ? 'Người dùng' : 'AI'}: ${m.content}`).join('\n')}

Tóm tắt bối cảnh: ${context_summary || 'N/A'}

Câu hỏi mới: "${message}"

Yêu cầu trả về định dạng JSON duy nhất:
{
  "intent": "general" | "analysis" | "drafting" | "citation_request",
  "needs_citations": boolean,
  "complexity": "low" | "medium" | "high",
  "is_drafting": boolean,
  "suggested_standalone_query": "string",
  "reasoning": "string"
}`;

  try {
    const result = await callLLM([
      { role: 'system', content: 'Bạn là chuyên gia phân loại ý định pháp lý. Chỉ trả về JSON.' },
      { role: 'user', content: prompt },
    ], { jsonMode: true, temperature: 0.1 });

    const parsed = JSON.parse(result);
    return {
      intent: parsed.intent || 'analysis',
      needs_citations: parsed.needs_citations ?? true,
      complexity: parsed.complexity || 'medium',
      is_drafting: parsed.is_drafting ?? false,
      suggested_standalone_query: parsed.suggested_standalone_query || message,
      reasoning: parsed.reasoning || '',
    };
  } catch (e) {
    console.warn('Intent evaluation failed, using fallback:', e);
    return {
      intent: 'analysis',
      needs_citations: true,
      complexity: 'medium',
      is_drafting: false,
      suggested_standalone_query: message,
      reasoning: 'Fallback due to error',
    };
  }
}

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
    const rewritten = await callLLM([
      { role: 'system', content: 'Bạn là chuyên gia phân tích ngữ cảnh.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 250, temperature: 0.1 });

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
    const hydeDoc = await callLLM([
      { role: 'system', content: 'Bạn là Luật sư giàu kinh nghiệm.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 400, temperature: 0.4 });

    return hydeDoc || query;
  } catch (e) {
    console.warn('HyDE doc generation failed:', e);
    return query;
  }
}

/**
 * Task: Auto-generate a descriptive title for new conversations.
 */
async function autoGenerateConversationTitle(
  supabase: any,
  conversationId: string,
  userMessage: string,
  assistantResponse: string,
  history: any[] = []
): Promise<void> {
  try {
    // 1. Check if the conversation actually needs a title
    const { data: conv, error: fetchError } = await supabase
      .from('conversations')
      .select('title, user_id')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conv) return;

    // Only generate if it's the default title (placeholder) or empty
    const currentTitle = conv.title || '';
    const normalizedTitle = currentTitle.trim().toLowerCase();

    const isPlaceholder = !currentTitle ||
      normalizedTitle === '' ||
      normalizedTitle === 'cuộc trò chuyện mới' ||
      normalizedTitle === 'mới' ||
      normalizedTitle === 'new conversation' ||
      normalizedTitle.includes('unnamed') ||
      normalizedTitle.includes('untitled');

    if (!isPlaceholder) {
      console.log(`[Titling] Skip: Conversation ${conversationId} already has title "${currentTitle}"`);
      return;
    }

    // 0. Skip if both are too short AND we don't have enough history to compensate
    const totalContextLength = userMessage.length + assistantResponse.length +
      history.reduce((acc, m) => acc + (m.content?.length || 0), 0);

    if (totalContextLength < 50) return;

    // Prepare context for titling
    const totalContext = (history.map(m => `${m.role}: ${m.content}`).join('\n') + `\nuser: ${userMessage}\nassistant: ${assistantResponse}`).slice(-4000);

    const titlePrompt = [
      { role: 'system', content: 'Bạn là chuyên gia pháp lý. Hãy đặt tiêu đề cho cuộc hội thoại này dựa trên nội dung thảo luận. Tiêu đề phải ngắn gọn (dưới 7 từ), chuyên nghiệp, bằng tiếng Việt và đi thẳng vào vấn đề pháp lý chính.' },
      { role: 'user', content: `Dựa trên nội dung sau, hãy đặt tiêu đề phù hợp:\n\n${totalContext}` }
    ] as any;

    const title = await callLLM(titlePrompt, { maxTokens: 50, temperature: 0.3 });

    if (title && title.length > 2) {
      console.log(`[Titling] Generated title for ${conversationId}: "${title}"`);

      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          title: title.trim().replace(/^"|"$/g, ''),
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateError) {
        console.error(`[Titling] Update error for ${conversationId}:`, updateError);
      } else {
        console.log(`[Auto-Title] Updated conversation ${conversationId} to: "${title}"`);
      }
    }

  } catch (err) {
    console.warn('[Auto-Title] Failed:', (err as Error).message);
  }
}
/**
 * Task T004: Helper for streaming Gemini response with retry and key rotation.
 */
async function* streamGemini(contents: any[], model = 'gemini-2.5-flash-lite'): AsyncGenerator<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 2500,
        temperature: 0.7,
      }
    })
  }, { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' });

  if (!response.ok) {
    throw new Error(`Gemini streaming error: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let startIndex = -1;
      let braceCount = 0;

      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === '{') {
          if (braceCount === 0) startIndex = i;
          braceCount++;
        } else if (buffer[i] === '}') {
          braceCount--;
          if (braceCount === 0 && startIndex !== -1) {
            const jsonStr = buffer.substring(startIndex, i + 1);
            try {
              const data: any = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) yield text;
            } catch (e) {
              // Fragment
            }
            startIndex = -1;
          }
        }
      }

      if (startIndex !== -1) {
        buffer = buffer.substring(startIndex);
      } else {
        buffer = '';
      }
    }
  } finally {
    reader.releaseLock();
  }
}

interface StreamChunk {
  type: 'chunk' | 'suggestions' | 'done' | 'error' | 'evidence' | 'status';
  content?: string;
  payload?: any;
  error?: string;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user } = await authenticateRequest(req)

    const {
      message = '',
      conversation_id,
      history = [],
      document_context,
      context_summary,
      context_excerpts = [],
      document_hash,
      contract_text, // Consultant context
      risk_report,   // Consultant context
      image_attachments = [], // Array of storage paths
      attachments = [],      // Alternative naming from frontend
    } = await req.json()

    // Consolidate and normalize attachments — frontend may send objects OR plain strings
    const rawAttachments = [...image_attachments, ...(Array.isArray(attachments) ? attachments : [])]
    const allAttachments: string[] = rawAttachments
      .map((att: any) => {
        if (typeof att === 'string') return att
        return att?.storage_path || att?.url || att?.cloudinary_url || null
      })
      .filter(Boolean) as string[]

    console.log('[legal-chat] allAttachments after normalize:', allAttachments.length)

    if (!message && allAttachments.length === 0) return errorResponse('Thiếu nội dung tin nhắn hoặc hình ảnh', 400)

    const { allowed } = await checkRateLimit(user.id, 'legal-chat', 8, 60)
    if (!allowed) return errorResponse('Bạn đã gửi quá nhanh. Vui lòng thử lại sau ít phút.', 429)

    // @ts-ignore: Deno global
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-ignore: Deno global
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(url, key)

    // --- STEP 0: VISION PROCESSING ---
    let visionSummary = ''
    if (allAttachments.length > 0) {
      try {
        console.log(`[legal-chat] Processing ${allAttachments.length} images...`)
        const images = await Promise.all(
          allAttachments.map((path: string) => fetchImage(supabase, path))
        )

        visionSummary = await callVisionLLM(
          images,
          "Phân tích các hình ảnh này. Trích xuất văn bản (OCR) nếu có và tóm tắt nội dung chính liên quan đến pháp lý hoặc hợp đồng. Trả về kết quả ngắn gọn, súc tích bằng tiếng Việt."
        )
        console.log('[legal-chat] Vision Summary:', visionSummary.substring(0, 200))
      } catch (err) {
        console.error('[legal-chat] Vision processing failed:', (err as Error).message)
        // Continue without vision if it fails, but maybe log it
      }
    }

    // Combine vision context with message for intent evaluation
    const enrichedMessage = visionSummary
      ? `[Nội dung từ hình ảnh: ${visionSummary}]\n\nCâu hỏi của người dùng: ${message}`
      : message

    const compactDocumentContext = buildCompactDocumentContext(
      typeof context_summary === 'string' ? context_summary : undefined,
      Array.isArray(context_excerpts) ? context_excerpts : [],
      typeof document_context === 'string' ? document_context : undefined,
    )
    const { intent_eval } = await (async () => {
      // Fast pre-flight intent evaluation
      return { intent_eval: await evaluateIntent(message, history, typeof context_summary === 'string' ? context_summary : undefined) };
    })();

    const normalizedMessage = normalizeLegalQuery(message)
    const needsCitation = intent_eval.needs_citations || requiresLegalCitation(message)
    const isDrafting = intent_eval.is_drafting
    // Always use enrichedMessage (which contains vision extract) for the standalone query
    const standaloneQuery = visionSummary
      ? `${enrichedMessage}` // Already has vision context embedded
      : (intent_eval.suggested_standalone_query || await buildStandaloneQuery(history, enrichedMessage))

    // Only cache standalone, citation-free questions that are context-independent
    const canUseCache = !needsCitation && intent_eval.intent === 'general' && (isStandaloneQuestion(message) || history.length === 0)

    // --- STEP 1: EXACT CACHE CHECK (Fast Path) ---
    const answerCacheKey = canUseCache
      ? buildCacheKey('cache:legal_answer:legal-chat', normalizedMessage, document_hash || 'global')
      : null

    if (answerCacheKey) {
      const cachedPayload = await getCachedLegalAnswer<any>(answerCacheKey)
      if (cachedPayload) {
        // Log cache hit for debugging
        console.log('[legal-chat] Cache hit:', {
          key: answerCacheKey,
          answer: cachedPayload.answer?.substring(0, 100),
          abstained: cachedPayload.abstained,
          citations: cachedPayload.citations?.length
        })

        // Filter out failed responses from cache
        const isFailedResponse =
          cachedPayload.abstained ||
          cachedPayload.answer?.includes('Xin lỗi, tôi không thể tìm thấy câu trả lời phù hợp') ||
          (cachedPayload.citations?.length === 0 && cachedPayload.verification_status === 'unverified' && cachedPayload.evidence?.length === 0)

        if (isFailedResponse) {
          console.log('[legal-chat] Skipping failed cached response, reprocessing...')
        } else {
          return jsonResponse({ reply: cachedPayload.answer, ...cachedPayload, cached: true }, 200)
        }
      }
    }

    // --- STEP 2: SEMANTIC CACHE (Medium Path) ---
    const queryEmbeddingForCache = await embedText(standaloneQuery || message, undefined, 768)

    if (queryEmbeddingForCache.length > 0) {
      try {
        const semanticCached = await getSemanticCache(supabase, queryEmbeddingForCache, 0.05)
        if (semanticCached) {
          // Filter out failed responses from semantic cache
          const isFailedResponse =
            semanticCached.abstained ||
            semanticCached.answer?.includes('Xin lỗi, tôi không thể tìm thấy câu trả lời phù hợp') ||
            (semanticCached.citations?.length === 0 && semanticCached.verification_status === 'unverified' && semanticCached.evidence?.length === 0)

          if (!isFailedResponse) {
            return jsonResponse({
              reply: semanticCached.reply || semanticCached.answer,
              ...semanticCached,
              semantic_cached: true
            }, 200)
          }
        }
      } catch (e) {
        console.warn('Semantic cache check failed, continuing without cache:', (e as Error).message)
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
        // Fix function overloading by explicitly passing all parameters
        memories = await retrieveChatMemory(supabase, messageEmbedding, user.id, standaloneQuery, undefined, 0.4, 15)
      })
      .catch(e => {
        console.warn('Memory retrieval failed:', (e as Error).message)
        memories = []
      })

    const fetchExaPromise = (needsCitation || intent_eval.intent === 'citation_request')
      ? retrieveLegalEvidence(standaloneQuery, intent_eval.complexity === 'high' ? 12 : 8).catch(e => {
        console.warn('Exa retrieval failed:', (e as Error).message)
        return []
      })
      : Promise.resolve([])

    const fetchLocalLawPromise = (needsCitation || Boolean(document_hash) || isDrafting)
      ? embedText(hydeDoc, undefined, 768).then(emb =>
        supabase.rpc('match_document_chunks', {
          query_embedding: emb,
          match_threshold: 0.2, // Lowered to get more candidates for reranking
          match_count: intent_eval.complexity === 'high' ? 40 : 25,
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
        console.warn('Jina rerank in chat failed, using fallback scoring:', err)
        // Fallback: Simple keyword matching when JINA fails
        const queryKeywords = standaloneQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2)

        combinedEvidence = candidates
          .map(candidate => {
            const text = `${candidate.title} ${candidate.content}`.toLowerCase()
            const keywordMatches = queryKeywords.filter(kw => text.includes(kw)).length
            const score = keywordMatches / Math.max(queryKeywords.length, 1)
            return { ...candidate, score }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .filter(c => c.score > 0.1) // Minimum threshold for fallback
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
Ý định của người dùng được xác định là: ${intent_eval.intent} (${intent_eval.reasoning}).

Quy tắc ứng xử:
1. Luôn sử dụng tiếng Việt trang trọng, lịch sự.
2. TUYỆT ĐỐI KHÔNG từ chối yêu cầu soạn thảo văn bản. Hãy luôn cung cấp mẫu văn bản hoặc dự thảo tốt nhất có thể dựa trên thông tin người dùng cung cấp.
3. Nếu câu hỏi yêu cầu độ chính xác pháp lý (legal claim), chỉ được trả lời dựa trên các nguồn chứng cứ đã cung cấp.
4. Không được bịa điều luật, số điều, tên văn bản hoặc đường link.
5. Nếu chứng cứ chưa đủ, phải nói rõ là chưa đủ căn cứ để khẳng định.
6. BẮT BUỘC TRÍCH DẪN IN-LINE: Mỗi kết luận, điều khoản pháp lý lấy từ "CHỨNG CỨ PHÁP LÝ", bạn PHẢI ghim nguồn bằng cú pháp [X] ngay cuối câu (ví dụ: [1]).
7. Ngắn gọn, súc tích nhưng đầy đủ ý.
8. ${isDrafting ? 'Đặc biệt khi soạn thảo văn bản, hãy tuân thủ nghiêm ngặt các quy định về thể thức văn bản hành chính của Việt Nam.' : 'Ở cuối câu trả lời, hãy thêm một lời nhắc nhở ngắn gọn gọn gàng về việc tham vấn luật sư thực tế nếu cần thiết.'}`

    if (intent_eval.intent === 'drafting') {
      systemPrompt += `\n\nCHẾ ĐỘ SOẠN THẢO: Bạn đang thực hiện soạn thảo văn bản pháp lý. Hãy đảm bảo nội dung đầy đủ các phần: căn cứ pháp lý, nội dung chính, kiến nghị và các thông tin cần thiết. Nếu thiếu thông tin từ người dùng, hãy ghi chú các phần [Cần điền thông tin] một cách rõ ràng.`
    }

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

    // --- STREAMING SETUP ---
    const encoder = new TextEncoder();
    const send = (controller: ReadableStreamDefaultController, chunk: StreamChunk) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
    };

    // --- CASE 1: CACHE HIT (Streamed for consistency) ---
    if (answerCacheKey) {
      const cachedPayload = await getCachedLegalAnswer<any>(answerCacheKey)
      if (cachedPayload) {
        const isFailedResponse =
          cachedPayload.abstained ||
          cachedPayload.answer?.includes('Xin lỗi, tôi không thể tìm thấy câu trả lời phù hợp') ||
          (cachedPayload.citations?.length === 0 && cachedPayload.verification_status === 'unverified' && cachedPayload.evidence?.length === 0)

        if (!isFailedResponse) {
          return new Response(new ReadableStream({
            start(controller) {
              if (cachedPayload.evidence) send(controller, { type: 'evidence', payload: cachedPayload.evidence });
              send(controller, { type: 'chunk', content: cachedPayload.answer });
              send(controller, { type: 'done', payload: cachedPayload });
              controller.close();
            }
          }), { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
        }
      }
    }

    // --- CASE 2: ABSTAIN (Streamed) ---
    if (needsCitation && combinedEvidence.length === 0 && !hasRecentLegalEvidence(memories)) {
      const abstain = buildAbstainPayload(
        'Tôi chưa tìm thấy căn cứ pháp lý nào đủ tin cậy trong kho dữ liệu hoặc internet để giải đáp chính xác câu hỏi này. Vui lòng cung cấp thêm thông tin về văn bản luật cụ thể.',
        true,
      )
      return new Response(new ReadableStream({
        start(controller) {
          send(controller, { type: 'chunk', content: abstain.answer });
          send(controller, { type: 'done', payload: abstain });
          controller.close();
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
    }

    // --- CASE 3: NORMAL STREAMING ---
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          if (combinedEvidence.length > 0) {
            send(controller, { type: 'evidence', payload: combinedEvidence });
          }

          let fullResponseText = '';
          for await (const chunk of streamGemini(contents)) {
            fullResponseText += chunk;
            send(controller, { type: 'chunk', content: chunk });
          }

          const payload = buildLegalAnswerPayload(fullResponseText, combinedEvidence, needsCitation);
          send(controller, { type: 'done', payload });

          // Background operations (Audit, Cache, Memory)
          logTelemetry('legal-chat', 'completed', {
            has_document_context: Boolean(compactDocumentContext),
            evidence_count: combinedEvidence.length,
            cacheable: Boolean(answerCacheKey),
          }).catch(() => { });

          persistAnswerAudit({
            functionName: 'legal-chat',
            userId: user.id,
            question: message,
            payload,
            metadata: {
              standalone_query: standaloneQuery,
              has_document_context: Boolean(compactDocumentContext),
            },
          }).catch(() => { });

          if (answerCacheKey && !payload.abstained) {
            setCachedLegalAnswer(answerCacheKey, payload, 3600).catch(() => { });
          }

          if (queryEmbeddingForCache.length > 0 && !payload.abstained) {
            setSemanticCache(supabase, standaloneQuery || message, queryEmbeddingForCache, {
              reply: payload.answer,
              ...payload
            }).catch(() => { });
          }

          if (messageEmbedding.length > 0) {
            storeChatMemory(supabase, { user_id: user.id, role: 'user', content: message, embedding: messageEmbedding }).catch(() => { });
            embedText(fullResponseText.slice(0, 400), undefined, 768).then(emb =>
              storeChatMemory(supabase, { user_id: user.id, role: 'assistant', content: fullResponseText.slice(0, 400), embedding: emb })
            ).catch(() => { });
          }

          // Trigger Auto-Titling if this is a named conversation
          if (conversation_id) {
            // CRITICAL: Await titling to ensure it completes before function termination
            await autoGenerateConversationTitle(supabase, conversation_id, message, fullResponseText, history).catch((err) => {
              console.error('[Titling] Background task failed:', err);
            });
          }

          controller.close();
        } catch (err) {
          const errorMessage = (err as Error).message;
          console.error('[legal-chat] Streaming error:', errorMessage);

          // Provide user-friendly error messages
          let userFriendlyError = 'Có lỗi xảy ra khi xử lý tin nhắn. Vui lòng thử lại.';

          if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
            userFriendlyError = 'Hết quota API. Vui lòng thử lại sau vài phút hoặc liên hệ hỗ trợ.';
          } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
            userFriendlyError = 'Lỗi xác thực API. Vui lòng liên hệ hỗ trợ kỹ thuật.';
          } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            userFriendlyError = 'Kết nối quá thời gian. Vui lòng thử lại.';
          }

          send(controller, { type: 'error', error: userFriendlyError });
          controller.close();
        }
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (err) {
    console.error('Chat function error:', err)
    return errorResponse((err as Error).message, 500)
  }
}

serve(handler)

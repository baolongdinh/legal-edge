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
  simpleHash,
  storeChatMemory,
  storeEvidenceInMemory,
  jinaRerank,
  isVolatileLegalSource,
  shouldStoreInMemory,
  LegalSourceEvidence,
  callLLM,
  callVisionLLM,
  fetchImageFromStorage,
  IntentEvaluation,
  deduplicateLegalEvidence,
  deduplicateLegalEvidenceAdvanced,
  checkEvidenceExistsInRAG,
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

    // Strip markdown code blocks if present
    let cleanResult = result.trim();
    if (cleanResult.startsWith('```')) {
      cleanResult = cleanResult.replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
    }

    const parsed = JSON.parse(cleanResult);
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

    // FIX: Generate document_hash from document_context if not provided
    // This ensures document retrieval works when frontend uploads files
    let effectiveDocumentHash = document_hash
    if (!effectiveDocumentHash && document_context) {
      const docText = typeof document_context === 'string'
        ? document_context
        : JSON.stringify(document_context)
      effectiveDocumentHash = simpleHash(docText.slice(0, 1000)) // Hash first 1000 chars
      console.log('[legal-chat] Generated document_hash from context:', effectiveDocumentHash)
    }

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

    // FIX: Extract document text from document_context array
    // Frontend sends document_context as array of uploaded documents
    let documentText: string | undefined
    if (document_context) {
      if (typeof document_context === 'string') {
        documentText = document_context
        console.log('[Document Context] String type received, length:', documentText.length)
      } else if (Array.isArray(document_context)) {
        // Extract document_context field from each uploaded doc
        documentText = document_context
          .map((doc: any) => doc?.document_context || '')
          .filter(Boolean)
          .join('\n\n---\n\n')
        console.log('[Document Context] Array type received, docs count:', document_context.length, 'total text length:', documentText.length)
        console.log('[Document Context] First doc preview:', document_context[0]?.document_context?.substring(0, 200))
      }
    } else {
      console.log('[Document Context] No document_context received')
    }

    const compactDocumentContext = buildCompactDocumentContext(
      typeof context_summary === 'string' ? context_summary : undefined,
      Array.isArray(context_excerpts) ? context_excerpts : [],
      documentText,
    )

    console.log('[Document Context] compactDocumentContext length:', compactDocumentContext?.length)

    // --- T001: Heuristic Intent Evaluation for Simple Questions ---
    // Skip LLM call for simple standalone questions to save ~300ms
    const isSimpleQuestion = isStandaloneQuestion(message) && message.length < 100 && !document_context && !visionSummary
    let intent_eval: IntentEvaluation
    let standaloneQuery: string

    if (isSimpleQuestion) {
      // Use heuristics instead of LLM for simple questions
      intent_eval = {
        intent: 'general',
        needs_citations: false,
        complexity: 'low',
        is_drafting: false,
        suggested_standalone_query: message,
        reasoning: 'Fast heuristic path for simple standalone question'
      }
      standaloneQuery = message
      console.log('[Intent] Using heuristic path for simple question')
    } else {
      // --- T002: Parallel Intent + Standalone Query for Complex Questions ---
      // Run both LLM calls in parallel to save ~300ms
      const [evalResult, queryResult] = await Promise.all([
        evaluateIntent(message, history, typeof context_summary === 'string' ? context_summary : undefined),
        buildStandaloneQuery(history, enrichedMessage)
      ])
      intent_eval = evalResult
      standaloneQuery = visionSummary ? enrichedMessage : (intent_eval.suggested_standalone_query || queryResult)
      console.log('[Intent] Parallel intent + query completed')
    }

    const normalizedMessage = normalizeLegalQuery(message)
    const needsCitation = intent_eval.needs_citations || requiresLegalCitation(message)
    const isDrafting = intent_eval.is_drafting

    console.log(`[Intent] needs_citations: ${intent_eval.needs_citations}, requiresLegalCitation: ${requiresLegalCitation(message)}, needsCitation: ${needsCitation}, intent: ${intent_eval.intent}`)

    // Only cache standalone, citation-free questions that are context-independent
    const canUseCache = !needsCitation && intent_eval.intent === 'general' && (isStandaloneQuestion(message) || history.length === 0)

    // --- FIX: Include context in cache key to avoid wrong answers for same question in different contexts ---
    // Build context summary from last 2 messages (if any) to include in cache key
    const contextSummary = history.length > 0
      ? history.slice(-2).map((h: any) => h.content.slice(0, 50)).join('|')
      : 'no-context'

    // --- OPTIMIZATION 1: Parallel Cache Checks ---
    // Run exact cache and semantic cache in parallel to reduce latency
    const answerCacheKey = canUseCache
      ? buildCacheKey('cache:legal_answer:legal-chat', normalizedMessage, effectiveDocumentHash || 'global', contextSummary)
      : null

    const [exactCacheResult, queryEmbeddingForCache] = await Promise.all([
      answerCacheKey ? getCachedLegalAnswer<any>(answerCacheKey) : Promise.resolve(null),
      embedText(standaloneQuery || message, undefined, 768)
    ])

    // --- STEP 1: EXACT CACHE CHECK (Fast Path) ---
    if (exactCacheResult) {
      // Log cache hit for debugging
      console.log('[legal-chat] Exact cache hit:', {
        key: answerCacheKey,
        answer: exactCacheResult.answer?.substring(0, 100),
        abstained: exactCacheResult.abstained,
        citations: exactCacheResult.citations?.length
      })

      // Filter out failed responses from cache
      const isFailedResponse =
        exactCacheResult.abstained ||
        exactCacheResult.answer?.includes('Xin lỗi, tôi không thể tìm thấy câu trả lời phù hợp') ||
        (exactCacheResult.citations?.length === 0 && exactCacheResult.verification_status === 'unverified' && exactCacheResult.evidence?.length === 0)

      if (!isFailedResponse) {
        return jsonResponse({ reply: exactCacheResult.answer, ...exactCacheResult, cached: true }, 200)
      }
    }

    // --- STEP 2: SEMANTIC CACHE (Medium Path) ---
    // FIX: Include context in semantic cache to avoid wrong answers for same query in different contexts
    let cacheEmbedding: number[] = []
    if (queryEmbeddingForCache.length > 0) {
      try {
        // For standalone questions (no context), use query embedding only
        // For contextual questions, combine query + context embeddings
        cacheEmbedding = queryEmbeddingForCache
        if (history.length > 0 && !isStandaloneQuestion(message)) {
          // Embed context summary and combine with query embedding
          const contextEmbedding = await embedText(contextSummary, undefined, 768)
          // Simple average to combine embeddings
          cacheEmbedding = queryEmbeddingForCache.map((v, i) => (v + contextEmbedding[i]) / 2)
          console.log('[Semantic Cache] Using combined query+context embedding')
        }

        const semanticCached = await getSemanticCache(supabase, cacheEmbedding, 0.05)
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

    // --- OPTIMIZATION 2: Conditional HyDE ---
    // Only generate HyDE if local RAG is needed AND complexity is high
    // This saves ~500ms for simple queries
    const needsHyDE = (needsCitation || Boolean(effectiveDocumentHash) || isDrafting) && intent_eval.complexity === 'high'
    const hydeDoc = needsHyDE ? await generateHypotheticalDocument(standaloneQuery || message) : standaloneQuery || message

    let memories: Awaited<ReturnType<typeof retrieveChatMemory>> = []
    let messageEmbedding: number[] = []
    let exaEvidence: LegalSourceEvidence[] = []
    let localLawChunks: any[] = []

    const fetchMemoryPromise = queryEmbeddingForCache.length > 0
      ? retrieveChatMemory(supabase, queryEmbeddingForCache, user.id, standaloneQuery || message, undefined, 0.3, 5).catch(() => [])
      : Promise.resolve([])

    const fetchExaPromise = (needsCitation || isDrafting)
      ? retrieveLegalEvidence(standaloneQuery || message, intent_eval.complexity === 'high' ? 10 : 5).catch(e => {
          console.warn('Exa RAG failed:', e)
          return []
        })
      : Promise.resolve([])

    // FIX: Skip local RAG for uploaded documents
    // Use compactDocumentContext (full document content) instead
    // Reason: contract_chunks requires contract_id (UUID), but frontend only sends document_hash (string)
    // and document content is already extracted in compactDocumentContext
    const fetchLocalLawPromise = Promise.resolve([])

    const [, parallelExa, parallelLocalLaw] = await Promise.all([
      fetchMemoryPromise,
      fetchExaPromise,
      fetchLocalLawPromise
    ])

    exaEvidence = parallelExa as LegalSourceEvidence[]
    localLawChunks = parallelLocalLaw as any[]

    console.log(`[Retrieval] Exa: ${exaEvidence.length} items, Local RAG: ${localLawChunks.length} items, needsCitation: ${needsCitation}, intent: ${intent_eval.intent}`)

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

        // FIX: Lower threshold from 0.35 to 0.25 to ensure citations show
        combinedEvidence = rerankResults
          .filter(r => r.score >= 0.25)
          .map(r => candidates[r.index])
          .filter(Boolean)

        // If no evidence after rerank, use top 3 candidates anyway
        if (combinedEvidence.length === 0 && rerankResults.length > 0) {
          console.warn('[Rerank] No evidence above threshold, using top 3 candidates')
          combinedEvidence = rerankResults
            .slice(0, 3)
            .map(r => candidates[r.index])
            .filter(Boolean)
        }
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
          .filter(c => c.score > 0.05) // Lower threshold for fallback
      }
    }

    // Only abstain if: needs citation AND no evidence AND no memory AND question is very specific
    // Allow general legal advice even without citations
    const isSpecificLegalQuestion = requiresLegalCitation(message) && message.length > 20
    if (isSpecificLegalQuestion && combinedEvidence.length === 0 && !hasRecentLegalEvidence(memories)) {
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

          // Fallback: If streaming returns empty, provide a generic response
          if (!fullResponseText || fullResponseText.trim().length === 0) {
            fullResponseText = 'Xin lỗi, tôi không thể tạo câu trả lời lúc này. Vui lòng thử lại hoặc cung cấp thêm thông tin chi tiết.';
            send(controller, { type: 'chunk', content: fullResponseText });
          }

          const payload = buildLegalAnswerPayload(fullResponseText, combinedEvidence, needsCitation);
          send(controller, { type: 'done', payload });

          // Background operations (Audit, Cache, Memory)
          logTelemetry('legal-chat', 'completed', {
            has_document_context: Boolean(compactDocumentContext),
            evidence_count: combinedEvidence.length,
            cacheable: Boolean(answerCacheKey),
          });

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

          if (cacheEmbedding.length > 0 && !payload.abstained) {
            setSemanticCache(supabase, standaloneQuery || message, cacheEmbedding, {
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

          // --- T015: Store legal evidence in memory with RAG optimization (Background) ---
          // Run deduplication, volatility filter, and storage decision in background
          // This does NOT affect response time
          if (combinedEvidence.length > 0) {
            (async () => {
              try {
                console.log(`[Background RAG] Starting optimization for ${combinedEvidence.length} evidence items`)

                // T013: Deduplicate evidence
                const beforeDedup = combinedEvidence.length
                let deduplicated = combinedEvidence
                try {
                  deduplicated = await deduplicateLegalEvidenceAdvanced(combinedEvidence, supabase)
                } catch (err) {
                  console.warn('[Background RAG] Advanced deduplication failed, using simple:', err)
                  deduplicated = deduplicateLegalEvidence(combinedEvidence)
                }
                console.log(`[Background RAG] Dedup: ${deduplicated.length}/${beforeDedup} unique items`)

                // T014: Filter volatile sources
                const beforeFilter = deduplicated.length
                deduplicated = deduplicated.filter(e => !isVolatileLegalSource(e))
                console.log(`[Background RAG] Volatility: ${deduplicated.length}/${beforeFilter} after filtering`)

                // T012: Smart storage decision
                const storageDecision = await shouldStoreInMemory(deduplicated, supabase)
                if (storageDecision.shouldStore) {
                  console.log(`[Background RAG] Storing ${deduplicated.length} evidence items: ${storageDecision.reason}`)
                  await storeEvidenceInMemory(supabase, user.id, deduplicated)
                } else {
                  console.log(`[Background RAG] Skipping storage: ${storageDecision.reason}`)
                }
              } catch (err) {
                console.warn('[Background RAG] Optimization failed:', err)
              }
            })().catch(() => {})
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

          // Provide user-friendly error messages (generic, not detailed)
          let userFriendlyError = 'Hệ thống hiện không thể trả lời ngay lúc này. Vui lòng thử lại sau ít phút.';

          // Check if error indicates all keys were exhausted
          const allKeysExhausted = errorMessage.includes('All') && errorMessage.includes('keys tried');

          if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
            if (allKeysExhausted) {
              userFriendlyError = 'Hệ thống hiện không thể trả lời ngay lúc này. Vui lòng thử lại sau ít phút.';
            } else {
              // Don't show retry message to user, just generic error
              userFriendlyError = 'Hệ thống hiện không thể trả lời ngay lúc này. Vui lòng thử lại sau ít phút.';
            }
          } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
            if (allKeysExhausted) {
              userFriendlyError = 'Hệ thống hiện không thể trả lời ngay lúc này. Vui lòng thử lại sau ít phút.';
            } else {
              userFriendlyError = 'Hệ thống hiện không thể trả lời ngay lúc này. Vui lòng thử lại sau ít phút.';
            }
          } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            userFriendlyError = 'Hệ thống hiện không thể trả lời ngay lúc này. Vui lòng thử lại sau ít phút.';
          }

          // Always send error as a chunk so user sees something, then send error type
          send(controller, { type: 'chunk', content: userFriendlyError });
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

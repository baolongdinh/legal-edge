import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
    buildAbstainPayload,
    buildLegalAnswerPayload,
    checkRateLimit,
    corsHeaders,
    embedText,
    errorResponse,
    fetchWithRetry,
    getCachedLegalAnswer,
    jsonResponse,
    persistAnswerAudit,
    persistVerifiedEvidence,
    requiresLegalCitation,
    retrieveLegalEvidence,
    setCachedLegalAnswer,
    simpleHash,
} from '../shared/types.ts'

export const handler = async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return errorResponse('Missing Authorization', 401)

        const supabaseAuth = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
        if (authError || !user) return errorResponse('Unauthorized', 401)

        const { contract_id, query } = await req.json()
        if (!contract_id || !query) return errorResponse('Missing contract_id or query', 400)

        const { allowed } = await checkRateLimit(user.id, 'contract-qa', 5, 60)
        if (!allowed) {
            return errorResponse('Bạn đã hỏi quá nhanh. Vui lòng chờ 1 phút trước khi tiếp tục.', 429)
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const queryEmbeddingRes = await fetchWithRetry(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `Rút gọn câu hỏi sau thành truy vấn semantic search ngắn gọn, giữ nguyên ý pháp lý cốt lõi:\n${query}` }] }]
                })
            },
            { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
        )
        const queryRewriteData = await queryEmbeddingRes.json()
        const rewrittenQuery = queryRewriteData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || query

        const queryEmbedding = await embedText(rewrittenQuery)

        const { data: chunks, error: searchError } = await supabase.rpc('hybrid_search_contracts', {
            p_contract_id: contract_id,
            p_query: rewrittenQuery,
            p_query_embedding: queryEmbedding,
            p_match_count: 5
        })

        if (searchError) throw searchError

        const internalContext = (chunks && chunks.length > 0)
            ? chunks.map((c: any) => c.content).join('\n\n---\n\n')
            : 'Không có thông tin nội bộ đủ mạnh trong hợp đồng.'

        const needsCitation = requiresLegalCitation(query)
        const externalEvidence = needsCitation ? await retrieveLegalEvidence(query, 4) : []
        if (needsCitation && externalEvidence.length > 0) {
            await persistVerifiedEvidence(query, externalEvidence)
        }
        const answerCacheKey = needsCitation
            ? `cache:legal_answer:contract-qa:${contract_id}:${simpleHash(query)}`
            : null

        if (answerCacheKey) {
            const cachedPayload = await getCachedLegalAnswer<any>(answerCacheKey)
            if (cachedPayload) {
                return jsonResponse({
                    answer: cachedPayload.answer,
                    sources: chunks || [],
                    ...cachedPayload,
                    cached: true,
                })
            }
        }

        if (needsCitation && externalEvidence.length === 0) {
            const abstain = buildAbstainPayload(
                'Tôi chưa có đủ căn cứ pháp lý đáng tin cậy để trả lời chắc chắn câu hỏi này. Bạn nên nêu rõ điều luật, loại hợp đồng hoặc bối cảnh tranh chấp để tôi tra cứu chính xác hơn.',
                true,
            )
            return jsonResponse({
                answer: abstain.answer,
                sources: chunks || [],
                ...abstain,
            })
        }

        const evidenceText = externalEvidence
            .map((item, index) => `[#${index + 1}] ${item.title}\nURL: ${item.url}\nNguồn: ${item.source_domain}\nTrích đoạn: ${item.content.slice(0, 900)}`)
            .join('\n\n---\n\n')

        const generationRes = await fetchWithRetry(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Bạn là Luật sư AI tư vấn Hợp Đồng của LegalShield Việt Nam.

Quy tắc:
1. Ưu tiên nội dung hợp đồng để mô tả sự kiện/thỏa thuận cụ thể.
2. Nếu có kết luận pháp lý, chỉ được dựa trên CHỨNG CỨ PHÁP LÝ đã cung cấp.
3. Không được bịa điều luật, link, hoặc diễn giải vượt quá chứng cứ.
4. Nếu chứng cứ chưa đủ, phải nói rõ là chưa đủ căn cứ.
5. Mỗi kết luận pháp lý quan trọng phải bám sát chứng cứ pháp lý đã cung cấp.
6. Trả lời tiếng Việt ngắn gọn, thực dụng.

[NGỮ CẢNH HỢP ĐỒNG]
${internalContext}

[CHỨNG CỨ PHÁP LÝ]
${evidenceText || 'Không có chứng cứ pháp lý bên ngoài.'}

[CÂU HỎI]
${query}`
                        }]
                    }]
                })
            },
            { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
        )

        const aiData = await generationRes.json()
        const rawAnswer = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Tôi chưa thể trả lời câu hỏi này.'
        const payload = buildLegalAnswerPayload(rawAnswer, externalEvidence, needsCitation)
        await persistAnswerAudit({
            functionName: 'contract-qa',
            userId: user.id,
            question: query,
            payload,
            metadata: {
                contract_id,
                source_chunk_count: chunks?.length ?? 0,
            },
        })
        if (answerCacheKey && !payload.abstained) {
            await setCachedLegalAnswer(answerCacheKey, payload, 60 * 60)
        }

        return jsonResponse({
            answer: payload.answer,
            sources: chunks || [],
            ...payload,
        })
    } catch (error) {
        return errorResponse((error as Error).message, 400)
    }
}

serve(handler)

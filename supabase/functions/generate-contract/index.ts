// Edge Function: POST /functions/v1/generate-contract
// RAG pipeline: embed prompt → similarity search on document_chunks → stream via Gemini Pro

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
    buildLegalAnswerPayload,
    corsHeaders,
    embedText,
    errorResponse,
    fetchWithRetry,
    jsonResponse,
    requiresLegalCitation,
    retrieveLegalEvidence,
    roundRobinKey,
} from '../shared/types.ts'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent'
const GEMINI_JSON_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { prompt, template_id, mode = 'draft', current_draft, selection_context, parameters, response_mode = 'stream' } = await req.json()
        if (!prompt) return errorResponse('Missing prompt', 400)

        const geminiKey = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const retrievalQuery = [
            prompt,
            selection_context ? `Đoạn cần xử lý:\n${selection_context}` : '',
            current_draft ? `Bối cảnh bản thảo:\n${current_draft.slice(0, 4000)}` : '',
        ].filter(Boolean).join('\n\n')

        // 1. Embed the user prompt
        const queryEmbedding = await embedText(retrievalQuery, geminiKey)

        // 2. Vector similarity search (top 5 law chunks)
        const { data: chunks, error } = await supabase.rpc('match_document_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.75,
            match_count: 5,
        })
        if (error) throw new Error(`Vector search: ${error.message}`)

        // 3. Build context from matched chunks
        const legalContext = (chunks ?? [])
            .map((c: { law_article: string; content: string }) => `[${c.law_article}]\n${c.content}`)
            .join('\n\n---\n\n')

        // 4. Fetch template if specified
        let templateContent = ''
        if (template_id) {
            const { data: t } = await supabase.from('templates').select('content_md').eq('id', template_id).single()
            templateContent = t?.content_md ?? ''
        }

        const systemPrompt = `Bạn là trợ lý pháp lý Việt Nam cho workspace soạn thảo hợp đồng của LegalShield.

Nhiệm vụ:
- mode=draft: tạo bản thảo hoặc khung hợp đồng hoàn chỉnh dựa trên yêu cầu, mẫu, và cơ sở pháp lý.
- mode=clause_insert: tạo một điều khoản hoặc block nội dung để CHÈN vào bản thảo hiện có.
- mode=rewrite: viết lại chính đoạn được chọn, không viết lại toàn bộ hợp đồng.

Quy tắc:
1. Chỉ dựa trên mẫu hợp đồng, ngữ cảnh bản thảo, và cơ sở pháp lý đã cho.
2. Nếu đưa ra kết luận pháp lý cụ thể, phải bám sát điều luật được cung cấp.
3. Không tạo tiêu đề/thành phần dư thừa khi mode=clause_insert hoặc mode=rewrite.
4. Trả lời bằng tiếng Việt pháp lý rõ ràng, sẵn sàng để chèn vào bản thảo.
5. Không thêm giải thích ngoài nội dung được yêu cầu.`

        const instructionText = `Chế độ: ${mode}
Yêu cầu người dùng: ${prompt}

Tham số cấu trúc: ${parameters ? JSON.stringify(parameters, null, 2) : 'Không có'}

Mẫu hợp đồng:
${templateContent || 'Không có'}

Bản thảo hiện tại:
${current_draft || 'Chưa có'}

Đoạn đang chọn:
${selection_context || 'Không có'}

Cơ sở pháp lý:
${legalContext || 'Không có kết quả truy xuất phù hợp'}`

        const body = {
            contents: [{
                role: 'user',
                parts: [{
                    text: `${systemPrompt}\n\n${instructionText}`
                }]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }

        if (response_mode === 'json') {
            const generationRes = await fetchWithRetry(
                GEMINI_JSON_URL,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
                { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
            )

            const generationData = await generationRes.json()
            const content = generationData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
            if (!content) throw new Error('Gemini returned empty content')

            const evidenceQuery = [
                prompt,
                mode,
                selection_context || '',
                templateContent.slice(0, 800),
            ].filter(Boolean).join('\n')

            const evidence = await retrieveLegalEvidence(evidenceQuery, 4)
            const requiresCitation = requiresLegalCitation(`${prompt}\n${content}`)
            const payload = buildLegalAnswerPayload(content, evidence, requiresCitation)

            return jsonResponse({
                content: payload.answer,
                citations: payload.citations,
                evidence: payload.evidence,
                verification_status: payload.verification_status,
                verification_summary: payload.verification_summary,
                claim_audit: payload.claim_audit ?? [],
                abstained: payload.abstained,
            })
        }

        const geminiRes = await fetch(`${GEMINI_URL}?key=${geminiKey}&alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })

        if (!geminiRes.ok) throw new Error(`Gemini error: ${await geminiRes.text()}`)

        // Stream response back to client
        return new Response(geminiRes.body, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
        })
    } catch (err) {
        return errorResponse((err as Error).message)
    }
})

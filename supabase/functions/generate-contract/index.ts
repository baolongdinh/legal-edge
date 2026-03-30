// Edge Function: POST /functions/v1/generate-contract
// RAG pipeline: embed prompt → similarity search on document_chunks → stream via Gemini Pro

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, embedText, errorResponse, jsonResponse, roundRobinKey } from '../shared/types.ts'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:streamGenerateContent'

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { prompt, template_id, user_id } = await req.json()
        if (!prompt) return errorResponse('Missing prompt', 400)

        const geminiKey = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // 1. Embed the user prompt
        const queryEmbedding = await embedText(prompt, geminiKey)

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

        // 5. Stream Gemini response
        const systemPrompt = `Bạn là trợ lý pháp lý Việt Nam. Soạn thảo hợp đồng chuyên nghiệp dựa trên:
- Mẫu hợp đồng (nếu có)
- Yêu cầu của người dùng
- Cơ sở pháp lý được cung cấp

Luôn trích dẫn điều luật cụ thể. Viết bằng tiếng Việt pháp lý chuẩn.`

        const body = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{
                role: 'user',
                parts: [{
                    text: `Cơ sở pháp lý:\n${legalContext}\n\nMẫu hợp đồng:\n${templateContent}\n\nYêu cầu:\n${prompt}`
                }]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
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

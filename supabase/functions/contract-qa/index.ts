import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../shared/headers.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEYS')?.split(',')[0]

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { contract_id, query } = await req.json()
        if (!contract_id || !query) throw new Error('Missing contract_id or query')

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Get embedding for the query
        const embResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: { parts: [{ text: query }] },
                    task_type: 'RETRIEVAL_QUERY',
                }),
            }
        )
        const embData = await embResp.json()
        const queryEmbedding = embData.embedding.values

        // 2. Hybrid Search in DB
        const { data: chunks, error: searchError } = await supabase.rpc('hybrid_search_contracts', {
            p_contract_id: contract_id,
            p_query: query,
            p_query_embedding: queryEmbedding,
            p_match_count: 5
        })

        if (searchError) throw searchError
        if (!chunks || chunks.length === 0) {
            return new Response(JSON.stringify({ answer: "Không tìm thấy thông tin liên quan trong hợp đồng." }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 3. RAG: Call Gemini to answer based on chunks
        const context = chunks.map((c: any) => c.content).join('\n\n---\n\n')
        const aiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Bạn là trợ lý pháp lý chuyên nghiệp. Dựa trên các đoạn trích dẫn sau đây từ một hợp đồng, hãy trả lời câu hỏi của người dùng một cách chính xác và ngắn gọn nhất có thể. Nếu thông tin không có trong trích dẫn, hãy nói "Tôi không tìm thấy thông tin này trong hợp đồng".

TRÍCH DẪN HỢP ĐỒNG:
${context}

CÂU HỎI: ${query}

TRẢ LỜI (Bằng tiếng Việt):`
                        }]
                    }]
                }),
            }
        )
        const aiData = await aiResp.json()
        const answer = aiData.candidates[0].content.parts[0].text

        return new Response(JSON.stringify({ answer, sources: chunks }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})

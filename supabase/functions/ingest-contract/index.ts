// Edge Function: POST /functions/v1/ingest-contract
// Processes contract text, generates embeddings, and stores them for RAG
// Security: Manual JWT verification via Supabase Auth API

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, errorResponse, jsonResponse, roundRobinKey, embedText } from '../shared/types.ts'

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        // 1. Manual JWT Verification
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return errorResponse('Yêu cầu không có quyền truy cập (Missing Auth)', 401)

        const token = authHeader.replace('Bearer ', '')
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) return errorResponse('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401)

        // 2. Parse Body
        const { contract_id, text } = await req.json()
        if (!contract_id || !text) return errorResponse('Missing contract_id or text', 400)

        const geminiKey = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')

        // 3. Chunking & Embedding
        const chunks = text.split(/\n\n+/).filter((c: string) => c.trim().length > 50)

        // Parallel embedding for better performance
        const results = await Promise.all(chunks.map(async (chunk) => {
            try {
                const embedding = await embedText(chunk, geminiKey)
                return {
                    contract_id,
                    content: chunk,
                    embedding,
                    metadata: { author_id: user.id }
                }
            } catch (e) {
                console.error('Embedding failed for chunk:', e)
                return null
            }
        }))

        const validResults = results.filter(r => r !== null)

        if (validResults.length > 0) {
            const { error: insertError } = await supabaseAdmin.from('contract_chunks').insert(validResults)
            if (insertError) throw insertError
        }

        return jsonResponse({ success: true, count: validResults.length }, 200)

    } catch (error) {
        console.error('Ingestion error:', error)
        return errorResponse((error as Error).message)
    }
})

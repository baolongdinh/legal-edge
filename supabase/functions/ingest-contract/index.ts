import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../shared/headers.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEYS')?.split(',')[0]

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { contract_id, text } = await req.json()
        if (!contract_id || !text) throw new Error('Missing contract_id or text')

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Simple chunking by paragraph/newline
        const chunks = text.split(/\n\n+/).filter((c: string) => c.trim().length > 50)

        // For each chunk, get embedding
        for (const chunk of chunks) {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: { parts: [{ text: chunk }] },
                        task_type: 'RETRIEVAL_DOCUMENT',
                    }),
                }
            )

            const resData = await response.json()
            const embedding = resData.embedding.values

            await supabase.from('contract_chunks').insert({
                contract_id,
                content: chunk,
                embedding,
            })
        }

        return new Response(JSON.stringify({ success: true, count: chunks.length }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})

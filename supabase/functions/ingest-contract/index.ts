// Edge Function: POST /functions/v1/ingest-contract
// Processes contract text, generates embeddings, and stores them for RAG
// Security: Manual JWT verification via Supabase Auth API

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
    authenticateRequest,
    corsHeaders,
    embedText,
    errorResponse,
    jsonResponse,
    logTelemetry,
    mapWithConcurrency,
} from '../shared/types.ts'

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { user } = await authenticateRequest(req)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. Parse Body
        const { contract_id, text } = await req.json()
        if (!contract_id || !text) return errorResponse('Missing contract_id or text', 400)

        const { count: existingChunkCount } = await supabaseAdmin
            .from('contract_chunks')
            .select('id', { count: 'exact', head: true })
            .eq('contract_id', contract_id)

        if ((existingChunkCount ?? 0) > 0) {
            return jsonResponse({
                job_id: contract_id,
                status: 'already_indexed',
                processed_chunks: existingChunkCount,
                queued_chunks: existingChunkCount,
                failed_chunks: 0,
            }, 200)
        }

        // 3. Chunking & Embedding
        const chunks = text
            .split(/\n\n+/)
            .map((chunk: string) => chunk.trim())
            .filter((chunk: string) => chunk.length > 80)
            .slice(0, 80)

        await supabaseAdmin
            .from('contracts')
            .update({ status: 'processing_ingest' })
            .eq('id', contract_id)

        const concurrency = Number(Deno.env.get('INGEST_CONCURRENCY') ?? '3')
        const results = await mapWithConcurrency(chunks, concurrency, async (chunk) => {
            try {
                const embedding = await embedText(chunk, '', 512)
                return {
                    contract_id,
                    content: chunk,
                    embedding,
                    metadata: { author_id: user.id }
                }
            } catch (e) {
                console.error('Embedding failed for chunk:', (e as Error).message)
                return null
            }
        })

        const validResults = results.filter(r => r !== null)
        const failedChunks = chunks.length - validResults.length

        if (validResults.length > 0) {
            for (let i = 0; i < validResults.length; i += 20) {
                const { error: insertError } = await supabaseAdmin
                    .from('contract_chunks')
                    .insert(validResults.slice(i, i + 20))
                if (insertError) throw insertError
            }
        }

        await supabaseAdmin
            .from('contracts')
            .update({
                status: 'pending_audit',
                analysis_summary: `Indexed ${validResults.length}/${chunks.length} chunks`,
            })
            .eq('id', contract_id)

        logTelemetry('ingest-contract', 'completed', {
            contract_id,
            queued_chunks: chunks.length,
            processed_chunks: validResults.length,
            failed_chunks: failedChunks,
            concurrency,
        })

        return jsonResponse({
            job_id: contract_id,
            status: failedChunks > 0 ? 'completed_with_errors' : 'completed',
            processed_chunks: validResults.length,
            queued_chunks: chunks.length,
            failed_chunks: failedChunks,
        }, 200)

    } catch (error) {
        console.error('Ingestion error:', error)
        const message = (error as Error).message
        const status = message === 'Missing Authorization' || message === 'Invalid Authorization header' || message === 'Unauthorized'
            ? 401
            : 500
        return errorResponse(message, status)
    }
})

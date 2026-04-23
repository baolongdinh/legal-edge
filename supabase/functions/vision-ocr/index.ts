// Edge Function: POST /functions/v1/vision-ocr
// Extracts text from contract images using Gemini 2.5 Flash Vision

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
    authenticateRequest,
    corsHeaders,
    errorResponse,
    jsonResponse,
    logTelemetry,
    roundRobinKey,
    fetchImage,
    getSupabaseAdminClient
} from '../shared/types.ts'

/**
 * Robust JSON cleaner to strip markdown backticks and whitespace.
 */
function cleanTextResponse(text: string): string {
    return text
        .replace(/^```[a-z]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim()
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { user } = await authenticateRequest(req)
        const body = await req.json()
        const attachments = body.attachments || body.image_urls

        if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
            return errorResponse('Missing attachments (images)', 400)
        }

        console.log(`[Vision OCR] Processing ${attachments.length} attachments for user ${user.id}`)

        const geminiKey = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
        const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`

        const supabase = getSupabaseAdminClient()
        const processedParts = await Promise.all([
            { text: "Trích xuất toàn bộ nội dung văn bản từ các hình ảnh hợp đồng sau đây. Giữ nguyên cấu trúc và thứ tự." },
            ...attachments.map(async (url) => {
                const { data, mimeType } = await fetchImage(supabase, url)
                return {
                    inline_data: {
                        mime_type: mimeType,
                        data: data
                    }
                }
            })
        ])

        const finalRes = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: processedParts }],
                generationConfig: { temperature: 0, maxOutputTokens: 8192 }
            })
        })

        if (!finalRes.ok) {
            const errorText = await finalRes.text()
            throw new Error(`Gemini API error: ${finalRes.status} - ${errorText}`)
        }

        const data = await finalRes.json()
        const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

        logTelemetry('vision-ocr', 'completed', {
            user_id: user.id,
            image_count: attachments.length,
            text_length: extractedText.length
        })

        return jsonResponse({ text: cleanTextResponse(extractedText) })

    } catch (err) {
        console.error('[Vision OCR] Error:', err)
        return errorResponse((err as Error).message, 500)
    }
})

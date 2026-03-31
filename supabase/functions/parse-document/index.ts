// Edge Function: POST /functions/v1/parse-document
// Accepts a binary PDF/DOCX upload via multipart form data.
// Supports two modes:
//   - mode=ephemeral (default for ChatAI): Extract text in-memory, skip Storage upload entirely → zero storage cost
//   - mode=persist: Upload to Storage + save to DB → used for deep analysis and RAG ingestion

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { encode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, errorResponse, fetchWithRetry, jsonResponse } from '../shared/types.ts'

function parseError(message: string, code: string, stage: string, status = 400) {
    return jsonResponse({ error: message, code, stage }, status)
}

export const handler = async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return parseError('Missing Authorization', 'AUTH_REQUIRED', 'auth', 401)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') || 'http://localhost:54321',
            Deno.env.get('SUPABASE_ANON_KEY') || 'anon',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return parseError('Unauthorized', 'AUTH_REQUIRED', 'auth', 401)

        // Parse multipart form
        const formData = await req.formData()
        const file = formData.get('file') as File | null
        if (!file) return parseError('Missing file in form data', 'MISSING_FILE', 'parse_form', 400)

        // mode=ephemeral (default): in-memory only, no storage cost
        // mode=persist: upload to storage + save to DB
        const mode = (formData.get('mode') as string) || 'ephemeral'

        const fileBuffer = await file.arrayBuffer()
        const mimeType = file.type || 'application/pdf'
        const filename = file.name

        // --- Helper: Extract text with Gemini Multimodal (in-memory, no Storage needed) ---
        const extractWithGemini = async (buffer: ArrayBuffer, mime: string) => {
            const base64File = encode(new Uint8Array(buffer))
            const body = {
                contents: [{
                    parts: [
                        { text: "Hãy trích xuất toàn bộ văn bản từ tài liệu này dưới định dạng Markdown. Giữ nguyên cấu trúc bảng biểu nếu có thể. Chỉ trả về nội dung." },
                        { inlineData: { mimeType: mime, data: base64File } }
                    ]
                }]
            }

            const res = await fetchWithRetry(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                },
                { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
            )

            const data = await res.json()
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (!text) throw new Error('Gemini returned empty content')
            return text
        }

        // --- Helper: Extract PDF via Jina AI Reader (requires signed URL from Storage) ---
        const extractWithJina = async (storagePath: string) => {
            const { data: signed } = await supabase.storage.from('user-contracts').createSignedUrl(storagePath, 60)
            if (!signed?.signedUrl) throw new Error('Could not generate signed URL')

            const res = await fetchWithRetry(
                `https://r.jina.ai/${signed.signedUrl}`,
                { headers: { 'Accept': 'application/json' } },
                { listEnvVar: 'JINA_API_KEYS', fallbackEnvVar: 'JINA_API_KEY' }
            )

            const jinaData = await res.json()
            return jinaData?.data?.content || jinaData?.data?.text || ''
        }

        // --- Extract text ---
        let textContent = ''
        let storagePath: string | null = null

        // Complex documents (PDF, Word, etc.) benefit significantly from Jina AI Reader
        const isComplexDoc = mimeType === 'application/pdf' ||
            mimeType.includes('officedocument') ||
            mimeType.includes('msword')

        // Only persist mode uploads to Storage.
        if (mode === 'persist') {
            storagePath = `${user.id}/${Date.now()}-${filename}`
            const { error: uploadError } = await supabase.storage
                .from('user-contracts')
                .upload(storagePath, fileBuffer, { contentType: mimeType })
            if (uploadError) {
                return parseError(`Storage upload: ${uploadError.message}`, 'STORAGE_UPLOAD_FAILED', 'storage_upload', 400)
            }
        }

        if (mimeType === 'text/plain') {
            // Ultra-fast: decode directly, no AI needed
            textContent = new TextDecoder().decode(fileBuffer)
        } else if (mimeType === 'application/pdf' && mode === 'persist' && storagePath) {
            // Jina AI for high-fidelity Markdown extraction (uses signed URL)
            try {
                textContent = await extractWithJina(storagePath)
            } catch (e) {
                console.warn('Jina failed, falling back to Gemini:', e)
                textContent = await extractWithGemini(fileBuffer, mimeType)
            }
        } else if (isComplexDoc) {
            try {
                textContent = await extractWithGemini(fileBuffer, mimeType)
            } catch (e) {
                console.error('Complex document extraction failed:', e)
                return parseError('Không thể trích xuất tài liệu ở chế độ tạm thời.', 'EXTRACTION_FAILED', 'extract_complex', 400)
            }
        } else if (mimeType.startsWith('image/')) {
            // Images: Gemini multimodal
            try {
                textContent = await extractWithGemini(fileBuffer, mimeType)
            } catch (e) {
                console.error('Image extraction failed:', e)
                return parseError('Không thể đọc hình ảnh đính kèm.', 'EXTRACTION_FAILED', 'extract_image', 400)
            }
        } else {
            // Fallback for unknown types
            try {
                textContent = await extractWithGemini(fileBuffer, mimeType)
            } catch (e) {
                console.error('Generic extraction failed:', e)
                return parseError('Định dạng tài liệu chưa được hỗ trợ ổn định.', 'UNSUPPORTED_FILE_TYPE', 'extract_generic', 400)
            }
        }

        // --- Ephemeral cleanup ---
        if (mode === 'ephemeral' && storagePath) {
            console.log(`[Cleaner] Deleting ephemeral file: ${storagePath}`)
            await supabase.storage.from('user-contracts').remove([storagePath])
        }

        // --- Persist mode: save to DB ---
        if (mode === 'persist' && storagePath) {
            const { data: doc, error: dbError } = await supabase
                .from('documents')
                .insert({
                    user_id: user.id,
                    filename,
                    storage_path: storagePath,
                    mime_type: mimeType,
                    text_content: textContent
                })
                .select('id')
                .single()

            if (dbError) throw new Error(`DB insert: ${dbError.message}`)

            return jsonResponse({
                document_id: doc.id,
                text_content: textContent,
                metadata: { filename, mime_type: mimeType, size_bytes: fileBuffer.byteLength, mode: 'persist' },
            })
        }

        // --- Ephemeral mode: return text only, no Storage/DB cost ---
        return jsonResponse({
            text_content: textContent,
            metadata: { filename, mime_type: mimeType, size_bytes: fileBuffer.byteLength, mode: 'ephemeral' },
        })
    } catch (err) {
        console.error('Fatal document parse error:', err)
        return parseError((err as Error).message, 'UNKNOWN', 'fatal', 500)
    }
}

serve(handler)

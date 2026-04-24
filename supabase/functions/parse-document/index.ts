// Edge Function: POST /functions/v1/parse-document
// Accepts a binary PDF/DOCX upload via multipart form data.
// Supports two modes:
//   - mode=ephemeral (default for ChatAI): Extract text in-memory, skip remote file persistence
//   - mode=persist: Upload to Cloudinary and save file URL to DB

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { encode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { uploadToCloudinary } from '../shared/cloudinary.ts'
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

        // mode=ephemeral (default): in-memory only, no remote file persistence
        // mode=persist: upload to Cloudinary + save URL to DB
        const mode = (formData.get('mode') as string) || 'ephemeral'

        const fileBuffer = await file.arrayBuffer()
        const mimeType = file.type || 'application/pdf'
        const filename = file.name

        // --- Helper: Extract text with Gemini Multimodal (in-memory, no remote file needed) ---
        const extractWithGemini = async (buffer: ArrayBuffer, mime: string) => {
            console.log(`[extractWithGemini] Starting extraction: mime=${mime}, size=${buffer.byteLength} bytes`)
            const base64File = encode(new Uint8Array(buffer))
            console.log(`[extractWithGemini] Encoded to base64, length=${base64File.length}`)

            const body = {
                contents: [{
                    parts: [
                        { text: "Hãy trích xuất toàn bộ văn bản từ tài liệu này dưới định dạng Markdown. Giữ nguyên cấu trúc bảng biểu nếu có thể. Chỉ trả về nội dung." },
                        { inlineData: { mimeType: mime, data: base64File } }
                    ]
                }]
            }

            const jsonBody = JSON.stringify(body)
            console.log(`[extractWithGemini] JSON payload size: ${jsonBody.length} chars (~${Math.round(jsonBody.length / 1024)}KB)`)
            console.log(`[extractWithGemini] Calling Gemini API...`)
            const res = await fetchWithRetry(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                },
                { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
            )

            console.log(`[extractWithGemini] Response status: ${res.status}`)
            const data = await res.json()

            // Log full error details if any
            if (data.error) {
                console.error('[extractWithGemini] Gemini API error:', JSON.stringify(data.error))
                throw new Error(`Gemini API error: ${data.error.message || JSON.stringify(data.error)}`)
            }

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            console.log(`[extractWithGemini] Extracted text length: ${text?.length || 0}`)
            if (!text) {
                console.error('[extractWithGemini] Gemini returned empty content. Full response:', JSON.stringify(data))
                throw new Error('Gemini returned empty content')
            }
            return text
        }

        // --- Helper: Extract PDF via Jina AI Reader using a remote URL ---
        const extractWithJina = async (fileUrl: string) => {
            const res = await fetchWithRetry(
                `https://r.jina.ai/${fileUrl}`,
                { headers: { 'Accept': 'application/json' } },
                { listEnvVar: 'JINA_API_KEYS', fallbackEnvVar: 'JINA_API_KEY' }
            )

            const jinaData = await res.json()
            return jinaData?.data?.content || jinaData?.data?.text || ''
        }

        // --- Extract text ---
        let textContent = ''
        let fileUrl: string | null = null
        let storageObjectKey: string | null = null
        let storageResourceType: 'image' | 'raw' | 'video' | null = null

        // Complex documents (PDF, Word, etc.) benefit significantly from Jina AI Reader
        const isComplexDoc = mimeType === 'application/pdf' ||
            mimeType.includes('officedocument') ||
            mimeType.includes('msword')

        // Persist mode uploads the original file to Cloudinary so Supabase only stores the file URL.
        if (mode === 'persist') {
            try {
                const uploaded = await uploadToCloudinary({
                    file: new Uint8Array(fileBuffer),
                    fileName: filename,
                    mimeType,
                    publicIdPrefix: `legalshield/documents/${user.id}`,
                })
                fileUrl = uploaded.secure_url
                storageObjectKey = uploaded.public_id
                storageResourceType = uploaded.resource_type
            } catch (e) {
                return parseError((e as Error).message, 'FILE_UPLOAD_FAILED', 'cloudinary_upload', 400)
            }
        }

        console.log(`[parse-document] Checking mime type: "${mimeType}"`)
        if (mimeType === 'text/plain' || mimeType === 'text/csv') {
            console.log(`[parse-document] Using fast text extraction for ${mimeType}`)
            // Ultra-fast: decode directly, no AI needed
            textContent = new TextDecoder().decode(fileBuffer)
        } else if (mimeType === 'application/pdf' && mode === 'persist' && fileUrl) {
            // Jina AI for high-fidelity Markdown extraction using the Cloudinary URL
            try {
                textContent = await extractWithJina(fileUrl)
            } catch (e) {
                console.warn('Jina failed, falling back to Gemini:', e)
                textContent = await extractWithGemini(fileBuffer, mimeType)
            }
        } else if (isComplexDoc) {
            try {
                console.log(`[parse-document] Extracting complex doc: ${filename} (${mimeType})`)
                textContent = await extractWithGemini(fileBuffer, mimeType)
                console.log(`[parse-document] Extracted ${textContent.length} chars from ${filename}`)
            } catch (e) {
                console.error('[parse-document] Complex document extraction failed:', e)
                const isOldDoc = filename.toLowerCase().endsWith('.doc') && !filename.toLowerCase().endsWith('.docx')
                if (isOldDoc) {
                    return parseError(
                        `File "${filename}" là định dạng .doc cũ (Microsoft Word 97-2003). Vui lòng convert sang .docx hoặc .pdf để bot có thể đọc được.`,
                        'UNSUPPORTED_OLD_DOC_FORMAT',
                        'extract_complex',
                        400
                    )
                }
                return parseError(`Không thể đọc file "${filename}". Vui lòng thử định dạng .pdf, .docx hoặc .txt.`, 'EXTRACTION_FAILED', 'extract_complex', 400)
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
            // Fallback for unknown types - try Gemini as last resort
            console.log(`[parse-document] Unknown mime type ${mimeType} for ${filename}, attempting Gemini fallback`)
            try {
                textContent = await extractWithGemini(fileBuffer, mimeType)
                console.log(`[parse-document] Fallback succeeded for ${filename}, extracted ${textContent.length} chars`)
            } catch (e) {
                console.error('[parse-document] Unknown type extraction failed:', e)
                return parseError(
                    `Không thể đọc file "${filename}" (định dạng ${mimeType}). Vui lòng chọn file PDF, DOCX, hoặc TXT.`,
                    'UNSUPPORTED_TYPE',
                    'extract_unknown',
                    400
                )
            }
        }

        // --- Persist mode: save to DB ---
        if (mode === 'persist' && fileUrl) {
            const { data: doc, error: dbError } = await supabase
                .from('documents')
                .insert({
                    user_id: user.id,
                    filename,
                    file_url: fileUrl,
                    storage_provider: 'cloudinary',
                    storage_object_key: storageObjectKey,
                    storage_resource_type: storageResourceType,
                    mime_type: mimeType,
                    text_content: textContent
                })
                .select('id')
                .single()

            if (dbError) throw new Error(`DB insert: ${dbError.message}`)

            return jsonResponse({
                document_id: doc.id,
                text_content: textContent,
                metadata: {
                    filename,
                    mime_type: mimeType,
                    size_bytes: fileBuffer.byteLength,
                    mode: 'persist',
                    file_url: fileUrl,
                },
            })
        }

        // --- Ephemeral mode: return text only, no DB file link persistence ---
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

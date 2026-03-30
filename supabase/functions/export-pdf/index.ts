// Edge Function: POST /functions/v1/export-pdf
// Converts contract HTML to A4 PDF using Puppeteer (via browserless.io or Deno Puppeteer)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, errorResponse, jsonResponse } from '../shared/types.ts'

const BROWSERLESS_TOKEN = Deno.env.get('BROWSERLESS_TOKEN') ?? ''
const BROWSERLESS_URL = 'https://chrome.browserless.io/pdf'

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return errorResponse('Missing Authorization', 401)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return errorResponse('Unauthorized', 401)

        const { contract_id, html_content } = await req.json()
        if (!html_content) return errorResponse('Missing html_content', 400)

        // Wrap content in styled A4 HTML
        const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
    body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.8; margin: 2cm 2.5cm; color: #111; }
    h1 { text-align: center; font-size: 16pt; text-transform: uppercase; margin-bottom: 24pt; }
    p { margin: 6pt 0; text-align: justify; }
  </style>
</head>
<body>${html_content}</body>
</html>`

        // Render PDF via Browserless.io (headless Chrome as a service)
        const pdfRes = await fetch(`${BROWSERLESS_URL}?token=${BROWSERLESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                html: fullHtml,
                options: { format: 'A4', printBackground: true, margin: { top: '2cm', bottom: '2cm', left: '2.5cm', right: '2.5cm' } },
            }),
        })

        if (!pdfRes.ok) throw new Error(`PDF render error: ${await pdfRes.text()}`)
        const pdfBuffer = await pdfRes.arrayBuffer()

        // Storage Logic: Prefer Cloudflare R2 if configured, fallback to Supabase Storage
        const pdfPath = `${user.id}/${contract_id ?? Date.now()}.pdf`
        let finalUrl = ''

        const R2_BUCKET = Deno.env.get('R2_BUCKET')
        const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')
        const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')
        const R2_ENDPOINT = Deno.env.get('R2_ENDPOINT')
        const R2_PUBLIC_DOMAIN = Deno.env.get('R2_PUBLIC_DOMAIN')

        if (R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT) {
            // Import S3 client for R2 (S3-compatible)
            const { S3Client, PutObjectCommand } = await import('https://esm.sh/@aws-sdk/client-s3@3.300.0')

            const s3 = new S3Client({
                region: 'auto',
                endpoint: R2_ENDPOINT,
                credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
            })

            await s3.send(new PutObjectCommand({
                Bucket: R2_BUCKET,
                Key: pdfPath,
                Body: new Uint8Array(pdfBuffer),
                ContentType: 'application/pdf',
            }))

            finalUrl = `${R2_PUBLIC_DOMAIN}/${pdfPath}`
        } else {
            // Fallback to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('user-contracts')
                .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

            if (uploadError) throw new Error(`Storage: ${uploadError.message}`)
            const { data: { publicUrl } } = supabase.storage.from('user-contracts').getPublicUrl(pdfPath)
            finalUrl = publicUrl
        }

        // Update contract record with PDF URL
        if (contract_id) {
            await supabase.from('contracts').update({ pdf_url: finalUrl }).eq('id', contract_id)
        }

        return jsonResponse({ pdf_url: finalUrl, size_kb: Math.round(pdfBuffer.byteLength / 1024) })
    } catch (err) {
        return errorResponse((err as Error).message)
    }
})

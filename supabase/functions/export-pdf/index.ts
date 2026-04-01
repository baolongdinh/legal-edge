// Edge Function: POST /functions/v1/export-pdf
// Converts contract HTML to A4 PDF using Puppeteer (via browserless.io or Deno Puppeteer)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deleteFromCloudinary, uploadToCloudinary } from '../shared/cloudinary.ts'
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

        let previousPdfMeta: { pdf_public_id: string | null; pdf_resource_type: 'image' | 'raw' | 'video' | null } | null = null
        if (contract_id) {
            const { data } = await supabase
                .from('contracts')
                .select('pdf_public_id, pdf_resource_type')
                .eq('id', contract_id)
                .maybeSingle()
            if (data) previousPdfMeta = data as typeof previousPdfMeta
        }

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

        const uploaded = await uploadToCloudinary({
            file: new Uint8Array(pdfBuffer),
            fileName: `${contract_id ?? Date.now()}.pdf`,
            mimeType: 'application/pdf',
            publicIdPrefix: `legalshield/pdfs/${user.id}`,
        })
        const finalUrl = uploaded.secure_url

        if (previousPdfMeta?.pdf_public_id) {
            try {
                await deleteFromCloudinary({
                    publicId: previousPdfMeta.pdf_public_id,
                    resourceType: previousPdfMeta.pdf_resource_type ?? 'raw',
                })
            } catch (err) {
                console.warn('Failed to delete previous Cloudinary PDF asset:', (err as Error).message)
            }
        }

        // Update contract record with PDF URL
        if (contract_id) {
            await supabase
                .from('contracts')
                .update({
                    pdf_url: finalUrl,
                    pdf_provider: 'cloudinary',
                    pdf_public_id: uploaded.public_id,
                    pdf_resource_type: uploaded.resource_type,
                })
                .eq('id', contract_id)
        }

        return jsonResponse({ pdf_url: finalUrl, size_kb: Math.round(pdfBuffer.byteLength / 1024) })
    } catch (err) {
        return errorResponse((err as Error).message)
    }
})

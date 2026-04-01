import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deleteFromCloudinary, uploadToCloudinary } from '../shared/cloudinary.ts'
import { corsHeaders, errorResponse, jsonResponse } from '../shared/types.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

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

        const { contract_id, html_content, title } = await req.json()
        if (!html_content) return errorResponse('Missing html_content', 400)

        // Get previous PDF meta if existing
        let previousPdfMeta: { pdf_public_id: string | null; pdf_resource_type: string | null } | null = null
        if (contract_id) {
            const { data } = await supabase
                .from('contracts')
                .select('pdf_public_id, pdf_resource_type')
                .eq('id', contract_id)
                .maybeSingle()
            if (data) previousPdfMeta = data
        }

        // Local PDF generation using pdf-lib (no API key needed)
        const pdfDoc = await PDFDocument.create()
        const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)
        const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)

        const pageWidth = 595.28 // A4
        const pageHeight = 841.89
        const margin = 50
        const lineHeight = 16

        let page = pdfDoc.addPage([pageWidth, pageHeight])
        let y = pageHeight - margin

        // Simple HTML to Text parser for our specific format (<h1> and <p>)
        const lines: { text: string; isBold: boolean }[] = []

        // Extract Title
        const h1Match = html_content.match(/<h1>(.*?)<\/h1>/)
        if (h1Match) {
            lines.push({ text: h1Match[1].toUpperCase(), isBold: true })
            lines.push({ text: '', isBold: false })
        }

        // Extract Paragraphs
        const pMatches = html_content.matchAll(/<p>(.*?)<\/p>/g)
        for (const match of pMatches) {
            let text = match[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/<br\s*\/?>/g, '\n')

            // Simple word wrap
            const words = text.split(' ')
            let currentLine = ''
            for (const word of words) {
                if ((currentLine + word).length > 85) {
                    lines.push({ text: currentLine, isBold: false })
                    currentLine = word + ' '
                } else {
                    currentLine += word + ' '
                }
            }
            lines.push({ text: currentLine, isBold: false })
            lines.push({ text: '', isBold: false }) // Paragraph spacing
        }

        // Draw text
        for (const line of lines) {
            if (y < margin + lineHeight) {
                page = pdfDoc.addPage([pageWidth, pageHeight])
                y = pageHeight - margin
            }

            if (line.text.trim()) {
                page.drawText(line.text, {
                    x: margin,
                    y,
                    size: line.isBold ? 14 : 12,
                    font: line.isBold ? fontBold : font,
                    color: rgb(0, 0, 0),
                })
            }
            y -= lineHeight
        }

        const pdfBytes = await pdfDoc.save()

        const uploaded = await uploadToCloudinary({
            file: new Uint8Array(pdfBytes),
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

        return jsonResponse({ pdf_url: finalUrl, size_kb: Math.round(pdfBytes.byteLength / 1024) })
    } catch (err) {
        return errorResponse((err as Error).message)
    }
})

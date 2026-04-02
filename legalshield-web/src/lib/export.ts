import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'

// Vietnamese-compatible font URL (Roboto Regular from Google Fonts)
const FONT_URL = 'https://cdn.jsdelivr.net/gh/googlefonts/roboto@master/src/hinted/Roboto-Regular.ttf'

async function loadFont() {
    try {
        const response = await fetch(FONT_URL)
        if (!response.ok) throw new Error('Failed to fetch font')
        return await response.arrayBuffer()
    } catch (error) {
        console.error('Error loading font, falling back to StandardFonts:', error)
        return null
    }
}

/**
 * Wraps text for PDF generation
 */
function wrapText(text: string, maxWidth: number, fontSize: number, font: any) {
    const words = text.split(' ')
    const lines = []
    let currentLine = ''

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        const width = font.widthOfTextAtSize(testLine, fontSize)
        if (width > maxWidth) {
            lines.push(currentLine)
            currentLine = word
        } else {
            currentLine = testLine
        }
    }
    lines.push(currentLine)
    return lines
}

/**
 * Exports text to PDF on the client side
 */
export async function exportToPDF(title: string, content: string) {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)

    const fontBytes = await loadFont()
    let font
    if (fontBytes) {
        font = await pdfDoc.embedFont(fontBytes)
    } else {
        font = await pdfDoc.embedFont('Helvetica')
    }

    const pageHeight = 841.89 // A4
    const pageWidth = 595.28 // A4
    const margin = 60
    const fontSize = 11
    const lineHeight = fontSize * 1.4

    let page = pdfDoc.addPage([pageWidth, pageHeight])
    let y = pageHeight - margin

    // Header (Title)
    const titleWidth = font.widthOfTextAtSize(title.toUpperCase(), 16)
    page.drawText(title.toUpperCase(), {
        x: (pageWidth - titleWidth) / 2,
        y,
        size: 16,
        font,
        color: rgb(0, 0, 0)
    })
    y -= 50

    const textLines = content.split('\n')
    for (const textLine of textLines) {
        if (!textLine.trim()) {
            y -= lineHeight / 2
            continue
        }

        const wrapped = wrapText(textLine, pageWidth - (margin * 2), fontSize, font)
        for (const line of wrapped) {
            if (y < margin + lineHeight) {
                page = pdfDoc.addPage([pageWidth, pageHeight])
                y = pageHeight - margin
            }
            page.drawText(line, {
                x: margin,
                y,
                size: fontSize,
                font,
                color: rgb(0.15, 0.15, 0.15)
            })
            y -= lineHeight
        }
        y -= 8 // Paragraph spacing
    }

    const pdfBytes = await pdfDoc.save()
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' })
    saveAs(blob, `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`)
    return blob
}

/**
 * Exports text to DOCX on the client side
 */
export async function exportToDocx(title: string, content: string) {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 120 }
                }),
                new Paragraph({
                    text: 'Độc lập - Tự do - Hạnh phúc',
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 240 }
                }),
                new Paragraph({
                    text: title.toUpperCase(),
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 400, after: 600 }
                }),
                ...content.split('\n').map(line => new Paragraph({
                    children: [new TextRun({ text: line || ' ', size: 24 })],
                    spacing: { after: 200 },
                    alignment: AlignmentType.JUSTIFIED
                })),
            ],
        }],
    })

    const blob = await Packer.toBlob(doc)
    saveAs(blob, `${title.toLowerCase().replace(/\s+/g, '-')}.docx`)
    return blob
}

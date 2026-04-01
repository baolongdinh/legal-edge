import * as Comlink from 'comlink'
import * as pdfjs from 'pdfjs-dist'
import mammoth from 'mammoth'

export const documentWorker = {
    async parsePDF(arrayBuffer: ArrayBuffer): Promise<string> {
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer, disableWorker: true } as any)
        const pdf = await loadingTask.promise
        let fullText = ''

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ')
            fullText += pageText + '\n'
        }
        return fullText.trim()
    },

    async parseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
        const result = await mammoth.extractRawText({ arrayBuffer })
        return result.value.trim()
    },

    async generateHash(arrayBuffer: ArrayBuffer): Promise<string> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }
}

Comlink.expose(documentWorker)

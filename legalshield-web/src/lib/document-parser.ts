import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';
import nlp from 'compromise';
import { z } from 'zod';

// Contract Metadata Schema
export const ContractSchema = z.object({
    content: z.string().min(100, "Văn bản quá ngắn để phân tích"),
    has_parties: z.boolean().default(false),
    title_lines: z.array(z.string()).optional()
});

// Setup PDF.js worker
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

/**
 * Extracts text from a PDF file using pdfjs-dist
 */
export async function parsePDF(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
        fullText += pageText + '\n';
    }

    return fullText.trim();
}

/**
 * Extracts text from a DOCX file using mammoth
 */
export async function parseDOCX(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
}

/**
 * Unified parser based on file extension
 */
export async function parseDocumentLocally(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'pdf') {
        return parsePDF(file);
    } else if (extension === 'docx') {
        return parseDOCX(file);
    }

    throw new Error('Unsupported file format for local parsing');
}

/**
 * Classifies contract sections using lightweight NLP (Compromise)
 */
export function classifySections(text: string) {
    const doc = nlp(text);

    const sections = {
        parties: doc.match('(bên a|bên b|party|agreement between)').found,
        termination: doc.match('(chấm dứt|tạm ngừng|termination|suspend)').found,
        payment: doc.match('(thanh toán|giá trị|phí|payment|fee|price)').found,
        dispute: doc.match('(tranh chấp|tòa án|trọng tài|dispute|arbitration)').found,
        warranty: doc.match('(bảo hành|cam kết|warranty|guarantee)').found,
    };

    return {
        summary: doc.sentences().json().slice(0, 5).map((s: any) => s.text).join(' '),
        sections,
        is_valid: text.length > 500 && (doc.match('(hợp đồng|agreement|contract)').found || sections.parties)
    };
}

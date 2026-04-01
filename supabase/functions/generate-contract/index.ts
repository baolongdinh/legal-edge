// Edge Function: POST /functions/v1/generate-contract
// RAG pipeline: embed prompt → similarity search on document_chunks → stream via Gemini Pro

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
    buildLegalAnswerPayload,
    corsHeaders,
    embedText,
    errorResponse,
    exaSearch,
    fetchWithRetry,
    jsonResponse,
    requiresLegalCitation,
    retrieveLegalEvidence,
    roundRobinKey,
} from '../shared/types.ts'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'https://esm.sh/docx@8.2.2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent'
const GEMINI_JSON_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

type DraftMode = 'draft' | 'clause_insert' | 'rewrite'

interface ClarificationQuestion {
    id: string
    label: string
    placeholder: string
    help_text?: string
    required?: boolean
}

interface DocumentRule {
    type: string
    label: string
    isContract: boolean
    searchQuery: string
    keywords: string[]
    questions: ClarificationQuestion[]
}

const COMMON_QUESTIONS: ClarificationQuestion[] = [
    {
        id: 'parties',
        label: 'Thông tin các bên',
        placeholder: 'Ghi rõ họ tên/tên công ty, người đại diện, địa chỉ, số giấy tờ hoặc mã số thuế của các bên.',
        help_text: 'Nếu có Bên A/Bên B thì nêu tách riêng.',
        required: true,
    },
    {
        id: 'objective',
        label: 'Mục đích và phạm vi thỏa thuận',
        placeholder: 'Mô tả ngắn gọn giao dịch hoặc việc hai bên muốn thỏa thuận.',
        required: true,
    },
    {
        id: 'commercial_terms',
        label: 'Giá trị, thanh toán hoặc quyền lợi chính',
        placeholder: 'Nếu có tiền, tài sản, đặt cọc, chia quyền lợi hoặc cấp dưỡng thì nêu cụ thể.',
        required: true,
    },
    {
        id: 'timeline',
        label: 'Thời hạn và mốc thực hiện',
        placeholder: 'Ghi ngày bắt đầu, ngày kết thúc, thời gian bàn giao hoặc các mốc quan trọng.',
        required: true,
    },
    {
        id: 'special_terms',
        label: 'Điều khoản đặc biệt cần có',
        placeholder: 'Ví dụ: phạt vi phạm, bảo mật, bồi thường, nuôi con, chia tài sản, chấm dứt, giải quyết tranh chấp.',
        required: false,
    },
]

const DOCUMENT_RULES: DocumentRule[] = [
    {
        type: 'divorce_petition',
        label: 'Đơn ly hôn / thỏa thuận ly hôn',
        isContract: false,
        searchQuery: 'mẫu đơn ly hôn thuận tình file word việt nam',
        keywords: ['ly hôn', 'ly hon', 'thuận tình', 'thuận tinh', 'đơn ly hôn', 'don ly hon'],
        questions: [
            {
                id: 'divorce_type',
                label: 'Hình thức ly hôn',
                placeholder: 'Ly hôn thuận tình hay ly hôn đơn phương?',
                required: true,
            },
            {
                id: 'spouse_info',
                label: 'Thông tin vợ chồng',
                placeholder: 'Họ tên, ngày sinh, địa chỉ cư trú, số CCCD/hộ chiếu của vợ và chồng.',
                required: true,
            },
            {
                id: 'children_assets',
                label: 'Con chung, tài sản chung, nợ chung',
                placeholder: 'Nêu rõ vấn đề nuôi con, cấp dưỡng, chia tài sản và phân chia nợ nếu có.',
                required: true,
            },
            {
                id: 'special_terms',
                label: 'Yêu cầu khác',
                placeholder: 'Các thỏa thuận hoặc yêu cầu cụ thể khác mà bạn muốn đưa vào hồ sơ.',
                required: false,
            },
        ],
    },
    {
        type: 'service_contract',
        label: 'Hợp đồng dịch vụ',
        isContract: true,
        searchQuery: 'mẫu hợp đồng dịch vụ file word việt nam',
        keywords: ['dịch vụ', 'service', 'cung cấp dịch vụ', 'thuê làm', 'thực hiện công việc'],
        questions: [
            COMMON_QUESTIONS[0],
            {
                id: 'service_scope',
                label: 'Phạm vi dịch vụ và kết quả bàn giao',
                placeholder: 'Mô tả dịch vụ, sản phẩm đầu ra, tiêu chuẩn nghiệm thu.',
                required: true,
            },
            {
                id: 'payment_schedule',
                label: 'Phí dịch vụ và tiến độ thanh toán',
                placeholder: 'Ví dụ: 3 đợt, phần trăm từng đợt, thời hạn thanh toán.',
                required: true,
            },
            COMMON_QUESTIONS[3],
            COMMON_QUESTIONS[4],
        ],
    },
    {
        type: 'nda_contract',
        label: 'Thỏa thuận bảo mật (NDA)',
        isContract: true,
        searchQuery: 'mẫu thỏa thuận bảo mật nda file word việt nam',
        keywords: ['bảo mật', 'nda', 'confidential', 'thông tin mật'],
        questions: [
            COMMON_QUESTIONS[0],
            {
                id: 'confidential_scope',
                label: 'Thông tin cần bảo mật',
                placeholder: 'Nêu loại thông tin nào được coi là bí mật và mục đích chia sẻ.',
                required: true,
            },
            {
                id: 'use_limit',
                label: 'Giới hạn sử dụng và người được tiếp cận',
                placeholder: 'Ai được xem, dùng vào việc gì, có được sao chép/chia sẻ tiếp không?',
                required: true,
            },
            COMMON_QUESTIONS[3],
            COMMON_QUESTIONS[4],
        ],
    },
    {
        type: 'employment_contract',
        label: 'Hợp đồng lao động',
        isContract: true,
        searchQuery: 'mẫu hợp đồng lao động file word việt nam',
        keywords: ['lao động', 'nhân viên', 'tuyển dụng', 'lương', 'việc làm'],
        questions: [
            COMMON_QUESTIONS[0],
            {
                id: 'job_scope',
                label: 'Vị trí, công việc và nơi làm việc',
                placeholder: 'Chức danh, mô tả công việc chính, địa điểm làm việc.',
                required: true,
            },
            {
                id: 'salary_benefits',
                label: 'Lương, phụ cấp, thưởng và phúc lợi',
                placeholder: 'Ghi mức lương, thời điểm trả lương, phụ cấp, BHXH, thử việc.',
                required: true,
            },
            COMMON_QUESTIONS[3],
            COMMON_QUESTIONS[4],
        ],
    },
    {
        type: 'lease_contract',
        label: 'Hợp đồng thuê tài sản / thuê nhà',
        isContract: true,
        searchQuery: 'mẫu hợp đồng thuê nhà file word việt nam',
        keywords: ['thuê nhà', 'thuê văn phòng', 'thuê', 'cho thuê', 'mặt bằng'],
        questions: [
            COMMON_QUESTIONS[0],
            {
                id: 'asset_info',
                label: 'Thông tin tài sản cho thuê',
                placeholder: 'Địa chỉ, diện tích, hiện trạng, trang thiết bị đi kèm.',
                required: true,
            },
            {
                id: 'rent_terms',
                label: 'Tiền thuê, tiền cọc và chi phí khác',
                placeholder: 'Tiền thuê hàng tháng, đặt cọc, điện nước, chi phí phát sinh.',
                required: true,
            },
            COMMON_QUESTIONS[3],
            COMMON_QUESTIONS[4],
        ],
    },
    {
        type: 'sale_contract',
        label: 'Hợp đồng mua bán',
        isContract: true,
        searchQuery: 'mẫu hợp đồng mua bán file word việt nam',
        keywords: ['mua bán', 'bán hàng', 'chuyển nhượng', 'chuyen nhuong'],
        questions: [
            COMMON_QUESTIONS[0],
            {
                id: 'goods_scope',
                label: 'Tài sản / hàng hóa / đối tượng mua bán',
                placeholder: 'Mô tả số lượng, chất lượng, đặc điểm hàng hóa hoặc tài sản.',
                required: true,
            },
            {
                id: 'price_delivery',
                label: 'Giá bán, giao nhận và thanh toán',
                placeholder: 'Giá trị, thời điểm giao nhận, chứng từ, thời hạn thanh toán.',
                required: true,
            },
            COMMON_QUESTIONS[3],
            COMMON_QUESTIONS[4],
        ],
    },
    {
        type: 'generic_contract',
        label: 'Hợp đồng dân sự',
        isContract: true,
        searchQuery: 'mẫu hợp đồng dân sự file word việt nam',
        keywords: ['hợp đồng', 'thỏa thuận', 'thoa thuan'],
        questions: COMMON_QUESTIONS,
    },
]

function normalizeVietnamese(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function detectDocumentRule(input: string): DocumentRule {
    const normalized = normalizeVietnamese(input)
    const ranked = DOCUMENT_RULES
        .map((rule) => ({
            rule,
            score: rule.keywords.reduce((sum, keyword) => sum + (normalized.includes(keyword) ? 1 : 0), 0),
        }))
        .sort((a, b) => b.score - a.score)[0]

    if (!ranked || ranked.score === 0) {
        return DOCUMENT_RULES.find((rule) => rule.type === 'generic_contract')!
    }

    return ranked.rule
}

function toReadableLabel(rule: DocumentRule, prompt: string): string {
    const normalized = normalizeVietnamese(prompt)
    if (!rule.isContract && normalized.includes('thuận tình')) {
        return 'Đơn ly hôn thuận tình / văn bản thỏa thuận ly hôn'
    }
    return rule.label
}

function mergeIntakeText(prompt: string, intakeAnswers?: Record<string, string>) {
    const answerText = Object.entries(intakeAnswers ?? {})
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${key}: ${value.trim()}`)
        .join('\n')

    return [prompt, answerText].filter(Boolean).join('\n')
}

async function checkAICompleteness(prompt: string, answers: Record<string, string>, documentLabel: string, geminiKey: string, legalRequirements?: string) {
    const systemPrompt = `Bạn là chuyên gia phân tích yêu cầu pháp lý Việt Nam.
Nhiệm vụ: Đánh giá xem yêu cầu và các câu trả lời hiện tại đã đủ để soạn một bản thảo chuyên nghiệp (loại: ${documentLabel}) chưa.

QUY TẮC VỀ THÔNG TIN CÁ NHÂN:
- KHÔNG hỏi các thông tin cá nhân cụ thể như: Họ tên, Ngày sinh, Số CMND/CCCD, Địa chỉ thường trú, Chỗ ở hiện tại...
- Các thông tin này hãy mặc định để trống dạng (.....) trong bản thảo để người dùng tự điền sau.
- CHỈ tập trung đặt câu hỏi về các THÔNG TIN ẢNH HƯỞNG ĐẾN CẤU TRÚC/NỘI DUNG của văn bản.
  Ví dụ: Trong đơn ly hôn, hãy hỏi về: Tình trạng hôn nhân, có con chung hay không, có tài sản chung/nợ chung không? Vì những điều này làm thay đổi format đơn.

${legalRequirements ? `CƠ SỞ PHÁP LÝ CHO LOẠI TÀI LIỆU NÀY:
${legalRequirements}

Hãy dựa trên cơ sở pháp lý trên để đặt các câu hỏi còn thiếu (nhưng vẫn phải tuân thủ quy tắc KHÔNG hỏi thông tin cá nhân ở trên).` : ''}

QUY TẮC QUAN TRỌNG:
1. Nếu đã đủ các thông tin cốt lõi ảnh hưởng đến logic/cấu trúc, trả về JSON: { "status": "COMPLETE" }
2. Nếu thiếu, hãy đặt 2-4 câu hỏi TẬP TRUNG vào những gì chưa biết và cần thiết để xác định format.
3. Nếu người dùng bảo "để trống", "không có", hoặc "điền sau" cho một thông tin, hãy coi đó là ĐÃ PHẢN HỒI và KHÔNG hỏi lại câu đó nữa.
4. KHÔNG bao giờ hỏi lại những gì đã có trong 'Câu trả lời hiện tại'.
5. Trả về JSON theo định dạng:
{
  "status": "NEEDS_INFO",
  "questions": [
    { "id": "unique_id", "label": "Tên câu hỏi ngắn gọn", "placeholder": "Ví dụ điền...", "required": true }
  ]
}
`

    const userContent = `Yêu cầu của người dùng: ${prompt}\n\ncâu trả lời hiện tại: ${JSON.stringify(answers, null, 2)}`

    try {
        const res = await fetch(GEMINI_JSON_URL + `?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.1
                }
            })
        })

        if (!res.ok) return { status: 'COMPLETE' }
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) return { status: 'COMPLETE' }
        return JSON.parse(text)
    } catch (err) {
        console.error('AI Completeness Check Failed:', err)
        return { status: 'COMPLETE' }
    }
}

function buildClarificationPack(rule: DocumentRule, prompt: string, aiQuestions?: ClarificationQuestion[]) {
    return {
        title: `Làm rõ thông tin để soạn ${toReadableLabel(rule, prompt)}`,
        description: rule.isContract
            ? 'Hãy giúp tôi làm rõ một vài chi tiết để bản soạn thảo sát với thực tế nhất.'
            : 'Để chuẩn bị hồ sơ chính xác, tôi cần bạn bổ sung các thông tin sau (chỉ cần điền 1 lần).',
        questions: aiQuestions?.length ? aiQuestions : rule.questions,
    }
}

async function searchTemplateReferences(rule: DocumentRule, prompt: string) {
    const query = `${rule.searchQuery} ${prompt}`.trim()
    const results = await exaSearch(query, '', 4)
    return results.slice(0, 3).map((item) => ({
        title: item.title,
        url: item.url,
        source_domain: item.source_domain,
        source_type: item.source_type,
        note: item.source_type === 'official'
            ? 'Nguồn chính thống để đối chiếu biểu mẫu/quy định.'
            : 'Mẫu tham khảo từ web, cần đối chiếu lại trước khi dùng nguyên văn.',
    }))
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const {
            prompt,
            template_id,
            mode = 'draft',
            current_draft,
            selection_context,
            intake_answers,
            parameters,
            response_mode = 'stream',
            type
        } = await req.json() as {
            prompt: string
            template_id?: string
            mode?: DraftMode
            current_draft?: string
            selection_context?: string
            intake_answers?: Record<string, string>
            parameters?: Record<string, unknown>
            response_mode?: 'stream' | 'json'
            type?: string
        }
        if (!prompt) return errorResponse('Missing prompt', 400)

        async function generateContractText() {
            const geminiKey = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
            const geminiRes = await fetch(GEMINI_JSON_URL + `?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Tạo hợp đồng theo luật Việt Nam dựa trên yêu cầu: ${prompt}. Trả về nội dung đầy đủ, chuẩn pháp lý, có bố cục chương mục rõ ràng.`
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192,
                    }
                })
            })

            if (!geminiRes.ok) throw new Error('Failed to generate contract')
            const geminiData = await geminiRes.json()
            const contractText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
            if (!contractText) throw new Error('Empty contract content from generator')
            return contractText
        }

        function wrapTextForPDF(text: string, maxChars = 90) {
            const lines: string[] = []
            text.split('\n').forEach((rawLine) => {
                let current = rawLine
                while (current.length > maxChars) {
                    lines.push(current.slice(0, maxChars))
                    current = current.slice(maxChars)
                }
                lines.push(current)
            })
            return lines
        }

        if (type === 'docx' || type === 'pdf' || type === 'both') {
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            )
            const contractText = await generateContractText()
            const result: any = { content: contractText }

            if (type === 'docx' || type === 'both') {
                const doc = new Document({
                    sections: [{
                        properties: {},
                        children: [
                            new Paragraph({
                                text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                                heading: HeadingLevel.TITLE,
                                alignment: AlignmentType.CENTER,
                            }),
                            new Paragraph({
                                text: 'Độc lập - Tự do - Hạnh phúc',
                                alignment: AlignmentType.CENTER,
                            }),
                            new Paragraph({
                                text: '-------------------',
                                alignment: AlignmentType.CENTER,
                            }),
                            new Paragraph({
                                text: 'HỢP ĐỒNG',
                                heading: HeadingLevel.HEADING_1,
                                alignment: AlignmentType.CENTER,
                            }),
                            new Paragraph({ text: '' }),
                            ...contractText.split('\n').map(line => new Paragraph({
                                children: [new TextRun({ text: line || ' ', size: 24 })],
                                spacing: { after: 120 }
                            })),
                        ],
                    }],
                })

                const buffer = await Packer.toBuffer(doc)
                const fileName = `contract-${Date.now()}.docx`
                const { error: uploadError } = await supabase.storage
                    .from('user-contracts')
                    .upload(fileName, buffer, {
                        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    })
                if (uploadError) throw new Error('Failed to upload DOCX')
                const { data: urlData } = supabase.storage
                    .from('user-contracts')
                    .getPublicUrl(fileName)
                result.docxUrl = urlData.publicUrl
            }

            if (type === 'pdf' || type === 'both') {
                const pdfDoc = await PDFDocument.create()
                const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)
                const pageWidth = 595.28
                const pageHeight = 841.89
                const margin = 50
                const lineHeight = 14
                let page = pdfDoc.addPage([pageWidth, pageHeight])
                let y = pageHeight - margin

                const headerText = 'HỢP ĐỒNG'
                page.drawText(headerText, {
                    x: margin,
                    y: y,
                    size: 18,
                    font,
                    color: rgb(0, 0, 0),
                })
                y -= 30

                const lines = wrapTextForPDF(contractText, 95)
                for (const line of lines) {
                    if (y < margin + lineHeight) {
                        page = pdfDoc.addPage([pageWidth, pageHeight])
                        y = pageHeight - margin
                    }
                    page.drawText(line || ' ', {
                        x: margin,
                        y,
                        size: 12,
                        font,
                        color: rgb(0.11, 0.11, 0.11),
                    })
                    y -= lineHeight
                }

                const pdfBytes = await pdfDoc.save()
                const fileName = `contract-${Date.now()}.pdf`
                const { error: pdfUploadError } = await supabase.storage
                    .from('user-contracts')
                    .upload(fileName, pdfBytes, {
                        contentType: 'application/pdf',
                    })
                if (pdfUploadError) throw new Error('Failed to upload PDF')
                const { data: urlData } = supabase.storage
                    .from('user-contracts')
                    .getPublicUrl(fileName)
                result.pdfUrl = urlData.publicUrl
            }

            return jsonResponse(result)
        }

        const geminiKey = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const mergedPrompt = mergeIntakeText(prompt, intake_answers)
        const documentRule = detectDocumentRule(mergedPrompt)
        const documentLabel = toReadableLabel(documentRule, mergedPrompt)
        const isExplicitContractRequest = normalizeVietnamese(prompt).includes('hop dong')
            || normalizeVietnamese(prompt).includes('hợp đồng')

        const mismatchReason = !documentRule.isContract && isExplicitContractRequest
            ? `Yêu cầu của bạn nghe giống "${documentLabel}" hơn là một hợp đồng dân sự thông thường.`
            : undefined

        const templateReferences = await searchTemplateReferences(documentRule, prompt).catch(() => [])
        const force_generation = parameters?.force_generation === true

        let aiCheck: { status: string, questions?: ClarificationQuestion[] } = { status: 'COMPLETE' }
        if (!force_generation && response_mode === 'json' && mode === 'draft') {
            // Real-time legal requirement search to ground AI questions
            const legalRequirementSearchQuery = `nội dung bắt buộc của ${documentLabel} theo pháp luật Việt Nam mới nhất 2024 2025`
            const legalReqs = await exaSearch(legalRequirementSearchQuery, '', 3).catch(() => [])
            const legalContext = legalReqs.map((r: { title: string; content: string }) => `[${r.title}]\n${r.content}`).join('\n\n')

            aiCheck = await checkAICompleteness(prompt, intake_answers ?? {}, documentLabel, geminiKey, legalContext)
        }

        if (!force_generation && response_mode === 'json' && mode === 'draft' && (aiCheck.status === 'NEEDS_INFO' || mismatchReason) && aiCheck.questions?.length) {
            return jsonResponse({
                status: 'needs_clarification',
                document_type: documentRule.type,
                document_label: documentLabel,
                clarification_pack: buildClarificationPack(documentRule, prompt, aiCheck.questions),
                template_references: templateReferences,
                content: [
                    `Tôi có thể hỗ trợ soạn ${documentLabel}, nhưng tôi cần thêm một vài chi tiết để đảm bảo quyền lợi tốt nhất cho bạn.`,
                    '',
                    'Bạn chỉ cần điền nhanh bộ câu hỏi bên dưới, sau đó tôi sẽ tạo bản nháp hoàn chỉnh ngay.'
                ].join('\n'),
                citations: [],
                verification_status: 'unverified',
                verification_summary: {
                    requires_citation: false,
                    verification_status: 'unverified',
                    citation_count: 0,
                    official_count: 0,
                    secondary_count: 0,
                    unsupported_claim_count: 0,
                },
                claim_audit: [],
            })
        }

        const retrievalQuery = [
            mergedPrompt,
            `Loại tài liệu: ${documentLabel}`,
            selection_context ? `Đoạn cần xử lý:\n${selection_context}` : '',
            current_draft ? `Bối cảnh bản thảo:\n${current_draft.slice(0, 4000)}` : '',
        ].filter(Boolean).join('\n\n')

        // 1. Embed the user prompt
        const queryEmbedding = await embedText(retrievalQuery, geminiKey)

        // 2. Vector similarity search (top 5 law chunks)
        const { data: chunks, error } = await supabase.rpc('match_document_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.75,
            match_count: 5,
        })
        if (error) throw new Error(`Vector search: ${error.message}`)

        // 3. Build context from matched chunks
        const legalContext = (chunks ?? [])
            .map((c: { law_article: string; content: string }) => `[${c.law_article}]\n${c.content}`)
            .join('\n\n---\n\n')

        // 4. Fetch template if specified
        let templateContent = ''
        if (template_id) {
            const { data: t } = await supabase.from('templates').select('content_md').eq('id', template_id).single()
            templateContent = t?.content_md ?? ''
        }

        const systemPrompt = `Bạn là trợ lý pháp lý Việt Nam cho workspace soạn thảo hợp đồng của LegalShield.

Nhiệm vụ:
- mode=draft: tạo bản thảo hoặc khung hợp đồng hoàn chỉnh dựa trên yêu cầu, mẫu, và cơ sở pháp lý.
- mode=clause_insert: tạo một điều khoản hoặc block nội dung để CHÈN vào bản thảo hiện có.
- mode=rewrite: viết lại chính đoạn được chọn, không viết lại toàn bộ hợp đồng.

Quy tắc:
1. Chỉ dựa trên mẫu hợp đồng, ngữ cảnh bản thảo, và cơ sở pháp lý đã cho.
2. Nếu đưa ra kết luận pháp lý cụ thể, phải bám sát điều luật được cung cấp.
3. Không tạo tiêu đề/thành phần dư thừa khi mode=clause_insert hoặc mode=rewrite.
4. Trả lời bằng tiếng Việt pháp lý rõ ràng, sẵn sàng để chèn vào bản thảo.
5. Không thêm giải thích ngoài nội dung được yêu cầu.
6. Nếu yêu cầu gốc là loại hồ sơ không phải hợp đồng, hãy soạn đúng loại hồ sơ đó thay vì cố ép thành hợp đồng.
7. Nếu có mẫu tham khảo từ web, chỉ dùng để tham chiếu bố cục/cách diễn đạt; không sao chép nguyên văn máy móc.`

        const instructionText = `Chế độ: ${mode}
Loại tài liệu đích: ${documentLabel}
Yêu cầu người dùng: ${prompt}

Tham số cấu trúc: ${parameters ? JSON.stringify(parameters, null, 2) : 'Không có'}

Phiếu trả lời bổ sung:
${intake_answers ? JSON.stringify(intake_answers, null, 2) : 'Chưa có'}

Mẫu hợp đồng:
${templateContent || 'Không có'}

Bản thảo hiện tại:
${current_draft || 'Chưa có'}

Đoạn đang chọn:
${selection_context || 'Không có'}

Cơ sở pháp lý:
${legalContext || 'Không có kết quả truy xuất phù hợp'}

Mẫu tham khảo từ web:
${templateReferences.length > 0 ? templateReferences.map((item, index) => `${index + 1}. ${item.title} (${item.source_domain}) - ${item.url}`).join('\n') : 'Chưa có mẫu tham khảo ngoài hệ thống'}`

        const body = {
            contents: [{
                role: 'user',
                parts: [{
                    text: `${systemPrompt}\n\n${instructionText}`
                }]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }

        if (response_mode === 'json') {
            const generationRes = await fetchWithRetry(
                GEMINI_JSON_URL,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
                { listEnvVar: 'GEMINI_API_KEYS', fallbackEnvVar: 'GEMINI_API_KEY' }
            )

            const generationData = await generationRes.json()
            const content = generationData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
            if (!content) throw new Error('Gemini returned empty content')

            const evidenceQuery = [
                mergedPrompt,
                mode,
                selection_context || '',
                templateContent.slice(0, 800),
            ].filter(Boolean).join('\n')

            const evidence = await retrieveLegalEvidence(evidenceQuery, 4)
            const requiresCitation = requiresLegalCitation(`${mergedPrompt}\n${content}`)
            const payload = buildLegalAnswerPayload(content, evidence, requiresCitation)

            return jsonResponse({
                status: 'ok',
                document_type: documentRule.type,
                document_label: documentLabel,
                content: payload.answer,
                citations: payload.citations,
                evidence: payload.evidence,
                verification_status: payload.verification_status,
                verification_summary: payload.verification_summary,
                claim_audit: payload.claim_audit ?? [],
                abstained: payload.abstained,
                template_references: templateReferences,
            })
        }

        const geminiRes = await fetch(`${GEMINI_URL}?key=${geminiKey}&alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })

        if (!geminiRes.ok) throw new Error(`Gemini error: ${await geminiRes.text()}`)

        // Stream response back to client
        return new Response(geminiRes.body, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
        })
    } catch (err) {
        return errorResponse((err as Error).message)
    }
})

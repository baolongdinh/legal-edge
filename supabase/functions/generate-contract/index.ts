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
    retrieveChatMemory,
    jinaRerank,
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
        id: 'objective',
        label: 'Mục đích và phạm vi thỏa thuận',
        placeholder: 'Ví dụ: Hợp đồng thuê nhà, Hợp đồng tư vấn marketing...',
        required: true,
    },
    {
        id: 'commercial_terms',
        label: 'Giá trị, thanh toán hoặc quyền lợi chính',
        placeholder: 'Nêu số tiền, hình thức thanh toán hoặc lợi ích trao đổi cốt lõi.',
        required: true,
    },
    {
        id: 'timeline',
        label: 'Thời hạn và mốc thực hiện',
        placeholder: 'Thời gian bắt đầu, kết thúc hoặc các mốc bàn giao quan trọng.',
        required: true,
    },
    {
        id: 'special_terms',
        label: 'Điều khoản đặc biệt (nếu có)',
        placeholder: 'Ví dụ: Phạt vi phạm, bảo mật, địa điểm thực hiện. Có thể bỏ qua.',
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
                label: 'Cốt lõi tình trạng',
                placeholder: 'Ly hôn thuận tình (cả hai đồng ý) hay đơn phương?',
                required: true,
            },
            {
                id: 'children_assets',
                label: 'Con chung và Tài sản',
                placeholder: 'Đồng ý để ai nuôi con? Có chia tài sản/nợ không? (Mặc định dùng ..... nếu không nêu).',
                required: true,
            },
            {
                id: 'special_terms',
                label: 'Yêu cầu đặc thù',
                placeholder: 'Ví dụ: cấp dưỡng bao nhiêu, thời gian thăm con...',
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
            COMMON_QUESTIONS[2],
            COMMON_QUESTIONS[3],
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
            COMMON_QUESTIONS[2],
            COMMON_QUESTIONS[3],
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
            COMMON_QUESTIONS[2],
            COMMON_QUESTIONS[3],
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
            COMMON_QUESTIONS[2],
            COMMON_QUESTIONS[3],
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
            COMMON_QUESTIONS[2],
            COMMON_QUESTIONS[3],
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

async function checkAICompleteness(prompt: string, answers: Record<string, string>, documentLabel: string, geminiKey: string, legalRequirements?: string, chatMemory?: string) {
    const systemPrompt = `Bạn là chuyên gia phân tích MẪU HỢP ĐỒNG/VĂN BẢN PHÁP LÝ.
Nhiệm vụ: Đánh giá xem thông tin người dùng cung cấp đã đủ để PHÁC THẢO KHUNG (Drafting) tài liệu loại [${documentLabel}] chưa. KHÔNG phải là luật sư điều tra vụ án.

QUY TẮC CỐT LÕI (TUYỆT ĐỐI TUÂN THỦ):
1. ĐÂY LÀ QUÁ TRÌNH SOẠN THẢO VĂN BẢN, KHÔNG PHẢI ĐIỀU TRA:
   - KHÔNG BAO GIỜ hỏi người dùng về "bằng chứng", "giấy tờ chứng minh", "hình ảnh", "nhân chứng" hay tính đúng sai của vụ việc.
   - KHÔNG hỏi các thông tin cá nhân cụ thể như: Họ tên, Ngày sinh, CCCD, Địa chỉ. Mặc định dùng dấu (.....) để người dùng tự điền.
   - CHỈ HỎI về các ĐIỀU KHOẢN, THỎA THUẬN cốt lõi (ví dụ: giá trị, thời hạn bảo hành, phân chia tài sản, yêu cầu đặc biệt).

2. KHÔNG HỎI LẠI VÀ KHÔNG HỎI LAN MAN:
   - NẾU người dùng đã trả lời, hoặc thông tin đã xuất hiện trong Chat History, hoặc người dùng nói "bỏ qua", "skip", "...", "tự điền" -> COI NHƯ ĐÃ CÓ (COMPLETE).
   - TUYỆT ĐỐI KHÔNG hỏi lại cùng một câu hỏi quá 2 lần trong cả cuộc hội thoại.
   - Nếu đã đủ khung cơ bản (biết loại văn bản, mục đích chính, giá trị cơ bản), hãy trả về { "status": "COMPLETE" }.
   - Chỉ hỏi thêm THẬT SỰ CẦN THIẾT để cấu trúc văn bản hợp lệ (VD: chưa biết thuê trong bao lâu).
   - TỔNG SỐ CÂU HỎI mới không bao giờ quá 2 câu.

${legalRequirements ? `CƠ SỞ PHÁP LÝ ĐỂ SOẠN THẢO:\n${legalRequirements}\n\nDùng để biết tài liệu này cần những mục gì, tuyệt đối không dùng để điều tra sự thật.` : ''}

3. ĐỊNH DẠNG TRẢ VỀ CHUẨN JSON:
{
  "status": "COMPLETE" | "NEEDS_INFO",
  "questions": [
    { "id": "unique_id", "label": "Tên câu hỏi ngắn gọn (VD: Giá trị hợp đồng?)", "placeholder": "Ví dụ...", "required": false }
  ]
}`

    const userContent = `Yêu cầu SOẠN THẢO ban đầu: ${prompt}\n\nCác thông tin đã thu thập được (Câu trả lời hiện tại): ${JSON.stringify(answers, null, 2)}${chatMemory ? `\n\nBỐI CẢNH TỪ LỊCH SỬ CHAT TRƯỚC ĐÓ (Dùng để hiểu rõ ý định người dùng):\n${chatMemory}` : ''}`

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

        let userId = ''
        const authHeader = req.headers.get('Authorization')
        if (authHeader) {
            const tempClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
            const { data: { user } } = await tempClient.auth.getUser(authHeader.replace('Bearer ', ''))
            userId = user?.id || ''
        }

        const mergedPrompt = mergeIntakeText(prompt, intake_answers)

        // RAG CHAT MEMORY
        let chatMemory = ''
        let queryEmbedding: number[] = []
        if (userId) {
            queryEmbedding = await embedText(mergedPrompt, geminiKey, 768).catch(() => [])
            if (queryEmbedding.length > 0) {
                const memories = await retrieveChatMemory(supabase, queryEmbedding, userId, mergedPrompt).catch(() => [])
                const messageMemories = memories.filter(m => m.content_type !== 'evidence')
                if (messageMemories.length > 0) {
                    chatMemory = messageMemories.map(m => `[${m.role === 'user' ? 'Người dùng' : 'AI'}]: ${m.content}`).join('\n')
                }
            }
        }
        if (queryEmbedding.length === 0) {
            queryEmbedding = await embedText(mergedPrompt, geminiKey, 768)
        }

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

            aiCheck = await checkAICompleteness(prompt, intake_answers ?? {}, documentLabel, geminiKey, legalContext, chatMemory)
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

        // 2. Vector similarity search (top 20 law chunks for reranking phase)
        const { data: rawChunks, error } = await supabase.rpc('match_document_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3, // Lowered for more candidates
            match_count: 25,
            p_query_text: retrievalQuery // HYBRID: Add keyword matching
        })
        if (error) throw new Error(`Vector search: ${error.message}`)

        let chunks = rawChunks || []
        if (chunks.length > 5) {
            try {
                const docTexts = chunks.map((c: any) => `[${c.law_article}] ${c.content}`)
                const rankedResults = await jinaRerank(retrievalQuery, docTexts, 5)
                chunks = rankedResults.map(r => chunks[r.index]).filter(Boolean)
            } catch (err) {
                console.warn('Jina rerank failed for document chunks, fallback to dot product.', err)
                chunks = chunks.slice(0, 5)
            }
        }

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

        // 5. External Evidence (Exa Search + Reranker)
        const evidenceQueryStr = [
            mergedPrompt,
            `Mục tiêu: Soạn thảo ${documentLabel}`,
            mode !== 'draft' ? `Đoạn cần xử lý: ${selection_context?.substring(0, 500) || ''}` : ''
        ].filter(Boolean).join('\n')

        const evidence = await retrieveLegalEvidence(evidenceQueryStr, 4).catch(() => [])
        const evidenceText = evidence.map((e, index) => `[Nguồn ${index + 1}: ${e.url}]\n${e.content}`).join('\n\n---\n\n')

        const systemPrompt = `Bạn là trợ lý pháp lý Việt Nam cho workspace soạn thảo hợp đồng của LegalShield.

Nhiệm vụ:
- mode=draft: tạo bản thảo hoặc khung hợp đồng hoàn chỉnh dựa trên yêu cầu, mẫu, và cơ sở pháp lý.
- mode=clause_insert: tạo một điều khoản hoặc block nội dung để CHÈN vào bản thảo hiện có.
- mode=rewrite: viết lại chính đoạn được chọn, không viết lại toàn bộ hợp đồng.

Quy tắc:
1. Chỉ dựa trên mẫu hợp đồng, ngữ cảnh bản thảo, và cơ sở pháp lý đã cho.
2. BẮT BUỘC TRÍCH DẪN IN-LINE: Bất cứ khi nào áp dụng một thông tin từ "Tra cứu pháp lý thực tế", bạn PHẢI ghim nguồn bằng cú pháp [Nguồn X] ngay cuối câu điều khoản, ví dụ: "Bên B có quyền đơn phương chấm dứt [Nguồn 1]."
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

${chatMemory ? `BỐI CẢNH LỊCH SỬ TRAO ĐỔI (QUAN TRỌNG - PHẢI TUÂN THỦ CÁC LỰA CHỌN TRƯỚC ĐÓ CỦA NGƯỜI DÙNG):\n${chatMemory}\n\n` : ''}Mẫu hợp đồng:
${templateContent || 'Không có'}

Bản thảo hiện tại:
${current_draft || 'Chưa có'}

Đoạn đang chọn:
${selection_context || 'Không có'}

Cơ sở pháp lý (Kho nội bộ):
${legalContext || 'Không có kết quả'}

Tra cứu pháp lý thực tế & Hình thức văn bản (Dữ liệu mạng theo thời gian thực):
${evidenceText || 'Không có kết quả truy xuất phù hợp'}

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

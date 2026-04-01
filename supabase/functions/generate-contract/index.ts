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

function scorePromptCompleteness(input: string): number {
    const normalized = normalizeVietnamese(input)
    const checks = [
        /(ben a|ben b|vo|chong|cong ty|ca nhan|nguoi dai dien|dia chi|cccd|mst)/.test(normalized),
        /(dich vu|cong viec|hang hoa|tai san|thong tin mat|pham vi|muc dich|doi tuong)/.test(normalized),
        /(gia|thanh toan|phi|dat coc|cap duong|boi thuong|dong|vnd|trieu|ty)/.test(normalized),
        /(ngay|thang|nam|thoi han|tien do|tu ngay|den ngay|ban giao)/.test(normalized),
        /(phat|bao mat|chap dut|tranh chap|nuoi con|tai san chung|no chung)/.test(normalized),
    ]

    return checks.filter(Boolean).length
}

function buildClarificationPack(rule: DocumentRule, prompt: string, intakeAnswers?: Record<string, string>) {
    const merged = normalizeVietnamese(mergeIntakeText(prompt, intakeAnswers))
    const questions = rule.questions.filter((question) => {
        const label = normalizeVietnamese(question.label)
        const placeholder = normalizeVietnamese(question.placeholder)
        return !(merged.includes(label.slice(0, 12)) || merged.includes(placeholder.slice(0, 12)))
    })

    return {
        title: `Làm rõ thông tin để soạn ${toReadableLabel(rule, prompt)}`,
        description: rule.isContract
            ? 'Tôi cần thêm một số thông tin cốt lõi để soạn đúng loại hợp đồng, giảm việc hỏi qua lại nhiều lần.'
            : 'Yêu cầu này không phải hợp đồng dân sự thông thường. Tôi đã chuyển về đúng loại hồ sơ/tài liệu và gom các thông tin còn thiếu để bạn trả lời một lần.',
        questions: questions.length > 0 ? questions : rule.questions,
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
            response_mode = 'stream'
        } = await req.json() as {
            prompt: string
            template_id?: string
            mode?: DraftMode
            current_draft?: string
            selection_context?: string
            intake_answers?: Record<string, string>
            parameters?: Record<string, unknown>
            response_mode?: 'stream' | 'json'
        }
        if (!prompt) return errorResponse('Missing prompt', 400)

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
        const completenessScore = scorePromptCompleteness(mergedPrompt)
        const templateReferences = await searchTemplateReferences(documentRule, prompt).catch(() => [])

        if (response_mode === 'json' && mode === 'draft' && mismatchReason) {
            return jsonResponse({
                status: 'document_type_mismatch',
                document_type: documentRule.type,
                document_label: documentLabel,
                mismatch_reason: mismatchReason,
                clarification_pack: buildClarificationPack(documentRule, mergedPrompt, intake_answers),
                template_references: templateReferences,
                content: [
                    `Tôi nhận thấy yêu cầu này phù hợp hơn với loại tài liệu "${documentLabel}" thay vì một hợp đồng thông thường.`,
                    '',
                    mismatchReason,
                    '',
                    'Bạn chỉ cần điền một lần vào bộ câu hỏi bên dưới, sau đó tôi sẽ soạn bản nháp đúng loại hồ sơ/tài liệu cho bạn.'
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

        if (response_mode === 'json' && mode === 'draft' && completenessScore < 3) {
            return jsonResponse({
                status: 'needs_clarification',
                document_type: documentRule.type,
                document_label: documentLabel,
                clarification_pack: buildClarificationPack(documentRule, mergedPrompt, intake_answers),
                template_references: templateReferences,
                content: [
                    `Tôi có thể hỗ trợ soạn ${documentLabel}, nhưng hiện thông tin đầu vào chưa đủ để tạo bản nháp dùng được.`,
                    '',
                    'Tôi đã gom các câu hỏi cần thiết thành một bộ điền một lần. Sau khi bạn trả lời đủ, tôi sẽ tạo bản nháp hoàn chỉnh hơn.'
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

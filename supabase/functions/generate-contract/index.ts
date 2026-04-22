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
    getSemanticCache,
    jsonResponse,
    requiresLegalCitation,
    retrieveChatMemory,
    setSemanticCache,
    storeChatMemory,
    storeEvidenceInMemory,
    roundRobinKey,
    auditClaimsAgainstEvidence,
    selectBestEvidenceForClaim,
    type LegalSourceEvidence,
} from '../shared/types.ts'
import {
    retrieveLegalEvidenceProduction,
    getTopEvidenceForContract,
    hasSufficientEvidence,
    type RetrievalResult,
} from '../shared/enhanced-retrieval.ts'
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

// ─── Helper Functions for Intelligent Completeness Check ───────────────────

function mapDocumentLabelToType(label: string): string {
    const normalized = normalizeVietnamese(label).toLowerCase()
    if (normalized.includes('ly hôn') || normalized.includes('ly hon')) return 'divorce_petition'
    if (normalized.includes('thuê') || normalized.includes('thue')) return 'rental_contract'
    if (normalized.includes('dịch vụ') || normalized.includes('dich vu')) return 'service_contract'
    if (normalized.includes('mua bán') || normalized.includes('muabán') || normalized.includes('bán hàng') || normalized.includes('chuyển nhượng')) return 'sale_contract'
    if (normalized.includes('bảo mật') || normalized.includes('nda') || normalized.includes('thông tin mật')) return 'nda_contract'
    if (normalized.includes('lao động') || normalized.includes('nhân viên') || normalized.includes('lương')) return 'employment_contract'
    return 'generic_contract'
}

interface QuickRequirement {
    section: string
    format_critical: boolean
    user_must_provide: string[]
    user_can_default: string[]
}

async function getRequirementsForDocumentType(documentType: string, supabaseClient?: any, geminiKey?: string): Promise<QuickRequirement[]> {
    const requirements: Record<string, QuickRequirement[]> = {
        rental_contract: [
            { section: 'Tài sản cho thuê', format_critical: true, user_must_provide: ['Địa chỉ bất động sản'], user_can_default: ['Diện tích', 'Tình trạng'] },
            { section: 'Giá thuê', format_critical: true, user_must_provide: ['Giá tiền/tháng'], user_can_default: [] },
            { section: 'Thời hạn', format_critical: true, user_must_provide: ['Thời gian thuê (tháng/năm)'], user_can_default: [] },
            { section: 'Quyền nghĩa vụ', format_critical: true, user_must_provide: [], user_can_default: ['Áp dụng quy tắc chung'] },
        ],
        service_contract: [
            { section: 'Nội dung dịch vụ', format_critical: true, user_must_provide: ['Mô tả dịch vụ'], user_can_default: [] },
            { section: 'Giá cước', format_critical: true, user_must_provide: ['Giá dịch vụ'], user_can_default: [] },
            { section: 'Thời gian thực hiện', format_critical: true, user_must_provide: ['Thời gian hoàn thành'], user_can_default: [] },
            { section: 'Trách nhiệm', format_critical: true, user_must_provide: [], user_can_default: ['Áp dụng tiêu chuẩn ngành'] },
        ],
        divorce_petition: [
            { section: 'Thông tin cá nhân', format_critical: true, user_must_provide: [], user_can_default: ['Họ tên, CCCD, Địa chỉ (tự điền)'] },
            { section: 'Lý do ly hôn', format_critical: true, user_must_provide: ['Loại: thuận tình hay đơn phương'], user_can_default: [] },
            { section: 'Con chung', format_critical: true, user_must_provide: ['Có con chung không?'], user_can_default: [] },
            { section: 'Tài sản & Nợ', format_critical: true, user_must_provide: ['Có tài sản chung không?'], user_can_default: [] },
        ],
    }

    if (requirements[documentType] && requirements[documentType].length > 0) {
        return requirements[documentType]
    }

    // 1) Try vector database retrieval (higher trust)
    if (supabaseClient && geminiKey) {
        try {
            const embedding = await embedText(`Yêu cầu nội dung hợp đồng loại ${documentType}`, geminiKey, 768)
            if (embedding.length > 0) {
                const { data: chunks } = await supabaseClient.rpc('match_document_chunks', {
                    query_embedding: embedding,
                    match_threshold: 0.25,
                    match_count: 8,
                    p_query_text: `requirements for ${documentType}`
                })

                const textBodies = (chunks || []).map((c: any) => c.content).join('\n')
                const jsonMatch = extractJsonArray(textBodies)
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch) as Array<Partial<QuickRequirement>>
                    const normalized = parsed
                        .filter(item => item && item.section)
                        .map(item => ({
                            section: String(item.section),
                            format_critical: item.format_critical !== false,
                            user_must_provide: Array.isArray(item.user_must_provide) ? item.user_must_provide.map(String) : [],
                            user_can_default: Array.isArray(item.user_can_default) ? item.user_can_default.map(String) : [],
                        }))
                    if (normalized.length > 0) return normalized
                }
            }
        } catch (err) {
            console.warn('Vector DB requirement extraction failed:', err)
        }
    }

    // 2) Fallback to Exa search + model summarization
    try {
        const query = `Hãy mô tả các trường và yêu cầu chính định dạng phần trong hợp đồng loại ${documentType} theo luật Việt Nam (2024), trả về JSON mảng với mỗi mục giống cấu trúc { section, format_critical, user_must_provide, user_can_default }`;
        const exaResults = await exaSearch(query, '', 2)
        const candidateText = exaResults?.[0]?.content || ''

        const jsonMatch = extractJsonArray(candidateText)
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch) as Array<Partial<QuickRequirement>>
            const normalized = parsed
                .filter(item => item && item.section)
                .map(item => ({
                    section: String(item.section),
                    format_critical: item.format_critical !== false,
                    user_must_provide: Array.isArray(item.user_must_provide) ? item.user_must_provide.map(String) : [],
                    user_can_default: Array.isArray(item.user_can_default) ? item.user_can_default.map(String) : [],
                }))
            if (normalized.length > 0) return normalized
        }
    } catch (err) {
        console.warn('Dynamic requirement extraction failed, fallback to generic:', err)
    }

    return getFallbackRequirements()
}

function extractJsonArray(text: string): string | null {
    const start = text.indexOf('[')
    if (start === -1) return null

    let depth = 0
    for (let i = start; i < text.length; i += 1) {
        if (text[i] === '[') depth += 1
        if (text[i] === ']') depth -= 1
        if (depth === 0) {
            const candidate = text.slice(start, i + 1)
            try {
                JSON.parse(candidate)
                return candidate
            } catch (_e) {
                continue
            }
        }
    }

    return null
}

function getFallbackRequirements(): QuickRequirement[] {
    return [
        { section: 'Mục đích hợp đồng', format_critical: true, user_must_provide: ['Mục đích hợp đồng'], user_can_default: [] },
        { section: 'Giá trị/thanh toán', format_critical: true, user_must_provide: ['Giá trị và điều kiện thanh toán'], user_can_default: [] },
        { section: 'Thời hạn', format_critical: true, user_must_provide: ['Thời hạn hợp đồng'], user_can_default: [] },
        { section: 'Quyền và nghĩa vụ', format_critical: true, user_must_provide: ['Trách nhiệm chính các bên'], user_can_default: [] },
    ]
}

interface AnalysisResult {
    provided_terms: Set<string>
    missing_terms: string[]
}

function analyzeUserProvidedInfo(prompt: string, answers: Record<string, string>, chatMemory: string | undefined, requirements: QuickRequirement[]): AnalysisResult {
    const fullText = [prompt, JSON.stringify(answers), chatMemory || ''].join(' ').toLowerCase()
    const normalized = normalizeVietnamese(fullText)
    
    const provided = new Set<string>()
    const missing: string[] = []

    requirements.forEach(req => {
        const mustHave = req.user_must_provide
        const hasInfo = mustHave.length === 0 || mustHave.some(info => {
            const keyword = info.toLowerCase().substring(0, 10)
            return normalized.includes(normalizeVietnamese(keyword))
        })

        if (hasInfo) {
            mustHave.forEach(m => provided.add(m))
        } else {
            missing.push(...mustHave)
        }
    })

    return { provided_terms: provided, missing_terms: missing }
}

function calculateCompletion(analysis: AnalysisResult, requirements: QuickRequirement[]): number {
    const totalRequired = requirements.filter(r => r.format_critical && r.user_must_provide.length > 0).length
    const providedRequired = requirements.filter(r => {
        const mustHave = r.user_must_provide
        return mustHave.length === 0 || mustHave.every(m => analysis.provided_terms.has(m))
    }).length

    return totalRequired > 0 ? Math.round((providedRequired / totalRequired) * 100) : 100
}

function isRequirementProvided(req: QuickRequirement, analysis: AnalysisResult): boolean {
    const mustHave = req.user_must_provide
    return mustHave.length === 0 || mustHave.every(m => analysis.provided_terms.has(m))
}

function shouldStartDraftingNow(completionPercent: number, missingCount: number, iterationCount: number): { should_draft: boolean; reason: string } {
    if (completionPercent >= 80) return { should_draft: true, reason: 'Đủ 80% thông tin cần thiết' }
    if (missingCount <= 1 && iterationCount >= 2) return { should_draft: true, reason: 'Chỉ thiếu 1 thông tin, bắt đầu soạn' }
    if (iterationCount >= 3) return { should_draft: true, reason: 'Đã hỏi 3 vòng, bắt đầu soạn với chú thích' }
    return { should_draft: false, reason: 'Còn cần thêm thông tin' }
}

interface SmartQuestion {
    id: string
    label: string
    placeholder: string
    required: boolean
    help_text?: string
}

function generateSmartQuestionsFromMissing(missing: QuickRequirement[], documentType: string): SmartQuestion[] {
    const questionTemplates: Record<string, Partial<SmartQuestion>> = {
        'Tài sản cho thuê': { label: 'Bất động sản nào được cho thuê?', placeholder: 'Ví dụ: Căn hộ tại quận 1, TPHCM' },
        'Giá thuê': { label: 'Giá thuê hàng tháng bao nhiêu?', placeholder: 'Ví dụ: 5.000.000 VNĐ' },
        'Thời hạn': { label: documentType === 'rental_contract' ? 'Thời hạn thuê bao lâu?' : 'Thời hạn hiệu lực/hợp đồng?', placeholder: documentType === 'rental_contract' ? 'Ví dụ: 12 tháng' : 'Ví dụ: 6 tháng hoặc đến khi hoàn thành' },
        'Nội dung dịch vụ': { label: 'Dịch vụ gì cần thực hiện?', placeholder: 'Ví dụ: Thiết kế web' },
        'Giá cước': { label: 'Giá dịch vụ bao nhiêu?', placeholder: 'Ví dụ: 10.000.000 VNĐ' },
        'Thời gian thực hiện': { label: 'Thời gian hoàn thành dự kiến?', placeholder: 'Ví dụ: 30 ngày' },
        'Lý do ly hôn': { label: 'Ly hôn thuận tình hay không?', placeholder: 'Ví dụ: Thuận tình (cả hai đồng ý)' },
        'Con chung': { label: 'Bao nhiêu con chung?', placeholder: 'Ví dụ: 2 con' },
        'Tài sản & Nợ': { label: 'Có tài sản chung cần chia?', placeholder: 'Ví dụ: Căn hộ, xe máy, nợ...' },
    }

    const questions: Array<SmartQuestion | null> = missing.map(req => {
        const template = questionTemplates[req.section]
        if (!template) {
            return {
                id: `q_${req.section.toLowerCase().replace(/\s+/g, '_')}`,
                label: req.section,
                placeholder: req.user_must_provide[0] ? `Ví dụ: ${req.user_must_provide[0]}` : '',
                required: req.user_must_provide.length > 0,
                help_text: `Thông tin này ảnh hưởng đến cấu trúc của hợp đồng.`,
            }
        }

        return {
            id: `q_${req.section.toLowerCase().replace(/\s+/g, '_')}`,
            label: template.label || req.section,
            placeholder: template.placeholder || (req.user_must_provide[0] ? `Ví dụ: ${req.user_must_provide[0]}` : ''),
            required: req.user_must_provide.length > 0,
            help_text: `Thông tin này ảnh hưởng đến cấu trúc của hợp đồng.`,
        }
    })

    return questions.filter((q): q is SmartQuestion => q !== null)
}

function deduplicatePreviousQuestions(questions: SmartQuestion[], chatMemory: string | undefined, previousAnswers: Record<string, string>): SmartQuestion[] {
    return questions.filter(q => {
        if (previousAnswers[q.id]?.trim()) return false
        if (chatMemory?.toLowerCase().includes(q.label.toLowerCase().substring(0, 20))) return false
        return true
    })
}

function buildDraftPrompt(
    documentRule: DocumentRule,
    documentLabel: string,
    prompt: string,
    mergedPrompt: string,
    requirements: QuickRequirement[],
    topEvidence: Array<any>,
    templateContent: string,
    templateReferences: Array<any>,
    intake_answers?: Record<string,string>,
    chatMemory?: string,
    current_draft?: string,
    selection_context?: string,
    parameters?: Record<string, unknown>,
    mode: DraftMode = 'draft'
) {
    const requirementDetails = requirements.map(req => {
        const must = req.user_must_provide.length > 0 ? req.user_must_provide.join(', ') : 'Không yêu cầu thông tin bắt buộc từ người dùng'
        const optional = req.user_can_default.length > 0 ? ` (có thể mặc định: ${req.user_can_default.join(', ')})` : ''
        return `- ${req.section}: ${must}${optional}`
    }).join('\n')

    const evidenceBlock = topEvidence.length > 0 ? topEvidence.map((c, idx) => `[#${idx + 1}] ${c.title || 'No title'} - ${c.url || 'N/A'}\n${c.content}`).join('\n\n') : 'Không có cơ sở pháp lý thực tế sẵn có.'

    const refBlock = templateReferences.length > 0 ? templateReferences.map((item, index) => `${index + 1}. ${item.title} (${item.source_domain}) - ${item.url}`).join('\n') : 'Chưa có mẫu tham khảo ngoài hệ thống'

    const systemPrompt = `Bạn là trợ lý pháp lý Việt Nam cho workspace soạn thảo ${documentRule.isContract ? 'hợp đồng' : 'văn bản pháp lý'} của LegalShield.

[BẮT ĐẦU VĂN BẢN BẰNG TIÊU ĐỀ]: ${documentLabel}

[CƠ SỞ PHÁP LÝ ĐÃ XÁC THỰC (BẮT BUỘC TRÍCH DẪN)]:
${evidenceBlock}

QUY TẮC GENERATION DỰA TRÊN EVIDENCE (BẮT BUỘC):
1. **KNOWLEDGE-FIRST**: MỌI điều khoản, quy định phải dựa trên [CƠ SỞ PHÁP LÝ ĐÃ XÁC THỰC]. Không được tự ý phát minh.
2. **CITATION MANDATORY**: Mỗi điều khoản quan trọng PHẢI có trích dẫn in-line dạng [Ref #N] hoặc (Điều X, Bộ Luật Y).
3. **EVIDENCE QUALITY**: Ưu tiên nguồn official (.gov.vn, vbpl.vn) > secondary (thuvienphapluat.vn) > web.
4. **ABSTAIN IF UNCERTAIN**: Nếu không tìm thấy evidence cho một điều khoản, dùng placeholder [CHƯA CÓ THÔNG TIN: <nội dung cần bổ sung>] thay vì tự điền.
5. **CLAIM VERIFICATION**: Sau khi soạn, tự kiểm tra mỗi câu có chứa quy định pháp lý đã được hỗ trợ bởi evidence.

YÊU CẦU NGHIÊM NGẶT:
1. Ưu tiên thông tin từ [CƠ SỞ PHÁP LÝ ĐÃ XÁC THỰC].
2. BẮT BUỘC TRÍCH DẪN IN-LINE.
3. Ưu tiên dữ liệu người dùng cung cấp (intake answers + chat memory).
4. Nếu trường cần thiết thiếu, dùng placeholder [CHƯA CÓ THÔNG TIN: <Tên trường>].
5. Không tạo phần dư thừa khi mode = ${mode}.
6. Trả lời bằng tiếng Việt chuẩn pháp lý.
7. Không giải thích dài dòng không cần thiết.
8. Nếu loại tài liệu là hồ sơ không phải hợp đồng, soạn đúng loại đó.
9. Tỉ mỉ với biểu mẫu, với mỗi mục yêu cầu: ${documentRule.isContract ? 'HỢP ĐỒNG' : 'HỒ SƠ'}

Yêu cầu cấu trúc tham chiếu:
${requirementDetails}

${documentRule.isContract ? `ĐỊNH DẠNG HỢP ĐỒNG CHUẨN VIỆT NAM (BẮT BUỘC):
Output phải là markdown với cấu trúc sau (KHÔNG có Quốc hiệu/Tiêu ngữ - đã có ở header):

# HỢP ĐỒNG [TÊN LOẠI HỢP ĐỒNG]
## Số: ...../HĐ-[năm]  
*Ngày ..... tháng ..... năm ..... tại [địa điểm]*

## CĂN CỨ PHÁP LÝ
- [Liệt kê điều luật, nghị định liên quan - VD: Bộ Luật Dân sự 2015, Điều 463-481]

## CÁC BÊN THAM GIA
### BÊN A (Bên [cho thuê/cung cấp dịch vụ/bán/bên giao...])  
- Tên: [Tên đầy đủ]  
- Địa chỉ: [Địa chỉ đầy đủ]  
- Mã số thuế/CCCD: [Số]  
- Đại diện: [Họ tên], chức vụ: [Chức danh]

### BÊN B (Bên [thuê/sử dụng dịch vụ/mua/bên nhận...])  
- Tên: [Tên đầy đủ]  
- Địa chỉ: [Địa chỉ đầy đủ]  
- Mã số thuế/CCCD: [Số]  
- Đại diện: [Họ tên], chức vụ: [Chức danh]

## ĐIỀU 1. [Tên điều khoản chính]
Nội dung chi tiết...

## ĐIỀU 2. [Tên điều khoản]
...

## ĐIỀU N. ĐIỀU KHOẢN CHUNG
### 1. Hiệu lực hợp đồng
Hợp đồng có hiệu lực từ ngày ký...

### 2. Chấm dứt hợp đồng
Điều kiện chấm dứt...

### 3. Giải quyết tranh chấp
Mọi tranh chấp giải quyết thông qua thương lượng, nếu không thành thì tại Tòa án...

### 4. Cam kết
Các bên cam kết thực hiện đúng...

---
## CHỮ KÝ CÁC BÊN

**BÊN A**  
(Ký, ghi rõ họ tên, đóng dấu nếu có)

.........

**BÊN B**  
(Ký, ghi rõ họ tên, đóng dấu nếu có)

.........

Lưu ý: Sử dụng heading markdown (# ## ###) để phân cấp. Không dùng bullet point (*) cho điều khoản chính.` : `ĐỊNH DẠNG VĂN BẢN PHÁP LÝ CHUẨN:
Output phải là markdown có cấu trúc rõ ràng với heading phân cấp (# ## ###).
`}`

    const instructionText = `Chế độ: ${mode}
Loại tài liệu đích: ${documentLabel}
Yêu cầu người dùng: ${prompt}

Phiếu trả lời bổ sung:
${intake_answers ? JSON.stringify(intake_answers, null, 2) : 'Chưa có'}

Bối cảnh lịch sử trao đổi:
${chatMemory || 'Không có'}

Mẫu hợp đồng:
${templateContent || 'Không có'}

Bản thảo hiện tại:
${current_draft || 'Chưa có'}

Đoạn đang chọn:
${selection_context || 'Không có'}

Cơ sở pháp lý (nội bộ + web):
${evidenceBlock}

Mẫu tham khảo:
${refBlock}

Hãy soạn nội dung có cấu trúc rõ ràng, mục lục có đầu đề và ẩn dụ pháp lý phù hợp.`

    return { systemPrompt, instructionText }
}

async function generateContractTextFromPrompt(
    documentRule: DocumentRule,
    documentLabel: string,
    prompt: string,
    mergedPrompt: string,
    requirements: QuickRequirement[],
    topEvidence: Array<any>,
    templateContent: string,
    templateReferences: Array<any>,
    intake_answers: Record<string, string> | undefined,
    chatMemory: string | undefined,
    current_draft: string | undefined,
    selection_context: string | undefined,
    parameters: Record<string, unknown> | undefined,
    geminiKey: string
) {
    const { systemPrompt, instructionText } = buildDraftPrompt(
        documentRule,
        documentLabel,
        prompt,
        mergedPrompt,
        requirements,
        topEvidence,
        templateContent,
        templateReferences,
        intake_answers,
        chatMemory,
        current_draft,
        selection_context,
        parameters,
        'draft'
    )

    const body = {
        contents: [{
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${instructionText}` }],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }

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
    const content = generationData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    if (!content) {
        const fallbackTitle = documentRule.label || 'Hợp đồng';
        return `${fallbackTitle} mẫu ban đầu:\n${Object.entries(intake_answers ?? {}).map(([k,v]) => `- ${k}: ${v}`).join('\n')}\n\nCác điều khoản chi tiết sẽ được soạn sau.`
    }

    return content
}

function mergeIntakeText(prompt: string, intakeAnswers?: Record<string, string>) {
    const answerText = Object.entries(intakeAnswers ?? {})
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${key}: ${value.trim()}`)
        .join('\n')

    return [prompt, answerText].filter(Boolean).join('\n')
}

/**
 * NEW LOGIC: Intelligent completeness check using legal framework
 * PHASE 1: Analyze legal requirements for the document type
 * PHASE 2: Assess what user has provided
 * PHASE 3: Generate SMART questions (only what affects format)
 * PHASE 4: Decide if ready to draft
 */
async function checkAICompleteness(
    prompt: string,
    answers: Record<string, string>,
    documentLabel: string,
    geminiKey: string,
    legalRequirements?: string,
    chatMemory?: string,
    supabaseClient?: any,
    iterationCount: number = 0
) {
    try {
        // PHASE 1: Map document to type and get legal requirements
        const documentType = mapDocumentLabelToType(documentLabel)
        let requirements = await getRequirementsForDocumentType(documentType, supabaseClient, geminiKey)
        if (!requirements || requirements.length === 0) {
            requirements = getFallbackRequirements()
        }

        // PHASE 2: Analyze provided info against requirements
        const analysis = analyzeUserProvidedInfo(prompt, answers, chatMemory, requirements)
        const completionPercent = calculateCompletion(analysis, requirements)

        // PHASE 3: Determine missing critical fields
        const missingCritical = requirements.filter(
            req => req.format_critical && !isRequirementProvided(req, analysis)
        )

        // PHASE 4: Decide whether to start drafting or ask more
        const decision = shouldStartDraftingNow(completionPercent, missingCritical.length, iterationCount)
        if (decision.should_draft) {
            return {
                status: 'COMPLETE',
                completion_percent: completionPercent,
                reason: decision.reason,
                missing_count: missingCritical.length,
            }
        }

        // Generate smart questions for missing critical fields
        const smartQuestions = generateSmartQuestionsFromMissing(missingCritical, documentType)
        const dedupQuestions = deduplicatePreviousQuestions(smartQuestions, chatMemory, answers)
        const finalQuestions = dedupQuestions.slice(0, 2)

        if (finalQuestions.length === 0) {
            return {
                status: 'COMPLETE',
                completion_percent: completionPercent,
                reason: 'Không có câu hỏi thêm nào cần thiết',
                missing_count: missingCritical.length,
            }
        }

        return {
            status: 'NEEDS_INFO',
            questions: finalQuestions.map(q => ({
                id: q.id,
                label: q.label,
                placeholder: q.placeholder,
                required: q.required,
                help_text: q.help_text,
            })),
            completion_percent: completionPercent,
            missing_count: missingCritical.length,
        }
    } catch (err) {
        console.error('Intelligent Completeness Check Failed:', err)
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
    return results.slice(0, 3).map((item: LegalSourceEvidence) => ({
        title: item.title,
        url: item.url,
        source_domain: item.source_domain,
        source_type: item.source_type,
        note: item.source_type === 'official'
            ? 'Nguồn chính thống để đối chiếu biểu mẫu/quy định.'
            : 'Mẫu tham khảo từ web, cần đối chiếu lại trước khi dùng nguyên văn.',
    }))
}

export const handler = async (req: Request): Promise<Response> => {
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

        const mergedPrompt = mergeIntakeText(prompt, intake_answers)
        const documentRule = detectDocumentRule(mergedPrompt)
        const documentLabel = toReadableLabel(documentRule, prompt)
        const geminiKey = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')

        // ============================================================
        // ENHANCED EXPORT: Markdown-aware formatter for Vietnamese legal documents
        // ============================================================
        
        interface MarkdownNode {
            type: 'heading' | 'paragraph' | 'list' | 'separator' | 'signature'
            level?: number
            content: string
            items?: string[]
        }
        
        function parseMarkdownToNodes(markdown: string): MarkdownNode[] {
            const nodes: MarkdownNode[] = []
            const lines = markdown.split('\n')
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim()
                
                // Skip empty lines but add spacing
                if (!line) continue
                
                // Headings (# ## ###)
                if (line.startsWith('# ')) {
                    nodes.push({ type: 'heading', level: 1, content: line.slice(2).trim() })
                } else if (line.startsWith('## ')) {
                    nodes.push({ type: 'heading', level: 2, content: line.slice(3).trim() })
                } else if (line.startsWith('### ')) {
                    nodes.push({ type: 'heading', level: 3, content: line.slice(4).trim() })
                }
                // Horizontal rule / separator
                else if (line === '---' || line === '***') {
                    nodes.push({ type: 'separator', content: '' })
                }
                // List items
                else if (line.startsWith('- ') || line.startsWith('* ')) {
                    const listNode = nodes[nodes.length - 1]
                    if (listNode?.type === 'list') {
                        listNode.items!.push(line.slice(2).trim())
                    } else {
                        nodes.push({ type: 'list', content: '', items: [line.slice(2).trim()] })
                    }
                }
                // Signature markers
                else if (line.includes('Ký, ghi rõ họ tên') || line.startsWith('BÊN ') && line.includes('(Ký')) {
                    nodes.push({ type: 'signature', content: line })
                }
                // Regular paragraph
                else {
                    // Merge with previous paragraph if it's short
                    const prev = nodes[nodes.length - 1]
                    if (prev?.type === 'paragraph' && prev.content.length < 200 && !line.startsWith('ĐIỀU ')) {
                        prev.content += ' ' + line
                    } else {
                        nodes.push({ type: 'paragraph', content: line })
                    }
                }
            }
            
            return nodes
        }
        
        function formatVietnameseLegalText(text: string): string {
            // Normalize Vietnamese legal formatting
            return text
                .replace(/\[CHƯA CÓ THÔNG TIN:([^\]]+)\]/g, '.......') // Replace placeholders
                .replace(/\[Ref #(\d+)\]/g, '(Tham khảo $1)')
                .trim()
        }
        
        function wrapTextForPDF(text: string, maxChars = 90): string[] {
            const lines: string[] = []
            text.split('\n').forEach((rawLine) => {
                const formattedLine = formatVietnameseLegalText(rawLine)
                let current = formattedLine
                while (current.length > maxChars) {
                    // Try to break at word boundary
                    let breakPoint = maxChars
                    while (breakPoint > 0 && current[breakPoint] !== ' ') {
                        breakPoint--
                    }
                    if (breakPoint === 0) breakPoint = maxChars
                    
                    lines.push(current.slice(0, breakPoint).trim())
                    current = current.slice(breakPoint).trim()
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
            const requirements = await getRequirementsForDocumentType(documentRule.type, supabase, geminiKey)
            const topEvidence: any[] = []
            const templateReferences: any[] = []
            const templateContent = ''
            const contractText = await generateContractTextFromPrompt(
                documentRule,
                documentLabel,
                prompt,
                mergedPrompt,
                requirements,
                topEvidence,
                templateContent,
                templateReferences,
                intake_answers,
                undefined,
                current_draft,
                selection_context,
                parameters,
                geminiKey
            )
            const result: any = { content: contractText }

            if (type === 'docx' || type === 'both') {
                // Parse markdown nodes
                const nodes = parseMarkdownToNodes(contractText)
                
                // Build DOCX paragraphs from nodes
                const children: any[] = [
                    // Header - Quốc hiệu/Tiêu ngữ
                    new Paragraph({
                        text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                        heading: HeadingLevel.TITLE,
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: 'Độc lập - Tự do - Hạnh phúc',
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: '-------------------',
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 200 },
                    }),
                ]
                
                // Process each markdown node
                for (const node of nodes) {
                    switch (node.type) {
                        case 'heading':
                            children.push(new Paragraph({
                                text: formatVietnameseLegalText(node.content),
                                heading: node.level === 1 ? HeadingLevel.HEADING_1 : 
                                         node.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
                                alignment: node.level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
                                spacing: { before: 200, after: 100 },
                                bold: true,
                            }))
                            break
                            
                        case 'paragraph':
                            children.push(new Paragraph({
                                children: [new TextRun({ 
                                    text: formatVietnameseLegalText(node.content), 
                                    size: 24,
                                    font: 'Times New Roman'
                                })],
                                spacing: { after: 120, line: 360 },
                                alignment: AlignmentType.JUSTIFIED,
                            }))
                            break
                            
                        case 'list':
                            for (const item of (node.items || [])) {
                                children.push(new Paragraph({
                                    children: [new TextRun({ 
                                        text: '• ' + formatVietnameseLegalText(item), 
                                        size: 24,
                                        font: 'Times New Roman'
                                    })],
                                    spacing: { after: 80 },
                                    indent: { left: 720 },
                                }))
                            }
                            break
                            
                        case 'separator':
                            children.push(new Paragraph({
                                text: '',
                                spacing: { before: 200, after: 200 },
                            }))
                            break
                            
                        case 'signature':
                            children.push(new Paragraph({
                                children: [new TextRun({ 
                                    text: formatVietnameseLegalText(node.content), 
                                    size: 24,
                                    bold: true
                                })],
                                spacing: { before: 400, after: 100 },
                            }))
                            break
                    }
                }
                
                const doc = new Document({
                    sections: [{
                        properties: {
                            page: {
                                margin: {
                                    top: 1440,  // 1 inch
                                    right: 1440,
                                    bottom: 1440,
                                    left: 1440,
                                },
                            },
                        },
                        children,
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
                const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
                const pageWidth = 595.28
                const pageHeight = 841.89
                const margin = 50
                let page = pdfDoc.addPage([pageWidth, pageHeight])
                let y = pageHeight - margin
                
                // Parse markdown nodes
                const nodes = parseMarkdownToNodes(contractText)
                
                // Draw header - Quốc hiệu/Tiêu ngữ
                const drawHeader = () => {
                    page.drawText('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', {
                        x: pageWidth / 2 - 150,
                        y: y,
                        size: 12,
                        font: boldFont,
                        color: rgb(0, 0, 0),
                    })
                    y -= 18
                    
                    page.drawText('Độc lập - Tự do - Hạnh phúc', {
                        x: pageWidth / 2 - 100,
                        y: y,
                        size: 11,
                        font,
                        color: rgb(0, 0, 0),
                    })
                    y -= 25
                    
                    page.drawText('-------------------', {
                        x: pageWidth / 2 - 50,
                        y: y,
                        size: 10,
                        font,
                        color: rgb(0, 0, 0),
                    })
                    y -= 30
                }
                
                drawHeader()
                
                // Process each node
                for (const node of nodes) {
                    switch (node.type) {
                        case 'heading':
                            if (y < margin + 100) {
                                page = pdfDoc.addPage([pageWidth, pageHeight])
                                y = pageHeight - margin
                            }
                            
                            const isCenter = node.level === 1
                            const fontSize = node.level === 1 ? 14 : node.level === 2 ? 12 : 11
                            const useFont = node.level === 1 ? boldFont : font
                            const text = formatVietnameseLegalText(node.content)
                            const textWidth = useFont.widthOfTextAtSize(text, fontSize)
                            const x = isCenter ? (pageWidth - textWidth) / 2 : margin
                            
                            page.drawText(text, {
                                x,
                                y,
                                size: fontSize,
                                font: useFont,
                                color: rgb(0, 0, 0),
                            })
                            y -= (fontSize + 8)
                            break
                            
                        case 'paragraph':
                            const paraText = formatVietnameseLegalText(node.content)
                            const paraLines = wrapTextForPDF(paraText, 85)
                            
                            for (const line of paraLines) {
                                if (y < margin + 20) {
                                    page = pdfDoc.addPage([pageWidth, pageHeight])
                                    y = pageHeight - margin
                                }
                                page.drawText(line || ' ', {
                                    x: margin,
                                    y,
                                    size: 11,
                                    font,
                                    color: rgb(0.11, 0.11, 0.11),
                                })
                                y -= 14
                            }
                            y -= 5 // Paragraph spacing
                            break
                            
                        case 'list':
                            for (const item of (node.items || [])) {
                                if (y < margin + 20) {
                                    page = pdfDoc.addPage([pageWidth, pageHeight])
                                    y = pageHeight - margin
                                }
                                const itemText = '• ' + formatVietnameseLegalText(item)
                                const itemLines = wrapTextForPDF(itemText, 80)
                                
                                for (const line of itemLines) {
                                    if (y < margin + 20) {
                                        page = pdfDoc.addPage([pageWidth, pageHeight])
                                        y = pageHeight - margin
                                    }
                                    page.drawText(line || ' ', {
                                        x: margin + 20,
                                        y,
                                        size: 11,
                                        font,
                                        color: rgb(0.11, 0.11, 0.11),
                                    })
                                    y -= 14
                                }
                            }
                            y -= 5
                            break
                            
                        case 'separator':
                            y -= 20
                            break
                            
                        case 'signature':
                            if (y < margin + 150) {
                                page = pdfDoc.addPage([pageWidth, pageHeight])
                                y = pageHeight - margin
                            }
                            y -= 30 // Extra space before signature
                            
                            const sigText = formatVietnameseLegalText(node.content)
                            page.drawText(sigText, {
                                x: margin,
                                y,
                                size: 11,
                                font: boldFont,
                                color: rgb(0, 0, 0),
                            })
                            y -= 25
                            break
                    }
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

        // RAG CHAT MEMORY
        let chatMemory = ''
        let queryEmbedding: number[] = []
        if (userId) {
            queryEmbedding = await embedText(mergedPrompt, geminiKey, 768).catch(() => [])

            if (queryEmbedding.length > 0) {
                // Semantic cache for draft: avoid repeated generation costs
                const semCache = await getSemanticCache(supabase, queryEmbedding, 0.05).catch(() => null)
                if (semCache) {
                    return jsonResponse({ ...semCache, cached: true }, 200, 3600)
                }

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

        if (userId && intake_answers && Object.keys(intake_answers).length > 0) {
            const intakeText = Object.entries(intake_answers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n')
            const intakeEmbedding = await embedText(intakeText, geminiKey, 768).catch(() => [])
            if (intakeEmbedding.length > 0) {
                storeChatMemory(supabase, {
                    user_id: userId,
                    role: 'user',
                    content: `Các câu trả lời bổ sung: ${intakeText}`,
                    embedding: intakeEmbedding,
                }).catch((e) => console.warn('Draft intake memory save failed:', (e as Error).message))
            }
        }

        const isExplicitContractRequest = normalizeVietnamese(prompt).includes('hop dong')
            || normalizeVietnamese(prompt).includes('hợp đồng')

        const mismatchReason = !documentRule.isContract && isExplicitContractRequest
            ? `Yêu cầu của bạn nghe giống "${documentLabel}" hơn là một hợp đồng dân sự thông thường.`
            : undefined

        const templateReferences = await searchTemplateReferences(documentRule, prompt).catch(() => [])
        const force_generation = parameters?.force_generation === true

        let aiCheck: { status: string, questions?: ClarificationQuestion[] } = { status: 'COMPLETE' }
        if (!force_generation && mode === 'draft') {
            // Real-time legal requirement check to ground AI questions (applies cho cả json và stream)
            const legalRequirementSearchQuery = `nội dung bắt buộc của ${documentLabel} theo pháp luật Việt Nam mới nhất 2024 2025`
            const legalReqs = await exaSearch(legalRequirementSearchQuery, '', 3).catch(() => [])
            const legalContext = legalReqs.map((r: { title: string; content: string }) => `[${r.title}]\n${r.content}`).join('\n\n')

            aiCheck = await checkAICompleteness(prompt, intake_answers ?? {}, documentLabel, geminiKey, legalContext, chatMemory, supabase)
        }

        if (!force_generation && mode === 'draft' && (aiCheck.status === 'NEEDS_INFO' || mismatchReason) && aiCheck.questions?.length) {
            if (userId && queryEmbedding.length > 0) {
                storeChatMemory(supabase, {
                    user_id: userId,
                    role: 'assistant',
                    content: `Trợ lý yêu cầu bổ sung: ${aiCheck.questions.map((q) => `${q.label}`).join('; ')}`,
                    embedding: queryEmbedding,
                    content_type: 'message'
                }).catch((e) => console.warn('Draft clarification memory save failed:', (e as Error).message))
            }

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

        // 1. Parallel Multi-Source Retrieval: Internal Law DB + Web Exa
        console.log(`[Draft AI] Fetching legal requirements for topic: ${retrievalQuery}`)
        const exaKey = roundRobinKey('EXA_API_KEYS', 'EXA_API_KEY')

        const [internalResult, webEvidence] = await Promise.all([
            // 1a. Internal: Hybrid Search
            supabase.rpc('match_document_chunks', {
                query_embedding: queryEmbedding,
                match_threshold: 0.3,
                match_count: 15,
                p_query_text: retrievalQuery
            }).then(({ data }: { data: any[] | null }) => (data || []).map((c: any) => ({
                content: c.content,
                title: `Official Law: ${c.law_article || 'Văn bản pháp luật'}`,
                url: `internal-law://${c.id}`,
                source_type: 'official' as const
            }))),
            // 1b. External: Web Search  
            exaSearch(retrievalQuery, '', 6).catch(() => [])
        ]);

        // 2. ENHANCED: Production-grade retrieval pipeline
        console.log(`[Draft AI] Running enhanced retrieval pipeline...`);
        
        let retrievalResult: RetrievalResult;
        try {
            retrievalResult = await retrieveLegalEvidenceProduction(retrievalQuery, supabase, {
                requireOfficial: true,
                minResults: 3,
                maxResults: 3,
            });
            
            // Log quality metrics
            console.log(`[Draft AI] Retrieval complete: Authority=${retrievalResult.authorityScore}, Coverage=${retrievalResult.coverageScore}, Official=${retrievalResult.hasOfficialSource}`);
            
        } catch (err) {
            console.warn('[Draft AI] Enhanced retrieval failed, fallback to basic:', err);
            // Fallback: use internal + web results directly
            const fallbackEvidence = [...internalResult, ...webEvidence].slice(0, 3).map((e: any) => ({
                title: e.title || 'Không có tiêu đề',
                url: e.url || 'N/A',
                content: e.content || '',
                source_domain: e.source_domain || '',
                source_type: e.source_type || 'secondary',
                retrieved_at: new Date().toISOString(),
            }));
            
            retrievalResult = {
                evidence: fallbackEvidence,
                topEvidence: fallbackEvidence,
                authorityScore: 50,
                coverageScore: 50,
                hasOfficialSource: fallbackEvidence.some(e => e.source_type === 'official'),
                retrievalMetadata: {
                    vectorCount: internalResult.length,
                    webCount: webEvidence.length,
                    rerankedCount: fallbackEvidence.length,
                    avgRelevanceScore: 50,
                },
            };
        }
        
        // Validate evidence sufficiency
        const sufficiency = hasSufficientEvidence(retrievalResult.topEvidence, 1);
        if (!sufficiency.sufficient) {
            console.warn(`[Draft AI] Evidence quality warning: ${sufficiency.reason}`);
        }
        
        const topEvidence = retrievalResult.topEvidence;

        // 3. Build Unified Context
        const unifiedLegalContext = topEvidence
            .map((c, idx) => `[Evidence #${idx + 1}: ${c.title}]\nURL: ${c.url || 'N/A'}\nContent: ${c.content}`)
            .join('\n\n---\n\n');

        // 4. Fetch template if specified
        let templateContent = ''
        if (template_id) {
            const { data: t } = await supabase.from('templates').select('content_md').eq('id', template_id).single()
            templateContent = t?.content_md ?? ''
        }

        const requirements = await getRequirementsForDocumentType(documentRule.type, supabase, geminiKey)
        const { systemPrompt, instructionText } = buildDraftPrompt(
            documentRule,
            documentLabel,
            prompt,
            mergedPrompt,
            requirements,
            topEvidence,
            templateContent,
            templateReferences,
            intake_answers,
            chatMemory,
            current_draft,
            selection_context,
            parameters,
            mode
        )

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
            let content = generationData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

            if (!content) {
                // Nếu Gemini trả về trống, fallback sang template có thể điền từ intake_answers
                const fallbackObj = intake_answers && Object.keys(intake_answers).length > 0 ? intake_answers : { note: 'Vui lòng cung cấp thêm thông tin để hoàn thiện hợp đồng.' }
                content = `Hợp đồng mẫu ban đầu:\n` +
                    `${Object.entries(fallbackObj).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n` +
                    `Các điều khoản chi tiết sẽ được soạn sau khi nhận đủ thông tin.`
            }

            const requiresCitation = requiresLegalCitation(`${mergedPrompt}\n${content}`)
            
            // VALIDATION LAYER: Verify claims against evidence
            console.log(`[Draft AI] Running claim validation...`)
            const claimAudit = auditClaimsAgainstEvidence(content, topEvidence as any)
            const unsupportedClaims = claimAudit.filter(a => !a.supported)
            
            if (unsupportedClaims.length > 0) {
                console.warn(`[Draft AI] Found ${unsupportedClaims.length} unsupported claims:`, 
                    unsupportedClaims.map(c => c.claim.slice(0, 100)))
            }
            
            // If too many unsupported claims, add warning to content
            if (unsupportedClaims.length >= 3) {
                content += '\n\n---\n**Lưu ý**: Một số điều khoản trong bản soạn thảo cần được xác thực thêm với luật sư.'
            }
            
            const payload = buildLegalAnswerPayload(content, topEvidence as any, requiresCitation)
            
            // Add claim audit to payload
            payload.claim_audit = claimAudit

            if (userId && queryEmbedding.length > 0) {
                await setSemanticCache(supabase, mergedPrompt, queryEmbedding, {
                    status: 'ok',
                    document_type: documentRule.type,
                    document_label: documentLabel,
                    content: payload.answer,
                    citations: payload.citations,
                    evidence: payload.evidence,
                    verification_status: payload.verification_status,
                    verification_summary: payload.verification_summary,
                }).catch((e) => console.warn('Draft semantic cache write failed:', (e as Error).message))

                storeChatMemory(supabase, {
                    user_id: userId,
                    role: 'user',
                    content: mergedPrompt,
                    embedding: queryEmbedding,
                }).catch((e) => console.warn('Draft user memory save failed:', (e as Error).message))

                const answerEmbedding = await embedText(payload.answer, geminiKey, 768).catch(() => [])
                if (answerEmbedding.length > 0) {
                    storeChatMemory(supabase, {
                        user_id: userId,
                        role: 'assistant',
                        content: payload.answer.slice(0, 800),
                        embedding: answerEmbedding,
                    }).catch((e) => console.warn('Draft assistant memory save failed:', (e as Error).message))
                }

                storeEvidenceInMemory(supabase, userId, topEvidence as any).catch((e) => console.warn('Draft evidence memory save failed:', (e as Error).message))
            }

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

        let geminiRes: Response | null = null
        let lastError: any = null
        for (let i = 0; i < 5; i++) {
            try {
                const key = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
                geminiRes = await fetch(`${GEMINI_URL}?key=${key}&alt=sse`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                if (geminiRes.ok) break
                const errText = await geminiRes.text()
                console.warn(`[SSE Retry ${i}/5] Failed: ${errText.slice(0, 100)}`)
                lastError = new Error(`Gemini SSE error: ${errText}`)
            } catch (e) {
                lastError = e
                console.warn(`[SSE Retry ${i}/5] Network error:`, e)
            }
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)))
        }

        if (!geminiRes || !geminiRes.ok) throw lastError || new Error(`Failed to connect to Gemini SSE`)

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
}

export {
    checkAICompleteness,
    getRequirementsForDocumentType,
    analyzeUserProvidedInfo,
    generateSmartQuestionsFromMissing,
    deduplicatePreviousQuestions,
    buildDraftPrompt,
}

serve(handler)

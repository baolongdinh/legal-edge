// Intelligent Question Generator: Tạo câu hỏi dựa trên pháp luật thực tế, không hardcoded
// Chỉ hỏi những thông tin ảnh hưởng đến format của tài liệu

import type { LegalRequirement, DocumentTypeAnalysis } from './legal-analyzer.ts'
import type { ConversationMemory } from './conversation-memory.ts'
import {
    recordQuestionAsked,
    hasQuestionBeenAnswered,
    getTimesQuestionAsked,
} from './conversation-memory.ts'

export interface SmartQuestion {
    id: string
    label: string
    placeholder: string
    legal_basis: string // Để user hiểu tại sao phải trả lời
    required: boolean
    follows_up_question?: string // Câu hỏi kế tiếp dựa trên câu trả lời này
    help_text?: string
}

/**
 * CORE: Tạo câu hỏi thông minh dựa trên pháp luật và missing info
 * Input: Những requirement nào thiếu + requirements nào format-critical
 * Output: Chỉ 2-3 câu hỏi thực sự cần thiết, không phải 10 câu generic
 * 
 * TRACK: Tự động ghi nhận vào memory những câu hỏi sắp hỏi
 */
export function generateSmartQuestions(
    analysis: DocumentTypeAnalysis,
    missingRequirements: LegalRequirement[],
    memory?: ConversationMemory
): SmartQuestion[] {
    const questions: SmartQuestion[] = []

    // Ưu tiên: hỏi những format-critical requirement trước
    const priority = missingRequirements.filter(r => r.format_critical)

    if (priority.length === 0) {
        // Tất cả format-critical đã có, không cần hỏi gì thêm
        return []
    }

    // Giới hạn chỉ 2-3 câu hỏi, không phải 10
    const topPriority = priority.slice(0, 3)

    topPriority.forEach(req => {
        const question = createQuestionFromRequirement(req, analysis.document_type)
        if (question) {
            // MEMORY: Ghi nhận câu hỏi sắp hỏi
            if (memory) {
                recordQuestionAsked(memory, question, 'initial')
            }
            questions.push(question)
        }
    })

    return questions
}

/**
 * Tạo 1 câu hỏi từ 1 requirement
 * Biến yêu cầu pháp lý thành câu hỏi dân dã cho user
 */
function createQuestionFromRequirement(
    requirement: LegalRequirement,
    documentType: string
): SmartQuestion | null {
    // Mapping: requirement section → user-friendly question
    const questionTemplates: Record<string, Partial<SmartQuestion>> = {
        'Tài sản cho thuê': {
            label: 'Bất động sản nào được cho thuê?',
            placeholder: 'Ví dụ: Căn hộ tại 123 Nguyễn Huệ, Q.1, TPHCM',
            help_text: 'Địa chỉ này sẽ ảnh hưởng đến tiêu đề và phần định danh tài sản.',
        },
        'Giá thuê & Danh sách thanh toán': {
            label: 'Giá thuê hàng tháng bao nhiêu?',
            placeholder: 'Ví dụ: 5.000.000 VNĐ/tháng, hoặc để trống nếu chưa thỏa thuận',
            help_text: 'Giá ảnh hưởng đến khoản thanh toán và phí trong hợp đồng.',
        },
        'Thời hạn hợp đồng': {
            label: 'Thời hạn thuê (tính bằng tháng hay năm)?',
            placeholder: 'Ví dụ: 12 tháng, 2 năm, hoặc "không xác định"',
            help_text: 'Thời hạn định ra ngày kết thúc hợp đồng.',
        },
        'Dịch vụ / Nội dung công việc': {
            label: 'Dịch vụ hoặc công việc cần thực hiện là gì?',
            placeholder: 'Ví dụ: Thiết kế bài đăng quảng cáo trên Facebook, Dạy kèm tiếng Anh...',
            help_text: 'Mô tả này là nền tảng của toàn bộ hợp đồng.',
        },
        'Giá và điều kiện thanh toán': {
            label: 'Giá trị dịch vụ và cách thanh toán?',
            placeholder: 'Ví dụ: 10.000.000 VNĐ, thanh toán 50% trước, 50% sau khi xong',
            help_text: 'Giá và hình thức thanh toán là yếu tố kinh tế chính của hợp đồng.',
        },
        'Thời gian thực hiện': {
            label: 'Khoảng thời gian hoàn thành dự kiến?',
            placeholder: 'Ví dụ: 30 ngày, 1 tháng, 15 ngày từ khi ký',
            help_text: 'Thời hạn định ra các mốc thanh toán và trách nhiệm.',
        },
        'Con chung': {
            label: 'Bên nào sẽ nuôi con chung? Bao nhiêu con?',
            placeholder: 'Ví dụ: Bà nuôi 2 con (12 tuổi & 9 tuổi)',
            help_text: 'Điều này ảnh hưởng đến phần cấp dưỡng và quyền thăm con.',
        },
        'Tài sản & Nợ': {
            label: 'Có tài sản hoặc nợ chung cần chia không?',
            placeholder: 'Ví dụ: Căn hộ chung, xe máy, nợ ngân hàng... hoặc "không"',
            help_text: 'Nếu có tài sản chung, cần chi tiết hơn để chia sẻ công bằng.',
        },
        'Lý do ly hôn': {
            label: 'Ly hôn thuận tình hay đơn phương?',
            placeholder: 'Ví dụ: Thuận tình (cả hai đồng ý), hoặc có bên không đồng ý',
            help_text: 'Điều này ảnh hưởng đến loại đơn và yêu cầu chứng minh.',
        },
        'Thông tin cá nhân': {
            label: 'Bạn cần người nào ký hợp đồng (bên nào)?',
            placeholder: 'Ví dụ: Người cho thuê, Nhà thầu, Bà nuôi con... Tên & Địa chỉ',
            help_text: 'Chi tiết này để người dùng tự điền vào hợp đồng sau.',
        },
    }

    const template = questionTemplates[requirement.section]
    if (!template) return null

    return {
        id: `question_${requirement.section.toLowerCase().replace(/\s+/g, '_')}`,
        label: template.label || '',
        placeholder: template.placeholder || '',
        legal_basis: requirement.legal_basis,
        required: requirement.user_must_provide.length > 0,
        help_text: template.help_text,
    }
}

/**
 * FOLLOW-UP LOGIC: Nếu user trả lời "Con chung", tiếp theo hỏi "Cấp dưỡng bao nhiêu"
 * Tránh hỏi những thông tin user không cần thiết
 * 
 * TRACK: Ghi nhận vào memory với context='follow-up'
 */
export function generateFollowUpQuestions(
    previousAnswer: string,
    previousQuestionId: string,
    requirements: LegalRequirement[],
    memory?: ConversationMemory
): SmartQuestion[] {
    // VD: User trả lời "Có 2 con"
    // → Tiếp theo hỏi "Mức cấp dưỡng hàng tháng bao nhiêu?"

    const followUpMap: Record<string, string[]> = {
        'question_con_chung': ['Cấp dưỡng con', 'Quyền thăm con'],
        'question_tài_sản_nợ': ['Tài sản & Nợ'],
        'question_thời_gian_thực_hiện': ['Thời gian thực hiện'],
    }

    const followUpSections = followUpMap[previousQuestionId] || []
    const relatedReqs = requirements.filter(r => followUpSections.includes(r.section))

    const questions = relatedReqs
        .map(req => createQuestionFromRequirement(req, ''))
        .filter((q): q is SmartQuestion => q !== null)

    // MEMORY: Track follow-up questions
    if (memory) {
        questions.forEach(q => {
            recordQuestionAsked(memory, q, 'follow-up')
        })
    }

    return questions
}

/**
 * DEDUPLICATION: Kiểm tra xem user đã trả lời câu hỏi này trước đó chưa
 * Sử dụng ConversationMemory để track - không hỏi lại câu đã hỏi
 * 
 * Logic:
 * 1. Nếu câu hỏi đã hỏi và user trả lời rồi → Skip
 * 2. Nếu câu hỏi đã hỏi 2 lần mà user không trả lời → Skip (hỏi lại ở follow-up)
 * 3. Nếu câu hỏi chưa hỏi bao giờ → Include
 */
export function deduplicateQuestions(
    newQuestions: SmartQuestion[],
    memory: ConversationMemory
): SmartQuestion[] {
    return newQuestions.filter(q => {
        // Check 1: User đã trả lời câu hỏi này chưa?
        if (hasQuestionBeenAnswered(memory, q.id)) {
            console.log(`[DeDup] Skipping "${q.label}" - already answered`)
            return false
        }

        // Check 2: Đã hỏi quá 2 lần mà không trả lời? Skip để tránh spam
        const timesAsked = getTimesQuestionAsked(memory, q.id)
        if (timesAsked >= 2) {
            console.log(`[DeDup] Skipping "${q.label}" - asked ${timesAsked} times without answer`)
            return false
        }

        // Question này OK để hỏi
        return true
    })
}

/**
 * UTILITY: Tính tỷ lệ hoàn chỉnh dựa trên câu hỏi đã được trả lời
 */
export function calculateCompletenessPercent(
    totalRequiredQuestions: number,
    answeredQuestions: number
): number {
    if (totalRequiredQuestions === 0) return 100
    return Math.min(100, Math.round((answeredQuestions / totalRequiredQuestions) * 100))
}

/**
 * Decision: Khi nào thì dừng hỏi và bắt đầu soạn thảo?
 * - Nếu có tất cả format-critical info → START DRAFT
 * - Nếu missing < 2 info → START DRAFT với annotation
 * - Nếu missing >= 2 info → Tiếp tục hỏi
 * 
 * TRACK: Log decision vào memory để debug
 */
export function shouldStartDrafting(
    memory: ConversationMemory,
    missingCriticalCount: number,
    maxIterations: number = 3
): {
    should_draft: boolean
    reason: string
    missing_info?: string[]
} {
    const completenessPercent = memory.completion_percent
    const iterationCount = memory.iteration_count

    // Quy tắc: Dừng hỏi thêm nếu:
    // 1. User đã trả lời 80%+ thông tin cần thiết
    if (completenessPercent >= 80) {
        return {
            should_draft: true,
            reason: `✅ Đủ ${completenessPercent}% thông tin cần thiết`,
        }
    }

    // 2. Hoặc chỉ còn thiếu <= 1 info và đã hỏi 2 lần
    if (missingCriticalCount <= 1 && iterationCount >= 2) {
        return {
            should_draft: true,
            reason: `✅ Chỉ còn thiếu ${missingCriticalCount} thông tin, bắt đầu soạn thảo với chú thích`,
            missing_info: memory.missing_requirements.map(r => r.section),
        }
    }

    // 3. Hoặc đã hỏi quá maxIterations vòng (tránh loop vô hạn)
    if (iterationCount >= maxIterations) {
        return {
            should_draft: true,
            reason: `⚠️  Đã hỏi ${iterationCount} vòng, soạn thảo draft với chú thích [CẦN XÁC NHẬN]`,
            missing_info: memory.missing_requirements.map(r => r.section),
        }
    }

    return {
        should_draft: false,
        reason: `📝 Còn thiếu ${missingCriticalCount} thông tin quan trọng (Iteration ${iterationCount}/${maxIterations})`,
        missing_info: memory.missing_requirements.slice(0, 3).map(r => r.section),
    }
}

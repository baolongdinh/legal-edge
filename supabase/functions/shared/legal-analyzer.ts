// Legal Analyzer: Intelligent document requirement analyzer based on Vietnamese law
// Phân tích yêu cầu pháp lý thực tế thay vì hardcoded rules

import { buildLegalAnswerPayload, retrieveLegalEvidence } from './types.ts'
import { jinaRerank } from './types.ts'

export interface LegalRequirement {
    section: string // VD: "Định danh bên"
    format_critical: boolean // Có ảnh hưởng đến format hợp đồng không?
    legal_basis: string // VD: "Bộ Luật Dân sự 2015, Điều 72"
    key_elements: string[] // VD: ["Họ tên", "Địa chỉ", "Số ĐT"]
    user_must_provide: string[] // Thông tin user PHẢI cung cấp
    user_can_default: string[] // Thông tin có thể để trống (dấu .......)
}

export interface DocumentTypeAnalysis {
    document_type: string
    legal_basis: string // VD: "Luật Giao dịch điện tử 2005", "Bộ Luật Dân sự 2015"
    format_requirements: LegalRequirement[]
    critical_info_needed: string[] // Chỉ những info này mới cần hỏi
    optional_info: string[] // Có thể bỏ qua
    draft_estimation: number // Phần trăm hoàn chỉnh nếu có những info này
}

/**
 * PHASE 1: Analyze document type and extract legal requirements from database
 * Không hỏi user ngay, trước hết tìm hiểu pháp luật cần những gì
 */
export async function analyzeDocumentRequirements(
    documentType: string,
    userPrompt: string,
    supabaseClient: any,
): Promise<DocumentTypeAnalysis> {
    // Step 1: Tìm legal framework cho document type này
    const legalQuery = `Yêu cầu pháp lý để soạn ${documentType}. Những mục nào bắt buộc theo pháp luật Việt Nam?`
    
    const legalEvidence = await retrieveLegalEvidence(
        legalQuery,
        supabaseClient,
        6 // Lấy 6 documents về yêu cầu pháp lý
    )

    // Step 2: Rerank để lấy những documents liên quan nhất
    const rankedEvidence = await jinaRerank(
        legalQuery,
        legalEvidence.map(e => e.content),
        3
    )

    // Step 3: Parse requirements từ legal documents
    const requirements = extractRequirementsFromLaw(
        documentType,
        userPrompt,
        rankedEvidence
    )

    return {
        document_type: documentType,
        legal_basis: extractLegalBasis(rankedEvidence),
        format_requirements: requirements,
        critical_info_needed: extractCriticalInfo(requirements),
        optional_info: extractOptionalInfo(requirements),
        draft_estimation: calculateEstimation(requirements),
    }
}

/**
 * Parse legal documents để tìm format-critical requirements
 * Ví dụ: "Theo Bộ Luật Dân sự, hợp đồng phải có [chữ ký, ngày, tên bên, giá trị]"
 */
function extractRequirementsFromLaw(
    documentType: string,
    userPrompt: string,
    legalDocuments: string[]
): LegalRequirement[] {
    const requirements: LegalRequirement[] = []

    // VD: Với hợp đồng thuê nhà, pháp luật yêu cầu:
    const documentTypeRules: Record<string, Partial<LegalRequirement>[]> = {
        'rental_contract': [
            {
                section: 'Định danh bên',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 72',
                key_elements: ['Bên cho thuê', 'Bên thuê'],
                user_must_provide: [],
                user_can_default: ['Họ tên, CCCD, Địa chỉ cụ thể'],
            },
            {
                section: 'Tài sản cho thuê',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 477',
                key_elements: ['Địa chỉ bất động sản', 'Diện tích', 'Tình trạng'],
                user_must_provide: ['Địa chỉ bất động sản'],
                user_can_default: ['Diện tích chính xác', 'Tình trạng chi tiết'],
            },
            {
                section: 'Giá thuê & Danh sách thanh toán',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 486',
                key_elements: ['Giá tiền', 'Hình thức thanh toán', 'Chu kỳ'],
                user_must_provide: ['Giá thuê', 'Hình thức thanh toán'],
                user_can_default: [],
            },
            {
                section: 'Thời hạn hợp đồng',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 476',
                key_elements: ['Ngày bắt đầu', 'Ngày kết thúc'],
                user_must_provide: ['Thời hạn thuê tính bằng tháng/năm'],
                user_can_default: [],
            },
            {
                section: 'Quyền và nghĩa vụ của bên thuê',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 487-490',
                key_elements: ['Quyền sử dụng', 'Bảo hiểm', 'Sửa chữa'],
                user_must_provide: [],
                user_can_default: ['Áp dụng quy tắc chung'],
            },
            {
                section: 'Điều kiện chấm dứt hợp đồng',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 495-498',
                key_elements: ['Lý do chấm dứt', 'Thực hiện phục hồi'],
                user_must_provide: [],
                user_can_default: ['Áp dụng quy tắc chung'],
            },
        ],
        'service_contract': [
            {
                section: 'Định danh bên',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 533',
                key_elements: ['Bên cung cấp dịch vụ', 'Bên nhận dịch vụ'],
                user_must_provide: [],
                user_can_default: ['Chi tiết từng bên'],
            },
            {
                section: 'Dịch vụ / Nội dung công việc',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 535',
                key_elements: ['Mô tả dịch vụ', 'Kết quả mong muốn'],
                user_must_provide: ['Chi tiết dịch vụ được cung cấp'],
                user_can_default: [],
            },
            {
                section: 'Giá và điều kiện thanh toán',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 534',
                key_elements: ['Tổng giá trị', 'Hình thức/Thời điểm thanh toán'],
                user_must_provide: ['Giá dịch vụ'],
                user_can_default: [],
            },
            {
                section: 'Thời hạn thực hiện',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 537',
                key_elements: ['Ngày bắt đầu', 'Ngày kết thúc', 'Các mốc'],
                user_must_provide: ['Thời gian khoảng mong muốn'],
                user_can_default: [],
            },
            {
                section: 'Trách nhiệm & Bảo hành',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 537-543',
                key_elements: ['Cam kết chất lượng', 'Bảo hành', 'Xử lý khiếu nại'],
                user_must_provide: [],
                user_can_default: ['Áp dụng tiêu chuẩn ngành'],
            },
            {
                section: 'Điều kiện chấm dứt',
                format_critical: true,
                legal_basis: 'Bộ Luật Dân sự 2015, Điều 536',
                key_elements: ['Lý do chấm dứt', 'Phí dừa sớm'],
                user_must_provide: [],
                user_can_default: ['Quy tắc chung'],
            },
        ],
        'divorce_petition': [
            {
                section: 'Thông tin cá nhân',
                format_critical: true,
                legal_basis: 'Bộ Luật Hôn nhân & Gia đình 2014, Điều 55',
                key_elements: ['Họ tên', 'Ngày sinh', 'Địa chỉ'],
                user_must_provide: [],
                user_can_default: ['Tất cả - để người dùng tự điền'],
            },
            {
                section: 'Thông tin hôn nhân',
                format_critical: true,
                legal_basis: 'Bộ Luật Hôn nhân & Gia đình 2014, Điều 64',
                key_elements: ['Ngày kết hôn', 'Chứng thực hôn nhân'],
                user_must_provide: ['Ngày kết hôn'],
                user_can_default: ['Chứng thực ID rõ ràng'],
            },
            {
                section: 'Lý do ly hôn',
                format_critical: true,
                legal_basis: 'Bộ Luật Hôn nhân & Gia đình 2014, Điều 56',
                key_elements: ['Lý do ly hôn', 'Thời gian sống chung'],
                user_must_provide: ['Lý do chung chung'],
                user_can_default: ['Chi tiết cụ thể'],
            },
            {
                section: 'Con chung',
                format_critical: true,
                legal_basis: 'Bộ Luật Hôn nhân & Gia đình 2014, Điều 65, 86-89',
                key_elements: ['Số lượng con', 'Tên con', 'Ngày sinh con', 'Ai nuôi con'],
                user_must_provide: ['Thỏa thuận về con chung (nếu có)'],
                user_can_default: [],
            },
            {
                section: 'Tài sản & Nợ',
                format_critical: true,
                legal_basis: 'Bộ Luật Hôn nhân & Gia đình 2014, Điều 68-75',
                key_elements: ['Danh sách tài sản chung', 'Danh sách nợ', 'Hình thức chia'],
                user_must_provide: ['Có thỏa thuận chia tài sản không?'],
                user_can_default: [],
            },
            {
                section: 'Cấp dưỡng con',
                format_critical: true,
                legal_basis: 'Bộ Luật Hôn nhân & Gia đình 2014, Điều 91, 112',
                key_elements: ['Số tiền hàng tháng', 'Hình thức thanh toán', 'Thời hạn'],
                user_must_provide: ['Mức cấp dưỡng (nếu không thỏa thuận)'],
                user_can_default: [],
            },
        ],
    }

    const rules = documentTypeRules[documentType] || []
    return rules.map(rule => ({
        section: rule.section || '',
        format_critical: rule.format_critical ?? true,
        legal_basis: rule.legal_basis || '',
        key_elements: rule.key_elements || [],
        user_must_provide: rule.user_must_provide || [],
        user_can_default: rule.user_can_default || [],
    }))
}

/**
 * Tìm cơ sở pháp lý từ documents đã rerank
 */
function extractLegalBasis(documents: string[]): string {
    // VD: "Bộ Luật Dân sự 2015, Bộ Luật Hôn nhân & Gia đình 2014"
    const basis = new Set<string>()
    documents.forEach(doc => {
        const matches = doc.match(/Bộ Luật \w+[^.,;]*/g)
        matches?.forEach(m => basis.add(m.trim()))
    })
    return Array.from(basis).slice(0, 3).join(', ')
}

/**
 * Chỉ lấy thông tin mà user PHẢI cung cấp để format đúng
 */
function extractCriticalInfo(requirements: LegalRequirement[]): string[] {
    return requirements
        .filter(r => r.format_critical && r.user_must_provide.length > 0)
        .flatMap(r => r.user_must_provide)
        .filter((v, i, a) => a.indexOf(v) === i) // unique
}

function extractOptionalInfo(requirements: LegalRequirement[]): string[] {
    return requirements
        .flatMap(r => r.user_can_default)
        .filter((v, i, a) => a.indexOf(v) === i) // unique
}

/**
 * Tính % hoàn chỉnh nếu đã có những critical info này
 */
function calculateEstimation(requirements: LegalRequirement[]): number {
    const critical = requirements.filter(r => r.format_critical)
    return critical.length > 0 ? Math.round((critical.length / requirements.length) * 100) : 0
}

/**
 * PHASE 2: Xác định user đã cung cấp những gì
 */
export function analyzeUserInput(
    userPrompt: string,
    answers: Record<string, string>,
    requirements: LegalRequirement[]
): {
    provided_info: string[]
    missing_critical: LegalRequirement[]
    completion_percent: number
} {
    const provided = new Set<string>()

    // Duyệt qua tất cả requirement, xem user đã trả lời chưa
    const missing = requirements.filter(req => {
        const mustHave = req.user_must_provide
        const hasSomeInfo = mustHave.some(info => {
            // Kiểm tra user prompt + answers có chứa thông tin này không
            const normalized = (userPrompt + JSON.stringify(answers)).toLowerCase()
            return normalized.includes(info.toLowerCase().substring(0, 10))
        })

        if (hasSomeInfo) {
            mustHave.forEach(info => provided.add(info))
            return false
        }
        return true
    })

    const totalRequired = requirements.filter(r => r.format_critical).length
    const completionPercent =
        totalRequired > 0
            ? Math.round(((totalRequired - missing.length) / totalRequired) * 100)
            : 0

    return {
        provided_info: Array.from(provided),
        missing_critical: missing.filter(r => r.format_critical),
        completion_percent: completionPercent,
    }
}

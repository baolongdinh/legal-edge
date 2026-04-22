// Evidence Synthesis: Tổng hợp thông tin pháp lý từ nhiều nguồn thành structured evidence
// Không dump raw text vào Gemini, mà phân loại, rerank, tổng hợp thành khung rõ ràng

import { jinaRerank } from './types.ts'

export interface EvidenceSource {
    type: 'official' | 'secondary' | 'template' | 'vector_db' | 'full_text'
    title: string
    content: string
    authority_level: 'high' | 'medium' | 'low' // Official source, secondary source, or example
    relevance_score: number // 0-100
    citation?: {
        source: string
        url?: string
        law_reference?: string // VD: "Điều 72, Bộ Luật Dân sự 2015"
    }
}

export interface SynthesizedEvidence {
    legal_framework: string // "Căn cứ pháp lý"
    requirement_sections: {
        section_name: string
        requirement: string
        legal_basis: string
        suggested_clauses: string[]
    }[]
    key_clauses_to_include: string[]
    warning_points: string[] // Những điểm cần đặc biệt chú ý theo pháp luật
    draft_skeleton: string // Template framework để Gemini sử dụng
}

/**
 * PHASE 1: Tìm kiếm bằng 3 cách khác nhau (vector, fulltext, external)
 * Mỗi cách tìm ra 3-5 kết quả, tổng cộng 9-15 documents
 */
export async function searchEvidenceFromMultipleSources(
    documentType: string,
    userPrompt: string,
    supabaseClient: any,
    exaSearchFn: (query: string) => Promise<any[]> = null
): Promise<EvidenceSource[]> {
    const allEvidence: EvidenceSource[] = []

    // 1. Vector Search: Tìm từ documents đã embedding trong DB
    const vectorQuery = `${documentType}: ${userPrompt}`.substring(0, 200)
    const vectorResults = await supabaseClient
        .rpc('match_documents', {
            query_embedding: await embedText(vectorQuery),
            match_threshold: 0.75,
            match_count: 5,
        })
        .then((result: any) => result.data || [])

    vectorResults.forEach((doc: any) => {
        allEvidence.push({
            type: 'vector_db',
            title: doc.file_name || `Vector Match: ${doc.created_at}`,
            content: doc.content,
            authority_level: 'medium',
            relevance_score: 0, // Will be set by reranking
            citation: {
                source: doc.source || 'Document Database',
                url: doc.url,
            },
        })
    })

    // 2. Full-Text Search: Tìm theo keyword chính xác
    const keywords = extractKeywords(documentType, userPrompt)
    const fullTextQuery = keywords.map(k => `"${k}"`).join(' OR ')

    const fullTextResults = await supabaseClient
        .from('document_chunks')
        .select('file_name, content, source_url')
        .textSearch('content', fullTextQuery, { config: 'vietnamese' })
        .limit(5)
        .then((result: any) => result.data || [])

    fullTextResults.forEach((doc: any) => {
        allEvidence.push({
            type: 'full_text',
            title: doc.file_name,
            content: doc.content,
            authority_level: 'high',
            relevance_score: 0,
            citation: {
                source: doc.file_name,
                url: doc.source_url,
            },
        })
    })

    // 3. External Search (Exa Search): Tìm từ các nguồn chính thức ngoài
    if (exaSearchFn) {
        const exaQuery = `${documentType} pháp luật Việt Nam site:vnlex.vn OR site:moj.gov.vn OR site:luatphapluat.com`
        const exaResults = await exaSearchFn(exaQuery).catch(() => [])

        exaResults.slice(0, 3).forEach((doc: any) => {
            allEvidence.push({
                type: doc.source_type === 'official' ? 'official' : 'secondary',
                title: doc.title,
                content: doc.description || doc.url,
                authority_level: doc.source_type === 'official' ? 'high' : 'medium',
                relevance_score: 0,
                citation: {
                    source: doc.source_domain,
                    url: doc.url,
                },
            })
        })
    }

    return allEvidence
}

/**
 * PHASE 2: Rerank tất cả evidence theo relevance điểm
 * Dùng Jina reranking để sắp xếp từ relevant nhất
 */
export async function rankEvidenceByRelevance(
    evidence: EvidenceSource[],
    query: string
): Promise<EvidenceSource[]> {
    if (evidence.length === 0) return []

    // Jina Rerank tất cả
    const rankedIndices = await jinaRerank(
        query,
        evidence.map(e => e.content),
        evidence.length // Return all
    )

    // Gán relevance score & sort
    const scored = evidence.map((e, i) => ({
        ...e,
        relevance_score: 100 - (rankedIndices.indexOf(i) || 0) * 5,
    }))

    return scored.sort((a, b) => b.relevance_score - a.relevance_score)
}

/**
 * PHASE 3: Tổng hợp evidence thành structured format
 * Thay vì dump 15 documents vào, tạo khung rõ ràng với summary của mỗi section
 */
export function synthesizeEvidenceIntoStructure(
    topEvidence: EvidenceSource[], // Top 5-7 evidence sau rerank
    documentType: string,
    requirements: any[]
): SynthesizedEvidence {
    // Step 1: Tìm legal framework/basis (thường là từ official sources)
    const officialSources = topEvidence.filter(e => e.authority_level === 'high')
    const legalFramework = extractLegalBasis(officialSources)

    // Step 2: Map evidence → requirements
    const requirementSections = requirements.map(req => {
        // Tìm evidence nào liên quan đến requirement này?
        const relatedEvidence = topEvidence.filter(e =>
            e.content.toLowerCase().includes(req.section.toLowerCase())
        ).slice(0, 2)

        return {
            section_name: req.section,
            requirement: summarizeRequirement(req),
            legal_basis: relatedEvidence[0]?.citation?.law_reference || req.legal_basis,
            suggested_clauses: extractClauseSuggestions(relatedEvidence, req.section),
        }
    })

    // Step 3: Tìm key clauses cần include (từ official documents)
    const keyClausesSet = new Set<string>()
    officialSources.forEach(source => {
        const clauses = source.content.match(/Điều \d+[^.]*\./g) || []
        clauses.slice(0, 3).forEach(c => keyClausesSet.add(c.trim()))
    })

    // Step 4: Tìm warning points (những điều dễ sai sót)
    const warningPoints = extractWarningPoints(documentType, topEvidence)

    // Step 5: Tạo draft skeleton
    const draftSkeleton = createDraftSkeleton(documentType, requirementSections)

    return {
        legal_framework: legalFramework,
        requirement_sections: requirementSections,
        key_clauses_to_include: Array.from(keyClausesSet),
        warning_points: warningPoints,
        draft_skeleton: draftSkeleton,
    }
}

/**
 * Tóm tắt từ một requirement thành 1-2 câu
 */
function summarizeRequirement(req: any): string {
    if (req.user_must_provide?.length > 0) {
        return `MUST HAVE: ${req.user_must_provide.join(', ')}`
    }
    return `Include: ${req.key_elements?.slice(0, 2).join(', ') || 'See legal basis'}`
}

/**
 * Extract clause suggestions từ evidence documents
 */
function extractClauseSuggestions(evidence: EvidenceSource[], section: string): string[] {
    const suggestions: Set<string> = new Set()

    evidence.forEach(e => {
        // Tìm các clause có từ khóa section
        const regex = new RegExp(`Điều \\d+[^.]*${section}[^.]*\\.`, 'gi')
        const matches = e.content.match(regex) || []
        matches.slice(0, 2).forEach(m => suggestions.add(m.trim()))
    })

    return Array.from(suggestions)
}

/**
 * Tìm những điểm dễ sai sót, cần chú ý đặc biệt
 */
function extractWarningPoints(documentType: string, evidence: EvidenceSource[]): string[] {
    const warnings: string[] = []

    const documentSpecificWarnings: Record<string, string[]> = {
        rental_contract: [
            '❗ Yêu cầu chứng thực hợp đồng nếu giá trị > 1 tỷ đồng hoặc thời hạn > 3 năm (Điều 106, Bộ Luật Dân sự)',
            '❗ Phải ghi rõ tình trạng bất động sản, nếu có hư hỏng sẽ do bên nào sửa chữa',
            '❗ Không quên đặc biệt: Hợp đồng hết hạn tự chấm dứt nếu không gia hạn (Điều 498)',
        ],
        service_contract: [
            '❗ Phải rõ ràng định nghĩa "hoàn thành" để tránh tranh chấp (Điều 535)',
            '❗ Cần quy định cơ chế giải quyết khiếu nại nếu khách không hài lòng',
            '❗ Bảo hành phải có thời hạn cụ thể, không được mơ hồ',
        ],
        divorce_petition: [
            '❗ Phải kèm theo quyết định hôn nhân hoặc bằng chứng hôn nhân hợp pháp (Điều 56)',
            '❗ Nếu ly hôn thuận tình và có con chung, PHẢI có thỏa thuận về con bằng văn bản (Điều 86)',
            '❗ Chia tài sản phải được cả 2 bên ký xác nhận, nếu không sẽ bị coi là tranh chấp (Điều 75)',
        ],
    }

    const typeWarnings = documentSpecificWarnings[documentType] || []
    warnings.push(...typeWarnings)

    // Thêm các warning từ evidence
    evidence.forEach(e => {
        const warningTexts = e.content.match(/[!❗].*(?:KHÔNG|PHẢI|NHẤT ĐỊNH)[^.]*\./gi) || []
        warnings.push(...warningTexts.slice(0, 1))
    })

    return warnings.slice(0, 5) // Giới hạn 5 warnings
}

/**
 * Tạo skeleton/template cho Gemini dùng để soạn thảo
 * Thay vì hỏi Gemini "soạn hợp đồng đi", cho Gemini 1 template rõ ràng
 */
function createDraftSkeleton(documentType: string, sections: any[]): string {
    const skeletons: Record<string, string> = {
        rental_contract: `KHUNG SOẠN THẢO HỢP ĐỒNG THUÊ BẤT ĐỘNG SẢN

I. ĐẶC ĐIỂM TỔNG QUÁT
- Loại hợp đồng: Hợp đồng thuê bất động sản
- Căn cứ pháp lý: Bộ Luật Dân sự 2015, Điều 476-498

II. CÁC PHẦN CHÍNH (Phải có đủ các phần này)
1. ĐỊNH DANH các bên:
   - Bên cho thuê: [Tên, CCCD, Địa chỉ]
   - Bên thuê: [Tên, CCCD, Địa chỉ]

2. TÀI SẢN cho thuê:
   - Địa chỉ: [Nhập từ user]
   - Diện tích: [Để ....... nếu user không nêu]
   - Tình trạng: [Để mô tả cơ bản]

3. GIÁ THUÊ & THANH TOÁN:
   - Giá tiền: [Nhập từ user]
   - Hình thức: [Tiền mặt, chuyển khoản]
   - Mốc thanh toán: Hàng tháng/quý

4. THỜI HẠN:
   - Từ ngày: [User cung cấp]
   - Đến ngày: [Tính từ thời hạn user nêu]

5. QUYỀN & NGHĨA VỤ:
   - Bên cho thuê: [Căn cứ Điều 487]
   - Bên thuê: [Căn cứ Điều 490]

6. CHẤM DỨT HỢP ĐỒNG:
   - Điều kiện chấm dứt
   - Thủ tục giao nhận lại tài sản

III. ĐIỀU KHOẢN ĐẶC BIỆT (Nếu có)
- [Từ user]

IV. SỰ ĐỒNG Ý CỬA 2 BÊN
- Chữ ký, ngày tháng`,

        service_contract: `KHUNG SOẠN THẢO HỢP ĐỒNG DỊCH VỤ

I. THÔNG TIN ĐẠI CƯƠNG
- Loại hợp đồng: Hợp đồng cung cấp dịch vụ
- Căn cứ pháp lý: Bộ Luật Dân sự 2015, Điều 533-543

II. CÁC PHẦN BẮT BUỘC
1. XÁC ĐỊNH CÁC BÊN:
   - Bên cung cấp: [Tên, CCCD, Địa chỉ]
   - Bên sử dụng: [Tên, CCCD, Địa chỉ]

2. NỘI DUNG DỊCH VỤ:
   - Mô tả chi tiết: [Từ user]
   - Kết quả mong muốn: [Từ user]
   - Tiêu chuẩn chất lượng: [Căn cứ ngành]

3. GIÁ CƯỚC & THANH TOÁN:
   - Tổng giá trị: [Từ user]
   - Hình thức thanh toán: [Từ user]
   - Mốc thanh toán: [Xác định rõ]

4. THỜI GIAN THỰC HIỆN:
   - Ngày bắt đầu: [Từ user]
   - Ngày kết thúc: [Tính từ user]
   - Các mốc quan trọng: [Nếu có]

5. CAM KẾT & TRÁCH NHIỆM:
   - Bên cung cấp: [Cam kết chất lượng, bảo hành]
   - Bên sử dụng: [Thanh toán đúng hạn]

6. ĐIỀU KHOẢN CHẤM DỨT:
   - Lý do chấm dứt
   - Xử lý khiếu nại`,

        divorce_petition: `KHUNG SOẠN THẢO ĐƠN LY HÔN

I. THÔNG TIN CƠ BẢN
- Loại: Đơn ly hôn thuận tình / Đơn ly hôn đơn phương
- Căn cứ pháp lý: Bộ Luật Hôn nhân & Gia đình 2014

II. PHẦN I: THÔNG TIN VỀ NGƯỜI NỘP ĐƠN
- Họ tên: [User tự điền]
- Ngày sinh: [User tự điền]
- CCCD: [User tự điền]
- Địa chỉ: [User tự điền]

III. PHẦN II: THÔNG TIN VỀ MỘT BÊN KHÁC
- Họ tên: [User tự điền]
- Ngày sinh: [User tự điền]
- CCCD: [User tự điền]

IV. PHẦN III: THÔNG TIN HÔNNHÂN
- Ngày kết hôn: [User cung cấp]
- Nơi chứng thực: [User cung cấp]
- Số ĐKHT: [User có thể bỏ qua]

V. PHẦN IV: LÝ DO XIN LY HÔN
- [Lý do chung chung từ user, không cần chi tiết quá]

VI. PHẦN V: VỀ CON CHUNG (Nếu có)
- Số lượng con: [User cung cấp]
- Tên và ngày sinh từng con: [User cung cấp]
- Thỏa thuận về con: [Bên nào nuôi, mức cấp dưỡng]

VII. PHẦN VI: VỀ TÀI SẢN VÀ NỢ (Nếu có)
- Tài sản chung: [User cung cấp]
- Nợ chung: [User cung cấp]
- Hình thức chia: [User thỏa thuận]

VIII. PHẦN VII: CHỮ KÝ & NGÀY THÁNG
- Chữ ký người nộp đơn & ngày tháng`,
    }

    return skeletons[documentType] || 'Template không tìm thấy. Tạo mới dựa trên sections.'
}

/**
 * Utility: Tính top evidence cần dùng (không cần tất cả)
 */
export function selectTopEvidence(
    ranked: EvidenceSource[],
    maxCount: number = 5
): EvidenceSource[] {
    // Ưu tiên official sources trước
    const official = ranked.filter(e => e.authority_level === 'high').slice(0, 2)
    const secondary = ranked.filter(e => e.authority_level !== 'high').slice(0, maxCount - official.length)
    return [...official, ...secondary]
}

/**
 * Extract keywords từ document type & prompt
 */
function extractKeywords(documentType: string, prompt: string): string[] {
    const typeKeywords: Record<string, string[]> = {
        rental_contract: ['hợp đồng thuê', 'bất động sản', 'giá thuê', 'thời hạn thuê'],
        service_contract: ['hợp đồng dịch vụ', 'giá cước', 'thời gian thực hiện'],
        divorce_petition: ['đơn ly hôn', 'ly hôn thuận tình', 'chia tài sản', 'cấp dưỡng con'],
    }

    const keywords = typeKeywords[documentType] || []
    const promptKeywords = prompt.match(/[\p{L}]+/gu) || []

    return [...keywords, ...promptKeywords.slice(0, 5)]
}

/**
 * Extract legal basis từ official sources
 */
function extractLegalBasis(officials: EvidenceSource[]): string {
    const basis = new Set<string>()
    officials.forEach(doc => {
        const matches = doc.content.match(/Bộ Luật[^.;]*|Điều \d+[^.;]*/g) || []
        matches.forEach(m => basis.add(m.trim()))
    })
    return Array.from(basis).slice(0, 5).join('; ')
}

/**
 * UTILITY: Format evidence thành readable summary cho user
 */
export function formatEvidenceForUser(evidence: SynthesizedEvidence): string {
    let summary = `📋 **CƠ SỞ PHÁP LÝ SOẠN THẢO**\n\n`
    summary += `${evidence.legal_framework}\n\n`

    summary += `📌 **CÁC YÊU CẦU CHÍNH**\n`
    evidence.requirement_sections.forEach(sec => {
        summary += `\n• **${sec.section_name}**\n`
        summary += `  Yêu cầu: ${sec.requirement}\n`
        summary += `  Pháp luật: ${sec.legal_basis}\n`
    })

    if (evidence.warning_points.length > 0) {
        summary += `\n⚠️ **ĐIỂM CẦN LƯU Ý**\n`
        evidence.warning_points.forEach(warn => {
            summary += `• ${warn}\n`
        })
    }

    return summary
}

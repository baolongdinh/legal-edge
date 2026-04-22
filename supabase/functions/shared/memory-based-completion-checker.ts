/**
 * Memory-Based Completion Checker
 * ==============================
 * Thay thế checkAICompleteness() cũ
 * Sử dụng ConversationMemory để check thông tin đầy đủ
 * 
 * Logic:
 * 1. Check tất cả format-critical requirements có answer từ user không
 * 2. Nếu thiếu → suggest follow-up questions cụ thể
 * 3. Nếu đủ → ready to draft
 * 4. Tránh loop: không hỏi lại câu đã hỏi 2+ lần
 */

import type { ConversationMemory } from './conversation-memory.ts'
import type { LegalRequirement } from './legal-analyzer.ts'
import type { SmartQuestion } from './question-generator.ts'
import {
    generateSmartQuestions,
    deduplicateQuestions,
    shouldStartDrafting,
} from './question-generator.ts'

export interface CompletionCheckResult {
    is_complete: boolean
    completeness_percent: number
    missing_critical_count: number
    missing_fields: MissingField[]
    can_proceed_to_draft: boolean
    draft_decision: {
        should_draft: boolean
        reason: string
        missing_info?: string[]
    }
    suggested_next_questions?: SmartQuestion[]
    conflicts?: ConflictInfo[]
}

export interface MissingField {
    requirement: string
    section: string
    format_critical: boolean
    times_asked: number
    legal_basis: string
}

export interface ConflictInfo {
    field: string
    user_answer: string
    legal_requirement: string
    suggestion: string
}

/**
 * MAIN: Check completeness dựa trên memory
 * 
 * Returns:
 * - is_complete: Tất cả format-critical requirements có answer
 * - can_proceed_to_draft: Có đủ thông tin để soạn draft
 * - suggested_next_questions: 2-3 câu hỏi tiếp theo (nếu cần)
 */
export async function checkCompletionWithMemory(
    memory: ConversationMemory,
    allRequirements: LegalRequirement[]
): Promise<CompletionCheckResult> {
    // Step 1: Identify missing requirements
    const missing = getMissingRequirements(memory, allRequirements)
    const missingCritical = missing.filter(r => r.format_critical)

    // Step 2: Check for conflicts (user answer vs legal requirement)
    const conflicts = checkForConflicts(memory, allRequirements)

    // Step 3: Determine if complete
    const isComplete = missingCritical.length === 0 && conflicts.length === 0

    // Step 4: Should we start drafting?
    const draftDecision = shouldStartDrafting(
        memory,
        missingCritical.length,
        3 // maxIterations
    )

    // Step 5: Generate suggested follow-up questions (only if not ready to draft)
    let suggestedQuestions: SmartQuestion[] = []
    if (!draftDecision.should_draft && missingCritical.length > 0) {
        suggestedQuestions = generateSmartQuestions(
            memory.document_analysis!,
            missingCritical,
            memory // auto-tracks
        )

        // Deduplicate to avoid re-asking
        suggestedQuestions = deduplicateQuestions(suggestedQuestions, memory)
    }

    return {
        is_complete: isComplete,
        completeness_percent: memory.completion_percent,
        missing_critical_count: missingCritical.length,
        missing_fields: missing.map(req => ({
            requirement: req.field_name,
            section: req.section,
            format_critical: req.format_critical,
            times_asked: getTimesAskedCount(memory, req.section),
            legal_basis: req.legal_basis,
        })),
        can_proceed_to_draft: draftDecision.should_draft,
        draft_decision: draftDecision,
        suggested_next_questions: suggestedQuestions,
        conflicts: conflicts,
    }
}

/**
 * Get missing requirements từ current memory state
 */
function getMissingRequirements(
    memory: ConversationMemory,
    allRequirements: LegalRequirement[]
): LegalRequirement[] {
    return allRequirements.filter(req => {
        const status = memory.requirements_status.get(req.section)
        return !status?.is_answered
    })
}

/**
 * Check xem có conflict giữa user answer và legal requirement không
 * VD: User muốn hợp đồng không có bảo hành, nhưng pháp luật bắt buộc
 */
function checkForConflicts(
    memory: ConversationMemory,
    allRequirements: LegalRequirement[]
): ConflictInfo[] {
    const conflicts: ConflictInfo[] = []

    // Iterate through answered requirements
    memory.requirements_status.forEach((status, key) => {
        if (!status.is_answered || !status.answer_value) return

        // Find related requirement
        const req = allRequirements.find(r => r.section === key)
        if (!req) return

        // Check for conflicts
        if (req.user_must_accept && !isAnswerCompliant(status.answer_value, req)) {
            conflicts.push({
                field: key,
                user_answer: status.answer_value,
                legal_requirement: req.description,
                suggestion: `Pháp luật yêu cầu ${req.legal_basis}. Không thể bỏ qua.`,
            })
        }
    })

    return conflicts
}

/**
 * Check xem answer có comply với requirement không
 * (Simple check, có thể mở rộng với more logic)
 */
function isAnswerCompliant(answer: string, requirement: LegalRequirement): boolean {
    const lowerAnswer = answer.toLowerCase()

    // Prevent "không" answers for mandatory fields
    if (lowerAnswer.includes('không') && requirement.user_must_accept) {
        return false
    }

    return true
}

/**
 * Count bao nhiêu lần một requirement đã được hỏi
 */
function getTimesAskedCount(memory: ConversationMemory, section: string): number {
    const question = memory.questions_asked.find(
        q => q.label.toLowerCase().includes(section.toLowerCase())
    )
    return question?.times_asked ?? 0
}

/**
 * Format completion result thành human-readable message
 */
export function formatCompletionMessage(result: CompletionCheckResult): string {
    let msg = ''

    if (result.is_complete) {
        msg = `✅ **Thông tin đầy đủ!** (${result.completeness_percent}%)\n\n`
        msg += `Sẵn sàng soạn thảo hợp đồng.\n`
    } else if (result.can_proceed_to_draft) {
        msg = `⚠️  **Gần đủ thông tin** (${result.completeness_percent}%)\n\n`
        msg += `${result.draft_decision.reason}\n\n`

        if (result.missing_fields.length > 0) {
            msg += `**Thông tin còn thiếu:**\n`
            result.missing_fields.slice(0, 3).forEach(f => {
                msg += `- ${f.requirement} (${f.legal_basis})\n`
            })
            msg += `\n_⚠️  Hợp đồng sẽ có chú thích [CẦN HOÀN THIỆN] cho các phần này._\n`
        }
    } else {
        msg = `📝 **Còn thiếu thông tin quan trọng**\n\n`
        msg += `Completeness: ${result.completeness_percent}%\n`
        msg += `Missing Critical: ${result.missing_critical_count} field(s)\n\n`

        if (result.suggested_next_questions && result.suggested_next_questions.length > 0) {
            msg += `**Giải đáp những câu hỏi sau để soạn thảo chính xác:**\n\n`
            result.suggested_next_questions.forEach((q, idx) => {
                msg += `${idx + 1}. ${q.label}\n`
                if (q.help_text) msg += `   _${q.help_text}_\n`
                msg += `\n`
            })
        }
    }

    if (result.conflicts.length > 0) {
        msg += `\n⚠️  **Xung đột với quy định pháp luật:**\n`
        result.conflicts.forEach(c => {
            msg += `- **${c.field}**: Bạn nói "${c.user_answer}", nhưng ${c.suggestion}\n`
        })
    }

    return msg
}

/**
 * Generate annotation cho draft khi missing < 2 fields
 * Dùng khi soạn draft với incomplete info
 */
export function generateDraftAnnotations(result: CompletionCheckResult): string {
    let annotations = ''

    if (result.missing_fields.length === 0) {
        return annotations
    }

    annotations = '\n\n---\n\n**📌 CHƯA HOÀN THIỆN - Bạn cần:**\n\n'

    result.missing_fields.forEach(f => {
        annotations += `- [ ] **${f.requirement}**\n`
        annotations += `  _Pháp lý: ${f.legal_basis}_\n`
        if (f.format_critical) {
            annotations += `  ⚠️  **Bắt buộc để hợp đồng có hiệu lực**\n`
        }
        annotations += `\n`
    })

    return annotations
}

/**
 * Log completion status để debugging
 */
export function logCompletionStatus(result: CompletionCheckResult, sessionId: string): void {
    console.log(`\n=== COMPLETION CHECK [${sessionId}] ===`)
    console.log(`Complete: ${result.is_complete}`)
    console.log(`Can Draft: ${result.can_proceed_to_draft}`)
    console.log(`Completeness: ${result.completeness_percent}%`)
    console.log(`Missing Critical: ${result.missing_critical_count}`)

    if (result.missing_fields.length > 0) {
        console.log('\nMissing Fields:')
        result.missing_fields.forEach(f => {
            console.log(`  - ${f.requirement} (format_critical: ${f.format_critical})`)
        })
    }

    if (result.conflicts.length > 0) {
        console.log('\nConflicts:')
        result.conflicts.forEach(c => {
            console.log(`  - ${c.field}: "${c.user_answer}" vs "${c.legal_requirement}"`)
        })
    }

    if (result.suggested_next_questions && result.suggested_next_questions.length > 0) {
        console.log('\nSuggested Questions:')
        result.suggested_next_questions.forEach(q => {
            console.log(`  - ${q.label}`)
        })
    }

    console.log(`\nDecision: ${result.draft_decision.reason}`)
    console.log('=====================================\n')
}

/**
 * Conversation Memory System
 * ========================
 * Lưu trữ toàn bộ trạng thái cuộc hội thoại giữa Agent và User
 * Đảm bảo Agent có trí nhớ toàn vẹn:
 * - Tất cả câu hỏi đã hỏi + khi hỏi
 * - Tất cả câu trả lời từ user
 * - Trạng thái completion của mỗi requirement
 * - Iteration history để tránh loop vô hạn
 */

import type { LegalRequirement, DocumentTypeAnalysis } from './legal-analyzer.ts'
import type { SmartQuestion } from './question-generator.ts'

export interface QuestionAsked {
    id: string
    label: string
    first_asked_at: number // timestamp
    times_asked: number
    answers: string[] // mỗi lần user trả lời lại
    latest_answer?: string
    contexts: string[] // context (e.g., "initial", "follow-up", "clarification")
}

export interface ConversationMemory {
    // Metadata
    session_id: string
    document_type: string
    started_at: number
    last_updated_at: number

    // Questions & Answers
    questions_asked: QuestionAsked[]
    requirements_status: Map<string, {
        requirement: LegalRequirement
        is_answered: boolean
        answer_source?: 'user_input' | 'question' | 'inferred'
        answer_value?: string
        confidence?: number
    }>

    // Tracking
    iteration_count: number
    total_exchanges: number
    questions_presented_to_user: SmartQuestion[] // Câu hỏi đã show cho user
    completion_percent: number
    missing_requirements: LegalRequirement[]

    // Analysis context
    document_analysis?: DocumentTypeAnalysis
    evidence_collected?: Record<string, string> // section → evidence
}

/**
 * CORE: Tạo memory mới cho một cuộc soạn thảo
 */
export function createConversationMemory(
    sessionId: string,
    documentType: string,
    analysis?: DocumentTypeAnalysis
): ConversationMemory {
    return {
        session_id: sessionId,
        document_type: documentType,
        started_at: Date.now(),
        last_updated_at: Date.now(),

        questions_asked: [],
        requirements_status: new Map(),

        iteration_count: 0,
        total_exchanges: 0,
        questions_presented_to_user: [],
        completion_percent: 0,
        missing_requirements: [],

        document_analysis: analysis,
        evidence_collected: {},
    }
}

/**
 * Ghi nhận một câu hỏi đã được hỏi
 */
export function recordQuestionAsked(
    memory: ConversationMemory,
    question: SmartQuestion,
    context: 'initial' | 'follow-up' | 'clarification' = 'initial'
): void {
    const existing = memory.questions_asked.find(q => q.id === question.id)

    if (existing) {
        // Câu hỏi đã hỏi trước đó
        existing.times_asked++
        existing.contexts.push(context)
    } else {
        // Lần đầu hỏi
        memory.questions_asked.push({
            id: question.id,
            label: question.label,
            first_asked_at: Date.now(),
            times_asked: 1,
            answers: [],
            contexts: [context],
        })
    }

    memory.questions_presented_to_user.push(question)
    memory.iteration_count++
    memory.last_updated_at = Date.now()
}

/**
 * Ghi nhận câu trả lời từ user
 */
export function recordUserAnswer(
    memory: ConversationMemory,
    questionId: string,
    answer: string
): void {
    const question = memory.questions_asked.find(q => q.id === questionId)
    if (!question) {
        console.warn(`Question ${questionId} not found in memory`)
        return
    }

    question.answers.push(answer)
    question.latest_answer = answer

    // Tìm requirement liên quan và update status
    const relatedRequirement = Array.from(memory.requirements_status.values()).find(
        r => r.requirement.section.toLowerCase().replace(/\s+/g, '_')
            .includes(questionId.replace('question_', ''))
    )

    if (relatedRequirement) {
        relatedRequirement.is_answered = true
        relatedRequirement.answer_source = 'question'
        relatedRequirement.answer_value = answer
        relatedRequirement.confidence = 0.9 // User direct answer
    }

    memory.total_exchanges++
    memory.last_updated_at = Date.now()
}

/**
 * Ghi nhận thông tin user cung cấp trong initial input
 * (không phải từ question, mà là từ form input ban đầu)
 */
export function recordInitialUserInput(
    memory: ConversationMemory,
    inputData: Record<string, string>
): void {
    for (const [key, value] of Object.entries(inputData)) {
        // Tìm requirement match
        for (const [reqKey, reqStatus] of memory.requirements_status.entries()) {
            if (reqKey.toLowerCase().includes(key.toLowerCase()) ||
                key.toLowerCase().includes(reqKey.toLowerCase())) {
                reqStatus.is_answered = true
                reqStatus.answer_source = 'user_input'
                reqStatus.answer_value = value
                reqStatus.confidence = 0.95 // Form input = rất chắc chắn
                break
            }
        }
    }

    memory.total_exchanges++
    memory.last_updated_at = Date.now()
}

/**
 * Hỏi 1 câu nhưng không muốn hỏi lại?
 * Check xem câu này đã hỏi bao nhiêu lần và có answer chưa
 */
export function hasQuestionBeenAnswered(
    memory: ConversationMemory,
    questionId: string
): boolean {
    const question = memory.questions_asked.find(q => q.id === questionId)
    return question ? question.answers.length > 0 : false
}

/**
 * Check xem câu hỏi này đã hỏi bao nhiêu lần
 */
export function getTimesQuestionAsked(
    memory: ConversationMemory,
    questionId: string
): number {
    const question = memory.questions_asked.find(q => q.id === questionId)
    return question?.times_asked ?? 0
}

/**
 * Lấy tất cả answers từ một requirement section
 */
export function getAnswersForSection(
    memory: ConversationMemory,
    section: string
): string[] {
    return memory.questions_asked
        .filter(q => q.label.toLowerCase().includes(section.toLowerCase()))
        .flatMap(q => q.answers)
}

/**
 * Cập nhật trạng thái completion
 */
export function updateCompletionStatus(
    memory: ConversationMemory,
    requirements: LegalRequirement[]
): void {
    let answered = 0
    let total = 0

    memory.requirements_status.clear()

    requirements.forEach(req => {
        const isAnswered = memory.questions_asked.some(
            q => q.answers.length > 0 &&
                 q.label.toLowerCase().includes(req.section.toLowerCase())
        )

        memory.requirements_status.set(req.section, {
            requirement: req,
            is_answered: isAnswered,
            answer_source: isAnswered ? 'question' : undefined,
            answer_value: isAnswered
                ? memory.questions_asked
                    .find(q => q.label.toLowerCase().includes(req.section.toLowerCase()))
                    ?.latest_answer
                : undefined,
        })

        if (isAnswered) answered++
        total++
    })

    memory.missing_requirements = requirements.filter(
        req => !memory.requirements_status.get(req.section)?.is_answered
    )

    memory.completion_percent = total > 0 ? Math.round((answered / total) * 100) : 0
    memory.last_updated_at = Date.now()
}

/**
 * Lấy tất cả thông tin đã collect để feed vào Gemini
 */
export function extractMemoryContext(memory: ConversationMemory): string {
    let context = `## Thông tin đã collect\n\n`

    context += `**Document Type:** ${memory.document_type}\n`
    context += `**Completion:** ${memory.completion_percent}%\n`
    context += `**Iterations:** ${memory.iteration_count}\n\n`

    context += `### Câu hỏi & Trả lời\n`
    memory.questions_asked.forEach(q => {
        if (q.answers.length > 0) {
            context += `\n**Q:** ${q.label}\n`
            q.answers.forEach((answer, idx) => {
                context += `**A${idx + 1}:** ${answer}\n`
            })
        }
    })

    context += `\n### Status Requirements\n`
    memory.requirements_status.forEach((status, key) => {
        const icon = status.is_answered ? '✅' : '❌'
        context += `${icon} ${key}: ${status.answer_value || 'Chưa trả lời'}\n`
    })

    return context
}

/**
 * Export memory để lưu vào database
 */
export function serializeMemory(memory: ConversationMemory): string {
    return JSON.stringify({
        session_id: memory.session_id,
        document_type: memory.document_type,
        started_at: memory.started_at,
        last_updated_at: memory.last_updated_at,
        questions_asked: memory.questions_asked,
        requirements_status: Array.from(memory.requirements_status.entries()),
        iteration_count: memory.iteration_count,
        total_exchanges: memory.total_exchanges,
        completion_percent: memory.completion_percent,
    })
}

/**
 * Import memory từ database
 */
export function deserializeMemory(json: string, analysis?: DocumentTypeAnalysis): ConversationMemory {
    const data = JSON.parse(json)
    const memory: ConversationMemory = {
        session_id: data.session_id,
        document_type: data.document_type,
        started_at: data.started_at,
        last_updated_at: data.last_updated_at,
        questions_asked: data.questions_asked,
        requirements_status: new Map(data.requirements_status),
        iteration_count: data.iteration_count,
        total_exchanges: data.total_exchanges,
        questions_presented_to_user: [],
        completion_percent: data.completion_percent,
        missing_requirements: [],
        document_analysis: analysis,
        evidence_collected: {},
    }
    return memory
}

/**
 * DEBUG: In ra trạng thái memory để testing
 */
export function debugMemory(memory: ConversationMemory): void {
    console.log('=== CONVERSATION MEMORY DEBUG ===')
    console.log(`Session: ${memory.session_id}`)
    console.log(`Document Type: ${memory.document_type}`)
    console.log(`Completion: ${memory.completion_percent}%`)
    console.log(`Iterations: ${memory.iteration_count}`)
    console.log(`Total Exchanges: ${memory.total_exchanges}`)
    console.log('\nQuestions Asked:')
    memory.questions_asked.forEach(q => {
        console.log(`  - ${q.label} [Times: ${q.times_asked}, Answers: ${q.answers.length}]`)
        if (q.latest_answer) console.log(`    Latest: "${q.latest_answer}"`)
    })
    console.log('\nRequirements Status:')
    memory.requirements_status.forEach((status, key) => {
        console.log(`  ${status.is_answered ? '✅' : '❌'} ${key}`)
    })
    console.log('================================\n')
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('idb-keyval', () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    del: vi.fn(async () => undefined),
}))

import { DraftEditor } from './DraftEditor'
import { useEditorStore } from '../store'

const {
    mockUpdateEq,
    mockUpdate,
    mockInsertContract,
    mockGenerateContractSuggestion,
} = vi.hoisted(() => ({
    mockUpdateEq: vi.fn().mockResolvedValue({ error: null }),
    mockUpdate: vi.fn(() => ({ eq: undefined as any })),
    mockInsertContract: vi.fn(),
    mockGenerateContractSuggestion: vi.fn(async (): Promise<any> => ({
        status: 'ok',
        content: 'ĐIỀU KHOẢN ĐỀ XUẤT',
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
    })),
}))

mockUpdate.mockImplementation(() => ({ eq: mockUpdateEq }))

vi.mock('../components/layout/SplitView', () => ({
    SplitView: ({ left, right }: any) => (
        <div>
            <div>{left}</div>
            <div>{right}</div>
        </div>
    ),
}))

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn((table: string) => {
            if (table === 'templates') {
                return {
                    select: () => ({
                        order: async () => ({
                            data: [
                                {
                                    id: 'tpl-1',
                                    name: 'Mẫu dịch vụ',
                                    category: 'chung',
                                    content_md: 'ĐIỀU 1. Nội dung công việc\nĐIỀU 2. Thanh toán',
                                },
                                {
                                    id: 'clause-1',
                                    name: 'Điều khoản bảo mật',
                                    category: 'bảo mật',
                                    content_md: 'Các bên cam kết bảo mật mọi thông tin.',
                                },
                            ],
                            error: null,
                        }),
                    }),
                }
            }

            if (table === 'contracts') {
                return {
                    insert: (payload: any) => {
                        mockInsertContract(payload)
                        return {
                            select: () => ({
                                single: async () => ({
                                    data: { id: 'draft-1', title: payload.title, content_md: payload.content_md },
                                    error: null,
                                }),
                            }),
                        }
                    },
                    update: mockUpdate,
                }
            }

            return {
                select: () => ({ order: async () => ({ data: [], error: null }) }),
            }
        }),
        auth: {
            getUser: vi.fn(async () => ({
                data: { user: { id: 'user-1' } },
                error: null,
            })),
        },
    },
    analyzeRisks: vi.fn(async () => ({ risks: [] })),
    exportToPDF: vi.fn(async () => ({ pdf_url: 'https://example.com/contract.pdf', size_kb: 42 })),
    generateContractSuggestion: mockGenerateContractSuggestion,
}))

describe('DraftEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useEditorStore.setState({
            activeDraftId: null,
            draftTitle: 'Bản thảo hợp đồng',
            activeDraft: '',
            clauseLibrary: [],
            searchQuery: '',
            recentClauseIds: [],
            draftRequest: '',
            intakeQuestions: [],
            intakeAnswers: {},
            resolvedDocumentType: null,
            resolvedDocumentLabel: null,
        } as any)
        window.open = vi.fn()
    })

    it('loads template library and renders items', async () => {
        render(<DraftEditor />)

        await waitFor(() => {
            expect(screen.getAllByText('Mẫu dịch vụ')[0]).toBeInTheDocument()
        })
    })

    it('uses selected template as draft base', async () => {
        render(<DraftEditor />)

        await screen.findAllByText('Mẫu dịch vụ')
        fireEvent.click(screen.getByText('Dùng làm nền bản thảo'))

        expect((screen.getByPlaceholderText(/Bắt đầu soạn thảo/i) as HTMLTextAreaElement).value).toContain('ĐIỀU 1. Nội dung công việc')
    })

    it('saves draft using title and content_md fields', async () => {
        render(<DraftEditor />)

        const titleInput = screen.getByPlaceholderText('Tên bản thảo')
        const draftInput = screen.getByPlaceholderText(/Bắt đầu soạn thảo/i)

        fireEvent.change(titleInput, { target: { value: 'Hợp đồng thử nghiệm' } })
        fireEvent.change(draftInput, { target: { value: 'Nội dung bản thảo pháp lý' } })
        fireEvent.click(screen.getByText('Lưu bản thảo'))

        await waitFor(() => {
            expect(mockInsertContract).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Hợp đồng thử nghiệm',
                content_md: 'Nội dung bản thảo pháp lý',
                status: 'draft',
            }))
        })
    })

    it('collects clarification answers once before generating a draft', async () => {
        mockGenerateContractSuggestion
            .mockResolvedValueOnce({
                status: 'needs_clarification',
                document_type: 'service_contract',
                document_label: 'Hợp đồng dịch vụ',
                content: 'Cần làm rõ thêm thông tin.',
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
                clarification_pack: {
                    title: 'Làm rõ thông tin để soạn Hợp đồng dịch vụ',
                    questions: [
                        {
                            id: 'parties',
                            label: 'Thông tin các bên',
                            placeholder: 'Nhập thông tin các bên',
                            required: true,
                        },
                    ],
                },
                template_references: [],
                claim_audit: [],
            })
            .mockResolvedValueOnce({
                status: 'ok',
                document_type: 'service_contract',
                document_label: 'Hợp đồng dịch vụ',
                content: 'BẢN NHÁP HỢP ĐỒNG DỊCH VỤ',
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
                template_references: [],
            })

        render(<DraftEditor />)

        fireEvent.click(screen.getByText('AI Assist'))
        fireEvent.change(
            screen.getByPlaceholderText(/Tôi cần hợp đồng dịch vụ marketing/i),
            { target: { value: 'Soạn cho tôi hợp đồng dịch vụ marketing' } }
        )
        fireEvent.click(screen.getByText('Phân tích yêu cầu & chuẩn bị bản nháp'))

        await screen.findByText('Làm rõ thông tin để soạn Hợp đồng dịch vụ')
        fireEvent.change(screen.getByPlaceholderText('Nhập thông tin các bên'), {
            target: { value: 'Bên A: Công ty ABC. Bên B: Nguyễn Văn B.' },
        })
        fireEvent.click(screen.getByText('Tạo bản nháp từ bộ trả lời này'))

        await waitFor(() => {
            expect(mockGenerateContractSuggestion).toHaveBeenNthCalledWith(2, expect.objectContaining({
                intake_answers: {
                    parties: 'Bên A: Công ty ABC. Bên B: Nguyễn Văn B.',
                },
            }))
        })

        await screen.findByText('BẢN NHÁP HỢP ĐỒNG DỊCH VỤ')
    })
})

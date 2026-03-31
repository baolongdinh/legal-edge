import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('idb-keyval', () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    del: vi.fn(async () => undefined),
}))

import { DraftEditor } from './DraftEditor'
import { useEditorStore } from '../store'

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
const mockInsertContract = vi.fn()

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
    generateContractSuggestion: vi.fn(async () => ({
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
})

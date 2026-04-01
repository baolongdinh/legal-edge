import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatAI } from './ChatAI'
import { getAccessToken, invokeEdgeFunction, supabase } from '../lib/supabase'

vi.mock('comlink', () => ({
    wrap: vi.fn(() => ({
        parsePDF: vi.fn().mockResolvedValue('Noi dung PDF local'),
        parseDocx: vi.fn().mockResolvedValue('Noi dung DOCX local'),
    })),
}))

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: { getSession: vi.fn() },
        functions: { invoke: vi.fn() }
    },
    getAccessToken: vi.fn(),
    invokeEdgeFunction: vi.fn(),
}))

class MockWorker {
    terminate = vi.fn()
}
vi.stubGlobal('Worker', MockWorker as any)

// Mock Element methods used by scrolling that JSDOM doesn't support
window.HTMLElement.prototype.scrollIntoView = vi.fn()
window.HTMLElement.prototype.scrollTo = vi.fn()

describe('ChatAI Component Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(supabase.auth.getSession).mockResolvedValue({
            data: { session: { access_token: 'fake-token' } },
            error: null
        } as any)
        vi.mocked(getAccessToken).mockResolvedValue('fake-token')
    })

    it('renders initial AI greeting message', () => {
        render(<ChatAI />)
        expect(screen.getByText(/Xin chào! Tôi là Trợ lý Pháp lý AI/i)).toBeInTheDocument()
    })

    it('sends user message and renders AI response markdown', async () => {
        vi.mocked(invokeEdgeFunction).mockResolvedValue({
            reply: 'Đây là câu trả lời **in đậm** và danh sách:\n- Điều 1',
            verification_status: 'official_verified',
            verification_summary: {
                citation_count: 1,
                official_count: 1,
                secondary_count: 0,
                unsupported_claim_count: 0
            },
            claim_audit: [{
                claim: 'Áp dụng Điều 301 Luật Thương mại 2005',
                supported: true,
                matched_citation_url: 'https://vbpl.vn/mock',
                matched_source_domain: 'vbpl.vn',
                score: 88
            }],
            citations: [{
                citation_text: 'Điều 301 Luật Thương mại 2005',
                citation_url: 'https://vbpl.vn/mock',
                source_domain: 'vbpl.vn',
                source_title: 'Luật Thương mại 2005',
                verification_status: 'official_verified'
            }]
        } as any)

        const { container } = render(<ChatAI />)
        const input = screen.getByPlaceholderText(/Hỏi về rủi ro hợp đồng/i)

        fireEvent.change(input, { target: { value: 'Hỏi về luật' } })

        const form = container.querySelector('form')
        if (form) fireEvent.submit(form)

        // User message should appear immediately
        expect(screen.getByText('Hỏi về luật')).toBeInTheDocument()

        await waitFor(() => {
            expect(invokeEdgeFunction).toHaveBeenCalledWith('legal-chat', expect.objectContaining({
                body: expect.objectContaining({ message: 'Hỏi về luật' })
            }))
            // Markdown rendering verification (in đậm -> strong tag)
            expect(screen.getByText('in đậm')).toBeInTheDocument()
            expect(screen.getByText('Điều 1')).toBeInTheDocument()
            expect(screen.getByText('Điều 301 Luật Thương mại 2005')).toBeInTheDocument()
            expect(screen.getByText(/Đã xác minh/i)).toBeInTheDocument()
            expect(screen.getByText('Citation')).toBeInTheDocument()
            expect(screen.getByText('Official')).toBeInTheDocument()
        })
    })

    it('renders warning state for conflicted legal claims', async () => {
        vi.mocked(invokeEdgeFunction).mockResolvedValue({
            reply: 'Khoản phạt này có thể vượt mức cho phép theo luật hiện hành.\n\nLưu ý: Một phần nhận định pháp lý ở trên chưa được đối chiếu đủ mạnh với nguồn dẫn chứng hiện có. Bạn nên kiểm tra lại với luật sư hoặc nêu rõ điều luật cần tra cứu.',
            verification_status: 'conflicted',
            verification_summary: {
                citation_count: 1,
                official_count: 0,
                secondary_count: 1,
                unsupported_claim_count: 1
            },
            claim_audit: [{
                claim: 'Khoản phạt này có thể vượt mức cho phép theo luật hiện hành.',
                supported: false
            }],
            citations: [{
                citation_text: 'Điều 301 Luật Thương mại 2005',
                citation_url: 'https://luatvietnam.vn/mock',
                source_domain: 'luatvietnam.vn',
                source_title: 'Luật Thương mại 2005',
                verification_status: 'secondary_verified'
            }]
        } as any)

        const { container } = render(<ChatAI />)
        const input = screen.getByPlaceholderText(/Hỏi về rủi ro hợp đồng/i)

        fireEvent.change(input, { target: { value: 'Mức phạt này có hợp pháp không?' } })
        const form = container.querySelector('form')
        if (form) fireEvent.submit(form)

        await waitFor(() => {
            expect(screen.getByText(/Một phần nhận định pháp lý chưa được đối chiếu đủ mạnh/i)).toBeInTheDocument()
            expect(screen.getByText(/Claim Cần Kiểm Tra Thêm/i)).toBeInTheDocument()
            expect(screen.getByText(/Chưa tìm thấy nguồn khớp đủ mạnh/i)).toBeInTheDocument()
        })
    })

    it('handles PDF uploads locally before chat', async () => {
        const { container } = render(<ChatAI />)
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['mock content'], 'contract.pdf', { type: 'application/pdf' })

        fireEvent.change(fileInput, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('contract.pdf')).toBeInTheDocument()
        })
    })

    it('falls back to parse-document when local parsing fails', async () => {
        vi.mocked(invokeEdgeFunction).mockResolvedValue({
            text_content: 'Noi dung tu server fallback'
        } as any)

        const { container } = render(<ChatAI />)
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['img'], 'scan.png', { type: 'image/png' })

        fireEvent.change(fileInput, { target: { files: [file] } })

        await waitFor(() => {
            expect(invokeEdgeFunction).toHaveBeenCalledWith(
                'parse-document',
                expect.objectContaining({ body: expect.any(FormData) })
            )
            expect(screen.getByText('scan.png')).toBeInTheDocument()
        })
    })
})

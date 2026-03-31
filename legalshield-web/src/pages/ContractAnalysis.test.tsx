import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContractAnalysis } from './ContractAnalysis'
import { supabase } from '../lib/supabase'
import { MemoryRouter } from 'react-router-dom'

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
}))

// Mock Framer Motion
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock Web Worker
class MockWorker {
    onmessage = null
    postMessage = vi.fn()
    terminate = vi.fn()
}
vi.stubGlobal('Worker', MockWorker)

const longMockText = `
HỢP ĐỒNG LAO ĐỘNG CHI TIẾT
Bên A: Công ty TNHH LegalShield Việt Nam.
Bên B: Ông/Bà Nguyễn Văn A.
Điều 1: Nội dung công việc. Bên B thực hiện các công việc tư vấn và phát triển phần mềm cho Bên A.
Điều 2: Chế độ làm việc. Thời gian làm việc là 8 giờ mỗi ngày, từ thứ Hai đến thứ Sáu.
Điều 3: Tiền lương. Bên A thanh toán lương cho Bên B vào ngày mùng 5 hàng tháng.
Hợp đồng này có hiệu lực kể từ ngày ký và kéo dài trong thời hạn 12 tháng.
Bên A và Bên B chịu trách nhiệm thi hành đúng các điều khoản đã cam kết.
`

// Mock Comlink
vi.mock('comlink', () => ({
    wrap: vi.fn(() => ({
        generateHash: vi.fn().mockResolvedValue('hash123'),
        parsePDF: vi.fn().mockResolvedValue(longMockText),
        parseDocx: vi.fn().mockResolvedValue(longMockText)
    }))
}))

// Proxy for Supabase
const createMockSupabase = (data: any = null, error: any = null) => {
    const mockResponse = { data, error, count: 0, status: 200, statusText: 'OK' }
    const handler: ProxyHandler<any> = {
        get(target, prop) {
            if (prop === 'then') return (resolve: any) => Promise.resolve(mockResponse).then(resolve)
            if (prop === 'maybeSingle' || prop === 'single') return () => new Proxy(target, handler)
            if (typeof target[prop] === 'function') return target[prop]
            return () => new Proxy(target, handler)
        }
    }
    return new Proxy({}, handler)
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: { getUser: vi.fn() },
        from: vi.fn(),
        functions: { invoke: vi.fn() },
        channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
        removeChannel: vi.fn()
    }
}))

const dropFile = (element: Element, file: File) => {
    fireEvent.dragOver(element, {
        dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files']
        }
    })
    fireEvent.drop(element, {
        dataTransfer: {
            files: [file],
            items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
            types: ['Files']
        }
    })
}

describe('ContractAnalysis Component', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'user1' } }, error: null } as any)
    })

    it('renders and handles upload', async () => {
        vi.mocked(supabase.from).mockImplementation(() => createMockSupabase(null, null) as any)
        render(<MemoryRouter><ContractAnalysis /></MemoryRouter>)

        const file = new File(['mock pdf content'], 'test.pdf', { type: 'application/pdf' })
        dropFile(screen.getByTestId('upload-zone'), file)

        await waitFor(() => {
            expect(screen.getByText(/Văn bản hợp đồng/i)).toBeInTheDocument()
            expect(screen.getByText(/HỢP ĐỒNG LAO ĐỘNG/i)).toBeInTheDocument()
        }, { timeout: 4000 })
    })

    it('handles initial Q&A state', async () => {
        vi.mocked(supabase.from).mockImplementation(() => createMockSupabase(null, null) as any)
        render(<MemoryRouter><ContractAnalysis /></MemoryRouter>)

        const file = new File(['content'], 'test.txt', { type: 'text/plain' })
        dropFile(screen.getByTestId('upload-zone'), file)

        const input = await screen.findByPlaceholderText("Hỏi AI về hợp đồng này...")
        fireEvent.change(input, { target: { value: 'Hợp đồng này nói về gì?' } })

        vi.mocked(supabase.functions.invoke).mockResolvedValue({
            data: { answer: 'Đây là hợp đồng lao động.', sources: [] },
            error: null
        } as any)

        fireEvent.click(screen.getByLabelText('Gửi câu hỏi'))
        await waitFor(() => expect(screen.getByText('Đây là hợp đồng lao động.')).toBeInTheDocument())
    })

    it('handles deep audit and results Q&A', async () => {
        vi.mocked(supabase.from).mockImplementation(() => createMockSupabase(null, null) as any)
        render(<MemoryRouter><ContractAnalysis /></MemoryRouter>)

        const file = new File(['content'], 'test.txt', { type: 'text/plain' })
        dropFile(screen.getByTestId('upload-zone'), file)

        await waitFor(() => screen.getByText(/Kích hoạt Deep Audit/i))

        vi.mocked(supabase.functions.invoke).mockResolvedValue({
            data: { risks: [{ level: 'critical', description: 'Rủi ro bảo mật', citation: 'Điều 5' }] },
            error: null
        } as any)

        fireEvent.click(screen.getByText(/Kích hoạt Deep Audit/i))
        await waitFor(() => expect(screen.getByText('Rủi ro bảo mật')).toBeInTheDocument())

        const input = screen.getByPlaceholderText("Hỏi AI thêm về hợp đồng này...")
        fireEvent.change(input, { target: { value: 'Chi tiết rủi ro?' } })

        vi.mocked(supabase.functions.invoke).mockResolvedValue({
            data: { answer: 'Rủi ro ở điều khoản bảo mật.', sources: [] },
            error: null
        } as any)

        fireEvent.click(screen.getByLabelText('Gửi câu hỏi thêm'))
        await waitFor(() => expect(screen.getByText('Rủi ro ở điều khoản bảo mật.')).toBeInTheDocument())
    })
})

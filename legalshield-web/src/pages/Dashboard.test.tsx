import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import { supabase } from '../lib/supabase'
import { MemoryRouter } from 'react-router-dom'

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// A truly chainable and awaitable mock using Proxy
const createMockSupabase = (data: any = null, error: any = null) => {
    const mockResponse = { data, error, count: 0, status: 200, statusText: 'OK' }

    const handler: ProxyHandler<any> = {
        get(target, prop) {
            if (prop === 'then') {
                return (resolve: any) => Promise.resolve(mockResponse).then(resolve)
            }
            if (prop === 'maybeSingle' || prop === 'single') {
                return () => new Proxy(target, handler)
            }
            if (typeof target[prop] === 'function') {
                return target[prop]
            }
            // Chain any other method call
            return () => new Proxy(target, handler)
        }
    }

    return new Proxy({}, handler)
}

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(),
        rpc: vi.fn(),
        functions: { invoke: vi.fn() },
        auth: { getUser: vi.fn() },
        channel: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis()
        })),
        removeChannel: vi.fn()
    }
}))

describe('Dashboard Component', () => {
    const mockContracts = [
        {
            id: '1',
            title: 'Hợp đồng lao động',
            created_at: new Date().toISOString(),
            status: 'analyzed',
            contract_risks: [{ level: 'critical' }]
        },
        {
            id: '2',
            title: 'Hợp đồng thuê nhà',
            created_at: new Date().toISOString(),
            status: 'pending',
            contract_risks: []
        }
    ]

    beforeEach(() => {
        vi.clearAllMocks()

        vi.mocked(supabase.rpc).mockImplementation(() =>
            createMockSupabase({ total_contracts: 10, analyzed_count: 5, critical_count: 2 }) as any
        )

        vi.mocked(supabase.from).mockImplementation((table: string) => {
            if (table === 'contracts') {
                return createMockSupabase(mockContracts) as any
            }
            return createMockSupabase([]) as any
        })
    })

    it('renders statistics cards with correct values', async () => {
        render(<MemoryRouter><Dashboard /></MemoryRouter>)

        await waitFor(() => {
            expect(screen.getByText('10')).toBeInTheDocument()
            expect(screen.getByText('5')).toBeInTheDocument()
        })
    })

    it('renders contract list correctly', async () => {
        render(<MemoryRouter><Dashboard /></MemoryRouter>)

        await waitFor(() => {
            expect(screen.getByText('Hợp đồng lao động')).toBeInTheDocument()
            expect(screen.getByText('Hợp đồng thuê nhà')).toBeInTheDocument()
        })
    })

    it('opens delete dialog and handles deletion', async () => {
        render(<MemoryRouter><Dashboard /></MemoryRouter>)

        // Wait for list to load
        const contractTitle = await screen.findByText('Hợp đồng lao động')
        expect(contractTitle).toBeInTheDocument()

        const deleteButtons = screen.getAllByTitle('Xóa hợp đồng')
        fireEvent.click(deleteButtons[0])

        // Dialog should be open
        const dialogTitle = await screen.findByText('Xóa hợp đồng?')
        expect(dialogTitle).toBeInTheDocument()

        const confirmBtn = screen.getByText('Xóa vĩnh viễn')

        // Mock successful deletion response (null data)
        vi.mocked(supabase.from).mockImplementation(() => createMockSupabase(null, null) as any)

        fireEvent.click(confirmBtn)

        await waitFor(() => {
            expect(supabase.from).toHaveBeenCalledWith('contracts')
        })
    })
})

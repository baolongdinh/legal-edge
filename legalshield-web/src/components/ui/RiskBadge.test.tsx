import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RiskBadge } from './RiskBadge'

describe('RiskBadge UI Component', () => {
    it('renders correct default labels for all risk levels', () => {
        const { unmount } = render(<RiskBadge level="critical" />)
        expect(screen.getByText('Rủi ro cao')).toBeInTheDocument()
        unmount()

        const { unmount: um2 } = render(<RiskBadge level="moderate" />)
        expect(screen.getByText('Cần xem xét')).toBeInTheDocument()
        um2()

        const { unmount: um3 } = render(<RiskBadge level="note" />)
        expect(screen.getByText('Lưu ý')).toBeInTheDocument()
        um3()
    })

    it('renders a custom label when provided', () => {
        render(<RiskBadge level="note" label="Lưu ý tùy chỉnh" />)
        expect(screen.getByText('Lưu ý tùy chỉnh')).toBeInTheDocument()
        expect(screen.queryByText('Lưu ý')).not.toBeInTheDocument()
    })

    it('applies custom className properties correctly', () => {
        const { container } = render(<RiskBadge level="critical" className="bg-risk-custom" />)
        expect(container.firstChild).toHaveClass('bg-risk-custom')
    })

    it('keeps badge text on a single line for short labels like Lưu ý', () => {
        const { container } = render(<RiskBadge level="note" />)
        expect(container.firstChild).toHaveClass('whitespace-nowrap')
        expect(container.firstChild).toHaveClass('leading-none')
    })
})

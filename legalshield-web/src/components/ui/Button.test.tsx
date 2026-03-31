import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'
import { Zap } from 'lucide-react'

describe('Button UI Component', () => {
    it('renders children correctly', () => {
        render(<Button>Click Me</Button>)
        expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument()
    })

    it('handles click events', () => {
        const handleClick = vi.fn()
        render(<Button onClick={handleClick}>Submit</Button>)
        const btn = screen.getByRole('button', { name: 'Submit' })
        fireEvent.click(btn)
        expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('is disabled when disabled prop is true', () => {
        render(<Button disabled>Cancel</Button>)
        const btn = screen.getByRole('button', { name: 'Cancel' })
        expect(btn).toBeDisabled()
    })

    it('applies ghost variant classes', () => {
        const { container } = render(<Button variant="ghost">GhostBtn</Button>)
        expect(container.firstChild).toHaveClass('border-gold-primary/50')
    })

    it('keeps icon and label inside aligned flex content wrapper', () => {
        render(
            <Button>
                <Zap size={16} />
                Kích hoạt
            </Button>
        )

        const btn = screen.getByRole('button', { name: /Kích hoạt/i })
        const content = btn.querySelector('span')
        expect(content).toHaveClass('inline-flex')
        expect(content).toHaveClass('items-center')
        expect(content).toHaveClass('justify-center')
        expect(btn).toHaveClass('[&_svg]:shrink-0')
    })
})

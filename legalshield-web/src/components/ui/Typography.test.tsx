import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Typography } from './Typography'

describe('Typography UI Component', () => {
    it('renders children text correctly', () => {
        render(<Typography>Lorem Ipsum</Typography>)
        expect(screen.getByText('Lorem Ipsum')).toBeInTheDocument()
    })

    it('uses correct default semantic tags for variants', () => {
        const { unmount } = render(<Typography variant="h1">Header 1</Typography>)
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
        unmount()

        const { unmount: um2 } = render(<Typography variant="h2">Header 2</Typography>)
        expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
        um2()
    })

    it('allows overriding the semantic tag via as prop', () => {
        const { container } = render(<Typography variant="h1" as="span">Not A Header</Typography>)
        expect(container.querySelector('span')).toBeInTheDocument()
        expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
})

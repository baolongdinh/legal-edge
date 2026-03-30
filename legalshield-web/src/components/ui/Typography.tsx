import { clsx } from 'clsx'
import React from 'react'

type Variant = 'h1' | 'h2' | 'h3' | 'subtitle' | 'body' | 'caption' | 'label'

interface TypographyProps {
    variant?: Variant
    className?: string
    children: React.ReactNode
    as?: string
}

const variantStyles: Record<Variant, string> = {
    h1: 'font-serif text-4xl md:text-5xl lg:text-6xl font-700 leading-tight tracking-tight text-paper-dark',
    h2: 'font-serif text-2xl md:text-3xl font-600 leading-snug text-paper-dark',
    h3: 'font-serif text-xl font-600 leading-snug text-paper-dark',
    subtitle: 'font-sans text-base font-400 text-slate-muted leading-relaxed',
    body: 'font-sans text-sm font-400 text-paper-dark leading-relaxed',
    caption: 'font-sans text-xs font-400 text-slate-muted',
    label: 'font-sans text-xs font-600 uppercase tracking-widest text-gold-muted',
}

const defaultTag: Record<Variant, string> = {
    h1: 'h1', h2: 'h2', h3: 'h3',
    subtitle: 'p', body: 'p', caption: 'span', label: 'span',
}

export function Typography({ variant = 'body', className, children, as }: TypographyProps) {
    const Tag = (as ?? defaultTag[variant]) as React.ElementType
    return (
        <Tag className={clsx(variantStyles[variant], className)}>
            {children}
        </Tag>
    )
}

import React from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'ghost' | 'outline'
    size?: 'sm' | 'md' | 'lg'
    children: React.ReactNode
}

const variants = {
    primary: 'bg-gold-primary text-navy-base font-semibold hover:bg-gold-muted active:scale-[0.98]',
    ghost: 'border border-gold-primary text-gold-primary hover:bg-gold-primary/10 active:scale-[0.98]',
    outline: 'border border-slate-border text-paper-dark hover:border-slate-muted active:scale-[0.98]',
}

const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded',
    md: 'px-5 py-2.5 text-sm rounded-md',
    lg: 'px-7 py-3 text-base rounded-md',
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
    return (
        <button
            className={clsx(
                'inline-flex items-center justify-center gap-2 font-sans transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none',
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {children}
        </button>
    )
}

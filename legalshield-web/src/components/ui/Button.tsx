import React from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'ghost' | 'outline'
    size?: 'sm' | 'md' | 'lg'
    children: React.ReactNode
    loading?: boolean
}

const variants = {
    primary: 'bg-gold-primary text-navy-base font-semibold hover:bg-gold-muted hover:shadow-[0_0_15px_rgba(201,168,76,0.25)] active:scale-[0.98]',
    ghost: 'border border-gold-primary/50 text-gold-primary hover:bg-gold-primary/10 active:scale-[0.98]',
    outline: 'border border-slate-border text-paper-dark hover:border-slate-muted active:scale-[0.98]',
}

const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded',
    md: 'px-5 py-2.5 text-sm rounded-md',
    lg: 'px-7 py-3 text-base rounded-md',
}

export function Button({ variant = 'primary', size = 'md', className, children, loading = false, ...props }: ButtonProps) {
    return (
        <button
            className={clsx(
                'inline-flex items-center justify-center gap-2 whitespace-nowrap leading-none font-sans transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden [&_svg]:shrink-0 [&_svg]:align-middle',
                variants[variant],
                sizes[size],
                loading && 'animate-pulse pointer-events-none opacity-80',
                className
            )}
            disabled={loading || props.disabled}
            aria-busy={loading}
            {...props}
        >
            <span className={clsx('inline-flex w-full items-center justify-center gap-2 transition-opacity duration-200', loading ? 'opacity-0' : 'opacity-100')}>
                {children}
            </span>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </button>
    )
}

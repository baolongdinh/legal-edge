import React from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'ghost' | 'outline' | 'gold'
    size?: 'sm' | 'md' | 'lg' | 'icon'
    children?: React.ReactNode
    loading?: boolean
}

const variants = {
    primary: 'bg-lex-deep text-white font-semibold hover:bg-lex-dark active:scale-[0.98]',
    gold: 'bg-lex-gold text-lex-deep font-bold hover:brightness-110 active:scale-[0.98]',
    ghost: 'text-lex-deep hover:bg-lex-deep/5 active:scale-[0.98]',
    outline: 'border border-lex-deep/20 text-lex-deep hover:border-lex-deep/50 active:scale-[0.98]',
}

const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-5 py-2.5 text-sm rounded-lg',
    lg: 'px-7 py-3 text-base rounded-lg',
    icon: 'h-10 w-10 p-0 rounded-lg',
}

export function Button({ variant = 'primary', size = 'md', className, children, loading = false, ...props }: ButtonProps) {
    return (
        <button
            className={clsx(
                'inline-flex items-center justify-center gap-2 whitespace-nowrap leading-none font-sans tracking-wide transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden [&_svg]:shrink-0 [&_svg]:align-middle',
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

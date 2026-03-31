
import { clsx } from 'clsx'

interface SkeletonProps {
    className?: string
    variant?: 'text' | 'circular' | 'rectangular'
    width?: string | number
    height?: string | number
}

export function Skeleton({
    className,
    variant = 'rectangular',
    width,
    height
}: SkeletonProps) {
    return (
        <div
            className={clsx(
                'animate-pulse bg-slate-border/20',
                variant === 'text' && 'h-4 w-full rounded',
                variant === 'circular' && 'rounded-full',
                variant === 'rectangular' && 'rounded-md',
                className
            )}
            style={{ width, height }}
        />
    )
}

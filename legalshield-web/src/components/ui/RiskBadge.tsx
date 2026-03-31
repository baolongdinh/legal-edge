import { clsx } from 'clsx'

type RiskLevel = 'critical' | 'moderate' | 'note'

interface RiskBadgeProps {
    level: RiskLevel
    label?: string
    className?: string
}

const levelConfig: Record<RiskLevel, { label: string; classes: string }> = {
    critical: {
        label: 'Rủi ro cao',
        classes: 'bg-risk-critical/20 text-red-300 border-risk-critical/40',
    },
    moderate: {
        label: 'Cần xem xét',
        classes: 'bg-risk-moderate/20 text-amber-300 border-risk-moderate/40',
    },
    note: {
        label: 'Lưu ý',
        classes: 'bg-risk-note/20 text-blue-300 border-risk-note/40',
    },
}

export function RiskBadge({ level, label, className }: RiskBadgeProps) {
    const config = levelConfig[level]
    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1.5 whitespace-nowrap leading-none px-2.5 py-1 text-xs font-medium border rounded-full font-sans',
                config.classes,
                className
            )}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
            {label ?? config.label}
        </span>
    )
}

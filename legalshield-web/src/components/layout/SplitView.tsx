import React from 'react'
import { clsx } from 'clsx'

type SplitRatio = '55/45' | '25/75' | '50/50' | '33/67'

const ratioClasses: Record<SplitRatio, [string, string]> = {
    '55/45': ['flex-[55]', 'flex-[45]'],
    '25/75': ['flex-[25]', 'flex-[75]'],
    '50/50': ['flex-1', 'flex-1'],
    '33/67': ['flex-[33]', 'flex-[67]'],
}

interface SplitViewProps {
    left: React.ReactNode
    right: React.ReactNode
    ratio?: SplitRatio
    className?: string
    divider?: boolean
}

export function SplitView({ left, right, ratio = '55/45', className, divider = true }: SplitViewProps) {
    const [leftClass, rightClass] = ratioClasses[ratio]

    return (
        <div className={clsx('flex h-full overflow-hidden', className)}>
            <div className={clsx('overflow-y-auto', leftClass)}>
                {left}
            </div>
            {divider && <div className="w-px bg-slate-border shrink-0" />}
            <div className={clsx('overflow-y-auto', rightClass)}>
                {right}
            </div>
        </div>
    )
}

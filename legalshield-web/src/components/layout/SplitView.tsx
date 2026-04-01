import React from 'react'
import { clsx } from 'clsx'

type SplitRatio = '40/60' | '25/75' | '50/50' | '33/67' | '45/55' | '55/45'

// Use basis percentages to get reliable split on flex containers.
const ratioClasses: Record<SplitRatio, [string, string]> = {
    '40/60': ['basis-[40%]', 'basis-[60%]'],
    '25/75': ['basis-1/4', 'basis-3/4'],
    '50/50': ['basis-1/2', 'basis-1/2'],
    '33/67': ['basis-1/3', 'basis-2/3'],
    '45/55': ['basis-[45%]', 'basis-[55%]'],
    '55/45': ['basis-[55%]', 'basis-[45%]'],
}

interface SplitViewProps {
    left: React.ReactNode
    right: React.ReactNode
    ratio?: SplitRatio
    className?: string
    divider?: boolean
    resizable?: boolean
    storageKey?: string
}

function parseRatio(r: SplitRatio): number {
    const [l] = r.split('/')
    return Number(l)
}

export function SplitView({ left, right, ratio = '40/60', className, divider = true, resizable = true, storageKey }: SplitViewProps) {
    const [leftClass, rightClass] = ratioClasses[ratio]
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const [leftPct, setLeftPct] = React.useState<number>(() => {
        try {
            if (storageKey) {
                const saved = localStorage.getItem(`split:${storageKey}`)
                if (saved) return Number(saved)
            }
        } catch {}
        return parseRatio(ratio)
    })
    const draggingRef = React.useRef(false)

    React.useEffect(() => {
        // Keep in sync if ratio prop changes externally and user hasn't dragged
        if (!draggingRef.current) setLeftPct(parseRatio(ratio))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ratio])

    React.useEffect(() => {
        if (!storageKey) return
        try { localStorage.setItem(`split:${storageKey}`, String(leftPct)) } catch {}
    }, [leftPct, storageKey])

    React.useEffect(() => {
        function onMove(e: PointerEvent) {
            if (!draggingRef.current || !containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const x = e.clientX - rect.left
            const pct = (x / rect.width) * 100
            // Clamp to reasonable bounds for usability
            const clamped = Math.max(20, Math.min(80, pct))
            setLeftPct(clamped)
        }
        function onUp() { draggingRef.current = false; (document.activeElement as HTMLElement | null)?.blur?.() }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
        }
    }, [])

    return (
        <div ref={containerRef} className={clsx('flex h-full overflow-hidden flex-col md:flex-row', className)}>
            <div
                className={clsx('overflow-y-auto min-w-0 md:flex-shrink-0', 'w-full md:w-auto', leftClass)}
                style={resizable ? { flexBasis: `${leftPct}%` } : undefined}
            >
                {left}
            </div>
            {divider && (
                <div
                    className={clsx(
                        'hidden md:block w-px bg-slate-border shrink-0 relative',
                        resizable && 'cursor-col-resize'
                    )}
                    onPointerDown={(e) => { if (!resizable) return; draggingRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) }}
                    role={resizable ? 'separator' : undefined}
                    aria-orientation="vertical"
                    aria-label="Resize panels"
                >
                    {resizable && (
                        <span className="absolute -left-2 top-0 bottom-0 w-4 cursor-col-resize" />
                    )}
                </div>
            )}
            <div
                className={clsx('overflow-y-auto min-w-0 flex-1', 'w-full', rightClass)}
                style={resizable ? { flexBasis: `${100 - leftPct}%` } : undefined}
            >
                {right}
            </div>
        </div>
    )
}

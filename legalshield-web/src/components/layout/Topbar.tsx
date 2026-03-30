import { Bell, User } from 'lucide-react'
import { useUserStore } from '../../store'
import { Typography } from '../ui/Typography'

interface TopbarProps {
    title: string
    subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
    const { user, subscription } = useUserStore()

    const planLabel: Record<typeof subscription, string> = {
        free: 'Miễn phí',
        pro: 'Pro',
        enterprise: 'Enterprise',
    }

    return (
        <header className="h-16 flex items-center justify-between px-6 border-b border-slate-border bg-navy-base/80 backdrop-blur-sm">
            {/* Page title */}
            <div>
                <Typography variant="h3" className="text-lg">
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="caption" className="mt-0.5 block">
                        {subtitle}
                    </Typography>
                )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4">
                {/* Plan pill */}
                <span className="hidden sm:inline-flex items-center px-2.5 py-1 text-xs font-medium border border-gold-primary/40 text-gold-primary rounded-full bg-gold-primary/10">
                    {planLabel[subscription]}
                </span>

                {/* Notifications */}
                <button className="relative p-2 text-slate-muted hover:text-paper-dark transition-colors rounded-lg hover:bg-navy-hover">
                    <Bell size={18} />
                </button>

                {/* Avatar */}
                <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-navy-hover transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gold-primary/20 border border-gold-primary/40 flex items-center justify-center text-gold-primary">
                        <User size={15} />
                    </div>
                    <span className="hidden md:block text-sm text-paper-dark">{user?.name ?? 'Người dùng'}</span>
                </button>
            </div>
        </header>
    )
}

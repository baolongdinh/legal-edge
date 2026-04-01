import { Bell, User, LogOut } from 'lucide-react'
import { useUserStore } from '../../store'
import { Typography } from '../ui/Typography'

interface TopbarProps {
    title: string
    subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
    const { user, subscription, logout } = useUserStore()

    const planLabel: Record<typeof subscription, string> = {
        free: 'Miễn phí',
        pro: 'Pro',
        enterprise: 'Enterprise',
    }

    return (
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-slate-border bg-navy-base/80 backdrop-blur-sm">
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

                {/* Avatar / Profile */}
                <button
                    onClick={() => window.location.href = '/profile'}
                    className="flex items-center gap-2 p-1 rounded-lg hover:bg-navy-hover transition-colors"
                >
                    <div className="w-8 h-8 rounded-full bg-gold-primary/20 border border-gold-primary/40 flex items-center justify-center text-gold-primary overflow-hidden relative">
                        <User size={15} className="absolute inset-0 m-auto text-gold-primary" />
                        {user?.avatarUrl && (
                            <img
                                src={user.avatarUrl}
                                alt={user.name}
                                className="w-full h-full object-cover relative z-10 bg-navy-base"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                        )}
                    </div>
                    <span className="hidden md:block text-sm text-paper-dark font-medium">{user?.name ?? 'Người dùng'}</span>
                </button>

                {/* Logout */}
                <div className="h-6 w-px bg-slate-border mx-1 hidden sm:block" />
                <button
                    onClick={logout}
                    title="Đăng xuất"
                    className="p-2 text-slate-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                >
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    )
}

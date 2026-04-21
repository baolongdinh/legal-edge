import { Bell, User, LogOut } from 'lucide-react'
import { useUserStore } from '../../store'

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
        <header className="h-16 flex items-center justify-between px-6 border-b border-[#e4e2e1] bg-white/90 backdrop-blur-md sticky top-0 z-40">
            {/* Page title */}
            <div>
                <h1 className="text-lg font-serif font-bold text-[#041627] leading-tight">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-[11px] text-slate-500 font-sans tracking-wide">
                        {subtitle}
                    </p>
                )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4">
                {/* Plan pill */}
                <span className="hidden sm:inline-flex items-center px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-[#e4e2e1] text-[#041627] rounded bg-slate-50">
                    {planLabel[subscription]}
                </span>

                {/* Notifications */}
                <button className="relative p-2 text-slate-400 hover:text-[#041627] transition-colors rounded-lg hover:bg-slate-100">
                    <Bell size={18} />
                </button>

                {/* Avatar / Profile */}
                <button
                    onClick={() => window.location.href = '/profile'}
                    className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                    <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-100 flex items-center justify-center overflow-hidden">
                        {user?.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={user.name}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <User size={15} className="text-slate-500" />
                        )}
                    </div>
                    <span className="hidden md:block text-sm text-[#041627] font-medium">{user?.name ?? 'Người dùng'}</span>
                </button>

                {/* Logout */}
                <div className="h-6 w-px bg-[#e4e2e1] mx-1 hidden sm:block" />
                <button
                    onClick={logout}
                    title="Đăng xuất"
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                >
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    )
}

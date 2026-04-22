import { Bell, User, LogOut, Menu } from 'lucide-react'
import { useUserStore, useUIStore } from '../../store'

interface TopbarProps {
    title: string
    subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
    const { user, subscription, logout } = useUserStore()
    const { toggleSidebar } = useUIStore()

    const planLabel: Record<typeof subscription, string> = {
        free: 'Miễn phí',
        pro: 'Pro',
        enterprise: 'Enterprise',
    }

    return (
        <header className="shrink-0 bg-lex-ivory sticky top-0 z-40 pt-[max(env(safe-area-inset-top),16px)]">
            <div className="h-16 flex items-center justify-between px-4 md:px-8">
                {/* Page title */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleSidebar}
                        className="md:hidden p-2 -ml-2 text-lex-lawyer hover:text-lex-deep hover:bg-lex-midnight/5 rounded-full transition-colors"
                    >
                        <Menu size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg md:text-xl font-serif font-bold text-lex-deep tracking-tight truncate pt-[2px]">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-[10px] text-on-surface/40 font-sans uppercase tracking-[0.1em] font-bold">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-6">
                    {/* Plan pill */}
                    <span className="hidden sm:inline-flex items-center px-4 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] bg-lex-midnight text-lex-gold rounded-full shadow-sm">
                        {planLabel[subscription]}
                    </span>

                    {/* Notifications */}
                    <button className="relative p-2 text-on-surface/30 hover:text-lex-deep transition-colors rounded-full hover:bg-lex-midnight/5">
                        <Bell size={20} />
                    </button>

                    {/* Avatar / Profile */}
                    <button
                        onClick={() => window.location.href = '/profile'}
                        className="flex items-center gap-3 p-1 rounded-full hover:bg-lex-midnight/5 transition-all group"
                    >
                        <div className="w-9 h-9 rounded-full bg-surface-container-high border-2 border-white shadow-sm flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
                            {user?.avatarUrl ? (
                                <img
                                    src={user.avatarUrl}
                                    alt={user.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <User size={18} className="text-on-surface/30" />
                            )}
                        </div>
                        <span className="hidden md:block text-sm text-lex-deep font-bold tracking-tight">{user?.name ?? 'Người dùng'}</span>
                    </button>

                    {/* Logout */}
                    <div className="h-6 w-px bg-outline-variant/30 mx-1 hidden sm:block" />
                    <button
                        onClick={logout}
                        title="Đăng xuất"
                        className="p-2 text-on-surface/30 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </div>
        </header>
    )
}

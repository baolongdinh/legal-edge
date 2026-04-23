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
        <header className="shrink-0 bg-lex-ivory sticky top-0 z-40 pt-[max(env(safe-area-inset-top),8px)]">
            <div className="h-14 md:h-16 flex items-center justify-between px-3 md:px-8">
                {/* Page title */}
                <div className="flex items-center gap-2 md:gap-3">
                    <button
                        onClick={toggleSidebar}
                        className="md:hidden p-2 -ml-2 text-lex-lawyer hover:text-lex-deep hover:bg-lex-midnight/5 rounded-full transition-colors"
                    >
                        <Menu size={18} />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-base md:text-xl font-serif font-bold text-lex-deep tracking-tight truncate pt-[2px]">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-[8px] md:text-[10px] text-on-surface/40 font-sans uppercase tracking-[0.1em] font-bold truncate">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3 md:gap-6">
                    {/* Plan pill */}
                    <span className="hidden lg:inline-flex items-center px-4 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] bg-lex-midnight text-lex-gold rounded-full shadow-sm">
                        {planLabel[subscription]}
                    </span>

                    {/* Notifications */}
                    <button className="relative p-2 text-on-surface/30 hover:text-lex-deep transition-colors rounded-full hover:bg-lex-midnight/5">
                        <Bell className="w-[18px] h-[18px] md:w-5 md:h-5" />
                    </button>

                    {/* Avatar / Profile */}
                    <button
                        onClick={() => window.location.href = '/profile'}
                        className="flex items-center gap-2 md:gap-3 p-1 rounded-full hover:bg-lex-midnight/5 transition-all group"
                    >
                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-surface-container-high border-2 border-white shadow-sm flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
                            {user?.avatarUrl ? (
                                <img
                                    src={user.avatarUrl}
                                    alt={user.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <User className="w-4 h-4 md:w-[18px] md:h-[18px] text-on-surface/30" />
                            )}
                        </div>
                        <span className="hidden lg:block text-sm text-lex-deep font-bold tracking-tight">{user?.name ?? 'Người dùng'}</span>
                    </button>

                    {/* Logout */}
                    <div className="h-6 w-px bg-outline-variant/30 mx-1 hidden lg:block" />
                    <button
                        onClick={logout}
                        title="Đăng xuất"
                        className="p-2 text-on-surface/30 hover:text-red-600 transition-colors rounded-full hover:bg-red-50 hidden sm:block"
                    >
                        <LogOut className="w-[18px] h-[18px] md:w-5 md:h-5" />
                    </button>
                </div>
            </div>
        </header>
    )
}

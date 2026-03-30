import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
    LayoutDashboard, FileSearch, MessageSquare, FilePen,
    BookOpen, Settings, ChevronLeft, Scale
} from 'lucide-react'
import { useUIStore } from '../../store'

const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/analysis', icon: FileSearch, label: 'Phân tích HĐ' },
    { to: '/chat', icon: MessageSquare, label: 'Tư vấn AI' },
    { to: '/editor', icon: FilePen, label: 'Soạn thảo' },
    { to: '/clauses', icon: BookOpen, label: 'Kho điều khoản' },
]

export function Sidebar() {
    const { pathname } = useLocation()
    const { sidebarExpanded, toggleSidebar } = useUIStore()

    return (
        <aside
            className={clsx(
                'flex flex-col h-full bg-navy-elevated border-r border-slate-border transition-all duration-300',
                sidebarExpanded ? 'w-56' : 'w-16'
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-border">
                <Scale className="text-gold-primary shrink-0" size={22} />
                {sidebarExpanded && (
                    <span className="font-serif font-semibold text-paper-dark text-base leading-none animate-fade-in">
                        LegalShield
                    </span>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 py-4 space-y-1 px-2 overflow-hidden">
                {navItems.map(({ to, icon: Icon, label }) => {
                    const active = pathname.startsWith(to)
                    return (
                        <Link
                            key={to}
                            to={to}
                            title={!sidebarExpanded ? label : undefined}
                            className={clsx(
                                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200',
                                active
                                    ? 'bg-gold-primary/15 text-gold-primary border border-gold-primary/25'
                                    : 'text-slate-muted hover:bg-navy-hover hover:text-paper-dark'
                            )}
                        >
                            <Icon size={18} className="shrink-0" />
                            {sidebarExpanded && <span className="animate-fade-in truncate">{label}</span>}
                        </Link>
                    )
                })}
            </nav>

            {/* Settings + Collapse */}
            <div className="border-t border-slate-border py-3 px-2 space-y-1">
                <Link
                    to="/settings"
                    title={!sidebarExpanded ? 'Cài đặt' : undefined}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-slate-muted hover:bg-navy-hover hover:text-paper-dark transition-all duration-200"
                >
                    <Settings size={18} className="shrink-0" />
                    {sidebarExpanded && <span className="animate-fade-in">Cài đặt</span>}
                </Link>
                <button
                    onClick={toggleSidebar}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-slate-muted hover:text-paper-dark transition-colors duration-200"
                >
                    <ChevronLeft
                        size={16}
                        className={clsx('transition-transform duration-300', !sidebarExpanded && 'rotate-180')}
                    />
                    {sidebarExpanded && <span className="text-xs animate-fade-in">Thu gọn</span>}
                </button>
            </div>
        </aside>
    )
}

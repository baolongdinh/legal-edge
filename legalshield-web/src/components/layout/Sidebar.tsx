import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
    LayoutDashboard, FileSearch, MessageSquare, FilePen,
    Settings, ChevronLeft, Scale
} from 'lucide-react'
import { useUIStore } from '../../store'

const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/analysis', icon: FileSearch, label: 'Phân tích HĐ' },
    { to: '/chat', icon: MessageSquare, label: 'Tư vấn AI' },
    { to: '/editor', icon: FilePen, label: 'Soạn thảo' },
]

export function Sidebar() {
    const { pathname } = useLocation()
    const { sidebarExpanded, toggleSidebar } = useUIStore()

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768 && sidebarExpanded) {
                toggleSidebar()
            }
        }
        handleResize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [sidebarExpanded, toggleSidebar])

    return (
        <aside
            className={clsx(
                'flex flex-col h-full bg-[#020617] border-r border-slate-800 transition-all duration-300 relative z-50',
                sidebarExpanded ? 'w-64' : 'w-16 md:w-20'
            )}
        >
            {/* Brand Header - Institutional Style */}
            <div className={clsx('px-5 py-8 transition-opacity duration-300', !sidebarExpanded && 'opacity-0')}>
                <div className="flex items-center gap-2 mb-1">
                    <Scale size={20} className="text-amber-200" />
                    <h1 className="font-serif italic text-xl text-amber-200 tracking-tight">
                        LegalShield
                    </h1>
                </div>
                <p className="font-sans text-[9px] uppercase tracking-[0.2em] text-slate-500">
                    Institutional Intelligence
                </p>
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
                                'flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-all duration-200 border-l-4',
                                !sidebarExpanded && 'justify-center px-0 border-l-0',
                                active
                                    ? 'bg-slate-900 text-amber-200 border-amber-200'
                                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200 border-transparent'
                            )}
                        >
                            <Icon size={20} className={clsx('shrink-0', active && 'fill-current')} />
                            {sidebarExpanded && <span className="animate-fade-in truncate">{label}</span>}
                        </Link>
                    )
                })}
            </nav>

            {/* Settings + Collapse */}
            <div className="border-t border-slate-900 py-4 px-2 space-y-1">
                <Link
                    to="/settings"
                    title={!sidebarExpanded ? 'Cài đặt' : undefined}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-all duration-200"
                >
                    <Settings size={18} className="shrink-0" />
                    {sidebarExpanded && <span className="animate-fade-in">Cài đặt</span>}
                </Link>
                <button
                    onClick={toggleSidebar}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-slate-500 hover:text-slate-200 transition-colors duration-200"
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

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
    { to: '/chat', icon: MessageSquare, label: 'Tra cứu' },
    { to: '/editor', icon: FilePen, label: 'Soạn thảo' },
]

export function Sidebar() {
    const { pathname } = useLocation()
    const { sidebarExpanded, toggleSidebar } = useUIStore()

    useEffect(() => {
        let isMobile = window.innerWidth < 768;
        const handleResize = () => {
            const nowMobile = window.innerWidth < 768;
            if (isMobile !== nowMobile) {
                isMobile = nowMobile;
                useUIStore.setState({ sidebarExpanded: !nowMobile });
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <>
            {/* Mobile Backdrop */}
            <div
                className={clsx(
                    "fixed inset-0 bg-lex-deep/40 backdrop-blur-sm z-[90] md:hidden transition-opacity duration-300",
                    sidebarExpanded ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={toggleSidebar}
            />
            <aside
                className={clsx(
                    'flex flex-col h-full bg-lex-deep transition-all duration-300 fixed inset-y-0 left-0 z-[100] md:relative md:z-50 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)]',
                    sidebarExpanded ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-20 md:translate-x-0'
                )}
            >
                {/* Brand Header - Institutional Style */}
                <div className={clsx('px-5 py-8 transition-opacity duration-300', !sidebarExpanded && 'opacity-0')}>
                    <div className="flex items-center gap-2 mb-1">
                        <Scale size={24} className="text-lex-gold" />
                        <h1 className="font-serif text-2xl text-lex-ivory tracking-tight font-bold">
                            LegalShield
                        </h1>
                    </div>
                    <p className="font-sans text-[10px] uppercase tracking-[0.2em] text-lex-gold/60 font-bold">
                        Tra cứu quy chuẩn Luật Việt Nam
                    </p>
                </div>

                {/* Nav */}
                <nav className="flex-1 py-4 space-y-2 px-3 overflow-hidden">
                    {navItems.map(({ to, icon: Icon, label }) => {
                        const active = pathname.startsWith(to)
                        return (
                            <Link
                                key={to}
                                to={to}
                                title={!sidebarExpanded ? label : undefined}
                                className={clsx(
                                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-300',
                                    !sidebarExpanded && 'justify-center px-0',
                                    active
                                        ? 'bg-lex-midnight text-lex-gold shadow-lg shadow-black/10'
                                        : 'text-lex-ivory/60 hover:bg-lex-midnight/50 hover:text-lex-ivory'
                                )}
                            >
                                <Icon size={20} className={clsx('shrink-0', active && 'text-lex-gold')} />
                                {sidebarExpanded && <span className="font-sans tracking-wide truncate">{label}</span>}
                            </Link>
                        )
                    })}
                </nav>

                {/* Settings + Collapse */}
                <div className="border-t border-lex-midnight py-4 px-2 space-y-1 mt-auto pb-8">
                    <Link
                        to="/settings"
                        title={!sidebarExpanded ? 'Cài đặt' : undefined}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-lex-ivory/40 hover:bg-lex-midnight/50 hover:text-lex-ivory transition-all duration-200"
                    >
                        <Settings size={18} className="shrink-0" />
                        {sidebarExpanded && <span className="font-sans">Cài đặt</span>}
                    </Link>
                    <button
                        onClick={toggleSidebar}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-lex-ivory/30 hover:text-lex-gold transition-colors duration-200"
                    >
                        <ChevronLeft
                            size={16}
                            className={clsx('transition-transform duration-300', !sidebarExpanded && 'rotate-180')}
                        />
                        {sidebarExpanded && <span className="text-[10px] uppercase tracking-widest font-bold">Thu gọn</span>}
                    </button>
                </div>
            </aside>
        </>
    )
}

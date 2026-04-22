import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    FileText,
    TrendingUp,
    Plus,
    Trash2,
    Clock,
    Gavel,
    ShieldAlert,
    ChevronRight,
    SearchCheck
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Dialog } from '../components/ui/Dialog'
import { Skeleton } from '../components/ui/Skeleton'
import { deleteFileAssets, supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

interface ContractWithRisks {
    id: string
    title: string
    created_at: string
    status: string
    risk_count: number
    max_risk_level: 'critical' | 'moderate' | 'note'
    updated_at: string
}

interface DashboardStatsRow {
    total_contracts: number
    analyzed_count: number
    pending_audit_count: number
    total_risks: number
}

function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'vừa xong'
    if (diffMins < 60) return `${diffMins} phút trước`
    if (diffHours < 24) return `${diffHours} giờ trước`
    return `${diffDays} ngày trước`
}

export function Dashboard() {
    const [contracts, setContracts] = useState<ContractWithRisks[]>([])
    const [loading, setLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [confirmId, setConfirmId] = useState<string | null>(null)
    const [stats, setStats] = useState({
        total: 0,
        analyzed: '0%',
        risks: 0,
    })

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            await supabase.rpc('refresh_contract_stats')
            fetchData()
            toast.success('Đã cập nhật dữ liệu')
        } catch (err) {
            toast.error('Cập nhật thất bại')
        } finally {
            setIsRefreshing(false)
        }
    }

    const confirmDelete = async () => {
        if (!confirmId) return

        const originalContracts = [...contracts]

        // Optimistic update
        setContracts(prev => prev.filter(c => c.id !== confirmId))
        setConfirmId(null)

        try {
            await deleteFileAssets({
                contract_id: confirmId,
                delete_contract: true,
                delete_document: true,
            })
            toast.success('Hợp đồng đã được xóa')
            // Refresh stats in background
            fetchData()
        } catch (err) {
            // Rollback
            setContracts(originalContracts)
            toast.error('Xóa hợp đồng thất bại')
        }
    }

    async function fetchData() {
        try {
            const [{ data: statsData }, { data: contractsData }] = await Promise.all([
                supabase.rpc('get_my_stats'),
                supabase.rpc('list_my_contract_summaries', { p_limit: 10, p_offset: 0 }),
            ])

            const statsRow = (statsData as DashboardStatsRow[] | null)?.[0]
            const formatted = (contractsData || []) as ContractWithRisks[]
            setContracts(formatted)

            const total = statsRow?.total_contracts ?? 0
            const analyzed = total > 0 ? Math.round(((statsRow?.analyzed_count ?? 0) / total) * 100) : 0

            setStats({
                total,
                analyzed: `${analyzed}%`,
                risks: statsRow?.total_risks ?? 0,
            })
        } catch (err) {
            console.error('Error fetching dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    if (loading) {
        return (
            <div className="h-full bg-background p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton height={160} className="rounded-2xl" />
                    <Skeleton height={160} className="rounded-2xl" />
                    <Skeleton height={160} className="rounded-2xl" />
                </div>
                <div className="space-y-4">
                    <Skeleton height={400} className="rounded-2xl" />
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-background overflow-y-auto">
            <Dialog
                isOpen={!!confirmId}
                onClose={() => setConfirmId(null)}
                onConfirm={confirmDelete}
                variant="danger"
                title="Xác nhận xóa"
                description="Hành động này sẽ xóa vĩnh viễn hợp đồng. Không thể hoàn tác."
                confirmText="Xóa vĩnh viễn"
            />

            {/* Header section - Premium Editorial Style */}
            <header className="px-6 md:px-10 pt-6 md:pt-10 pb-4 md:pb-6 flex flex-col md:flex-row md:justify-between items-start md:items-end w-full gap-4 md:gap-0">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <SearchCheck size={16} className="text-lex-gold" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-lex-deep/40">Tổng quan hệ thống</span>
                    </div>
                    <h2 className="font-serif text-2xl md:text-4xl font-bold text-lex-deep tracking-tight leading-tight">Khu lưu trữ Chủ quyền</h2>
                    <p className="text-xs md:text-sm font-sans text-slate-gray mt-2 font-medium">Báo cáo tình trạng quy chuẩn hiện tại của tổ chức.</p>
                </div>
                <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
                    <button
                        onClick={handleRefresh}
                        className={cn(
                            "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl md:rounded-full border border-outline-variant hover:bg-surface-container-low transition-all text-[10px] md:text-xs font-bold text-lex-deep uppercase tracking-wider",
                            isRefreshing && "opacity-50 pointer-events-none"
                        )}
                    >
                        <Clock size={14} className={cn(isRefreshing && "animate-spin")} />
                        Làm mới
                    </button>
                    <Link to="/analysis" className="flex-1 md:flex-none">
                        <Button variant="primary" className="w-full flex items-center justify-center gap-2 px-6 rounded-xl md:rounded-full shadow-lg shadow-lex-deep/10 text-[10px] md:text-xs">
                            <Plus size={18} />
                            Hợp đồng mới
                        </Button>
                    </Link>
                </div>
            </header>

            <div className="px-6 md:px-10 pb-8 md:pb-12 space-y-6 md:space-y-10">
                {/* Bento Stats Grid */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <StatCard
                        icon={<FileText size={24} />}
                        label="Lưu trữ"
                        value={stats.total.toLocaleString()}
                        sub="Hợp đồng đang quản lý"
                        delay={0.1}
                    />
                    <StatCard
                        icon={<TrendingUp size={24} />}
                        label="Phân tích"
                        value={stats.analyzed}
                        sub="Hoàn tất đánh giá rủi ro"
                        delay={0.2}
                    />
                    <StatCard
                        icon={<ShieldAlert size={24} />}
                        label="Cảnh báo"
                        value={stats.risks.toLocaleString()}
                        sub="Rủi ro cần can thiệp"
                        variant="dark"
                        delay={0.3}
                    />
                </section>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                    {/* Docket List */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
                        className="lg:col-span-8 bg-white rounded-2xl md:rounded-3xl p-6 md:p-10 subtle-elevation"
                    >
                        <div className="flex justify-between items-center mb-6 md:mb-10">
                            <div className="flex items-center gap-3">
                                <div className="w-1 md:w-1.5 h-6 md:h-8 bg-lex-gold rounded-full" />
                                <h3 className="font-serif text-xl md:text-3xl font-bold text-lex-deep">Hồ sơ gần đây</h3>
                            </div>
                            <Link to="/analysis" className="text-[9px] md:text-[10px] font-sans uppercase tracking-[0.2em] md:tracking-[0.3em] text-lex-gold font-bold hover:text-lex-midnight transition-all">
                                Xem tất cả
                            </Link>
                        </div>

                        <div className="space-y-2">
                            <AnimatePresence mode="popLayout">
                                {contracts.length === 0 ? (
                                    <div className="py-24 text-center opacity-30">
                                        <p className="font-sans text-xs tracking-[0.4em] uppercase font-bold italic">Chưa có dữ liệu</p>
                                    </div>
                                ) : (
                                    contracts.map((contract, i) => (
                                        <motion.div
                                            key={contract.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 + i * 0.04, duration: 0.5 }}
                                            className="group flex items-center justify-between p-5 rounded-2xl hover:bg-surface-container-low transition-all cursor-pointer border border-transparent hover:border-lex-border"
                                        >
                                            <div className="flex items-center gap-6 flex-1 min-w-0">
                                                <div className="w-14 h-14 bg-surface rounded-2xl flex items-center justify-center text-lex-deep shrink-0 border border-lex-border group-hover:scale-110 transition-all duration-500 group-hover:bg-lex-deep group-hover:text-lex-ivory">
                                                    <Gavel size={24} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-serif font-bold text-lex-deep truncate group-hover:text-lex-gold transition-colors text-xl">
                                                        {contract.title}
                                                    </h4>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <span className="text-[10px] uppercase tracking-wider text-lex-lawyer/60 font-bold">
                                                            {formatRelativeTime(contract.updated_at || contract.created_at)}
                                                        </span>
                                                        <span className="w-1 h-1 bg-lex-border rounded-full" />
                                                        <span className="text-[10px] uppercase tracking-wider text-lex-lawyer/60 font-bold">
                                                            ID: {contract.id.slice(0, 8)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 md:gap-10 ml-4">
                                                <div className="scale-90 md:scale-110">
                                                    <RiskBadge level={contract.max_risk_level} />
                                                </div>
                                                <div className="flex gap-1 md:gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all md:translate-x-4 md:group-hover:translate-x-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            setConfirmId(contract.id);
                                                        }}
                                                        className="p-2.5 rounded-full text-red-400 hover:text-white hover:bg-red-500 transition-all duration-300"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                    <Link to={`/analysis?id=${contract.id}`} className="p-2.5 rounded-full text-lex-deep/40 hover:text-lex-gold hover:bg-lex-deep/5 transition-all duration-300">
                                                        <ChevronRight size={24} />
                                                    </Link>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* Sidebar Widgets */}
                    <div className="lg:col-span-4 space-y-8">
                        {/* News Integration */}
                        {/* <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            className="bg-surface-bright p-10 rounded-3xl border border-lex-border shadow-[0_4px_30px_-4px_rgba(11,28,26,0.04)]"
                        >
                            <div className="flex items-center justify-between mb-8 text-lex-deep">
                                <h4 className="font-serif font-bold text-xl">Pháp chế mới</h4>
                                <History size={20} className="text-lex-gold" />
                            </div>
                            <div className="space-y-6">
                                <div className="p-5 bg-surface-container-low rounded-2xl border border-lex-border relative overflow-hidden group">
                                    <div className="absolute left-0 top-0 w-1.5 h-full bg-lex-gold" />
                                    <p className="text-sm font-sans text-lex-deep leading-relaxed font-bold italic">
                                        Nghị định mới về bảo vệ dữ liệu cá nhân (VNDP) vừa được cập nhật. <span className="text-lex-gold underline decoration-lex-gold/30">12 hợp đồng</span> của bạn có thể chịu tác động.
                                    </p>
                                </div>
                                <button className="w-full py-5 bg-lex-deep text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-lex-midnight transition-all shadow-xl shadow-lex-deep/20 hover:scale-[1.02] active:scale-95 duration-300">
                                    XEM TÁC ĐỘNG QUY CHUẨN
                                </button>
                            </div>
                        </motion.div> */}

                        {/* Recent Activity */}
                        {/* <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.6, delay: 0.7 }}
                            className="bg-lex-deep p-10 rounded-3xl shadow-2xl shadow-lex-deep/20 relative overflow-hidden group border border-lex-midnight"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-700">
                                <ShieldAlert size={120} className="text-lex-gold" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-2 h-2 bg-lex-gold rounded-full animate-pulse" />
                                    <h4 className="font-serif font-bold text-lex-ivory text-xl">Tình trạng hệ thống</h4>
                                </div>
                                <p className="text-lex-gold/60 text-[10px] font-bold uppercase tracking-[0.3em] mb-8 border-b border-white/5 pb-4">
                                    Archive Integrity Protocol
                                </p>
                                <div className="flex items-end justify-between mt-4">
                                    <div className="space-y-2">
                                        <p className="text-lex-ivory/30 text-xs font-medium tracking-tight">Active Defense Layer</p>
                                        <p className="text-lex-ivory text-3xl font-serif font-bold italic tracking-wide">Toàn vẹn</p>
                                    </div>
                                    <div className="w-14 h-14 bg-lex-midnight/50 border border-white/5 rounded-full flex items-center justify-center text-lex-gold group-hover:rotate-12 transition-transform duration-500">
                                        <Bell size={24} />
                                    </div>
                                </div>
                            </div>
                        </motion.div> */}
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ icon, label, value, sub, variant = 'default', delay = 0 }: { icon: React.ReactNode, label: string, value: string, sub: string, variant?: 'default' | 'dark', delay?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay }}
            className={cn(
                "p-6 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] flex flex-col justify-between h-44 md:h-64 transition-all duration-700 shadow-[0_8px_30px_rgb(0,0,0,0.02)] group border",
                variant === 'dark'
                    ? "bg-lex-deep text-white shadow-lex-deep/20 border-lex-midnight"
                    : "bg-white text-lex-deep subtle-elevation hover:-translate-y-2"
            )}
        >
            <div className="flex justify-between items-start">
                <div className={cn(
                    "p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-500",
                    variant === 'dark' ? "bg-lex-midnight text-lex-gold" : "bg-surface text-lex-gold group-hover:bg-lex-gold group-hover:text-white"
                )}>
                    {/* Scale down icon on mobile */}
                    <div className="scale-75 md:scale-100">
                        {icon}
                    </div>
                </div>
                <span className={cn(
                    "text-[8px] md:text-[10px] font-sans uppercase tracking-[0.4em] font-bold",
                    variant === 'dark' ? "text-lex-gold" : "text-lex-lawyer/40"
                )}>
                    {label}
                </span>
            </div>
            <div className="mt-3 md:mt-6">
                <h3 className="text-3xl md:text-6xl font-serif font-bold tracking-tighter mb-1 md:mb-2">{value}</h3>
                <p className={cn(
                    "text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em]",
                    variant === 'dark' ? "text-lex-ivory/40" : "text-lex-lawyer/50"
                )}>{sub}</p>
            </div>
        </motion.div>
    )
}

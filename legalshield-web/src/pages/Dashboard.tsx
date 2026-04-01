import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileText, AlertTriangle, TrendingUp, Plus, Loader2, Trash2, Sparkles, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Typography } from '../components/ui/Typography'
import { Dialog } from '../components/ui/Dialog'
import { Skeleton } from '../components/ui/Skeleton'
import { deleteFileAssets, supabase } from '../lib/supabase'

interface ContractWithRisks {
    id: string
    title: string
    created_at: string
    status: string
    risk_count: number
    max_risk_level: 'critical' | 'moderate' | 'note'
}

interface DashboardStat {
    label: string
    value: string
    icon: typeof FileText
    tone?: 'default' | 'danger' | 'accent'
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
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [stats, setStats] = useState<DashboardStat[]>([
        { label: 'Hợp đồng đã tải lên', value: '0', icon: FileText },
        { label: 'Bản phân tích hoàn tất', value: '0', icon: Sparkles },
        { label: 'Rủi ro đã phát hiện', value: '0', icon: AlertTriangle, tone: 'danger' },
        { label: 'Đang chờ audit', value: '0', icon: TrendingUp, tone: 'accent' },
    ])

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            const { error } = await supabase.rpc('refresh_contract_stats')
            if (error) {
                console.warn('refresh_contract_stats failed:', error.message)
            }
            fetchData()
            toast.success('Đã cập nhật số liệu mới nhất')
        } catch (err) {
            console.error('Refresh failed:', err)
            toast.error('Cập nhật thất bại')
        } finally {
            setIsRefreshing(false)
        }
    }

    const confirmDelete = async () => {
        if (!confirmId) return
        setIsDeleting(true)
        try {
            setDeletingId(confirmId)
            await deleteFileAssets({
                contract_id: confirmId,
                delete_contract: true,
                delete_document: true,
            })

            setContracts(prev => prev.filter(c => c.id !== confirmId))
            toast.success('Hợp đồng đã được xóa thành công')
        } catch (err) {
            console.error('Delete failed:', err)
            toast.error('Xóa hợp đồng thất bại. Vui lòng thử lại.')
        } finally {
            setIsDeleting(false)
            setConfirmId(null)
            setDeletingId(null)
        }
    }

    async function fetchData() {
        try {
            const { data: contractsData, error: contractsError } = await supabase
                .from('contracts')
                .select(`
                    id, title, created_at, status,
                    contract_risks ( level )
                `)
                .order('created_at', { ascending: false })

            if (contractsError) throw contractsError

            const formatted: ContractWithRisks[] = (contractsData || []).map(c => {
                const risks = c.contract_risks as any[]
                const levels = risks.map(r => r.level)
                let maxLevel: any = 'note'
                if (levels.includes('critical')) maxLevel = 'critical'
                else if (levels.includes('moderate')) maxLevel = 'moderate'

                return {
                    id: c.id,
                    title: c.title,
                    created_at: c.created_at,
                    status: c.status,
                    risk_count: risks.length,
                    max_risk_level: maxLevel
                }
            })

            setContracts(formatted)

            const totalContracts = formatted.length
            const completedAnalyses = formatted.filter((c) => c.status === 'completed' || c.risk_count > 0).length
            const totalRisks = formatted.reduce((sum, contract) => sum + contract.risk_count, 0)
            const pendingAudits = formatted.filter((c) => c.status === 'pending_audit').length

            setStats([
                { label: 'Hợp đồng đã tải lên', value: totalContracts.toString(), icon: FileText },
                { label: 'Bản phân tích hoàn tất', value: completedAnalyses.toString(), icon: Sparkles },
                { label: 'Rủi ro đã phát hiện', value: totalRisks.toString(), icon: AlertTriangle, tone: 'danger' },
                { label: 'Đang chờ audit', value: pendingAudits.toString(), icon: TrendingUp, tone: 'accent' },
            ])
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
            <div className="h-full p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} height={80} className="rounded-lg" />)}
                </div>
                <div className="flex justify-between items-center">
                    <Skeleton width={150} height={24} />
                    <Skeleton width={120} height={32} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={120} className="rounded-lg" />)}
                </div>
            </div>
        )
    }

    return (
        <div className="h-full overflow-y-auto p-6 space-y-8 text-paper-dark relative">
            <Dialog
                isOpen={!!confirmId}
                onClose={() => setConfirmId(null)}
                onConfirm={confirmDelete}
                variant="danger"
                title="Xóa hợp đồng?"
                description="Hành động này sẽ xóa vĩnh viễn hợp đồng và các bản phân tích rủi ro liên quan. Bạn không thể hoàn tác thao tác này."
                confirmText="Xóa vĩnh viễn"
                isLoading={isDeleting}
            />

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                {stats.map(({ label, value, icon: Icon, tone = 'default' }, index) => (
                    <motion.div
                        key={label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-4 p-5 bg-navy-elevated/40 backdrop-blur-md rounded-xl border border-slate-border/30 shadow-lg relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-gold-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ring-1 ${
                            tone === 'danger'
                                ? 'bg-red-500/10 text-red-300 ring-red-500/20'
                                : tone === 'accent'
                                    ? 'bg-blue-500/10 text-blue-300 ring-blue-500/20'
                                    : 'bg-gold-primary/10 text-gold-primary ring-gold-primary/20'
                        }`}>
                            <Icon size={24} />
                        </div>
                        <div className="relative z-10">
                            <p className={`text-3xl font-serif font-bold ${
                                tone === 'danger'
                                    ? 'text-red-300'
                                    : tone === 'accent'
                                        ? 'text-blue-300'
                                        : 'text-gradient-gold'
                            }`}>{value}</p>
                            <Typography variant="caption" className="text-paper-dark/60 font-medium uppercase tracking-wider">{label}</Typography>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Header + action */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Typography variant="h2" className="text-2xl font-serif">Hợp đồng gần đây</Typography>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="p-1.5 rounded-full hover:bg-slate-border/20 transition-colors disabled:opacity-50"
                        title="Làm mới dữ liệu"
                    >
                        <Clock size={16} className={isRefreshing ? 'animate-spin' : 'text-paper-dark/50'} />
                    </button>
                </div>
                <Link to="/analysis">
                    <Button size="sm" variant="ghost" className="gap-2 border-gold-primary/30">
                        <Plus size={16} /> Phân tích mới
                    </Button>
                </Link>
            </div>

            {/* Contract cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnimatePresence mode="popLayout">
                    {contracts.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="col-span-full py-24 text-center border-2 border-dashed border-slate-border/20 rounded-2xl bg-navy-elevated/20"
                        >
                            <FileText className="mx-auto mb-4 text-slate-muted/30" size={56} />
                            <Typography variant="h3" className="text-xl mb-2">Chưa có dữ liệu</Typography>
                            <Typography variant="body" className="text-paper-dark/50 max-w-xs mx-auto mb-6">Bắt đầu tải lên hợp đồng đầu tiên để AI phân tích rủi ro giúp bạn.</Typography>
                            <Link to="/analysis">
                                <Button variant="primary" size="md">Bắt đầu ngay</Button>
                            </Link>
                        </motion.div>
                    ) : (
                        contracts.map((c, index) => (
                            <motion.div
                                key={c.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8, x: -50 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 25, delay: index * 0.05 }}
                                className="group/card"
                            >
                                <Link to={`/analysis?id=${c.id}`} className="block h-full">
                                    <div className="relative h-full p-6 bg-navy-elevated/40 backdrop-blur-sm rounded-xl border border-slate-border/30 hover:border-gold-primary/40 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_20px_rgba(201,168,76,0.1)] transition-all duration-300 group overflow-hidden">
                                        <div className="absolute top-0 right-0 p-6 opacity-0 group-hover/card:opacity-100 transition-all z-20">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    setConfirmId(c.id)
                                                }}
                                                disabled={deletingId === c.id}
                                                className="p-2 rounded-lg text-paper-dark/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                                title="Xóa hợp đồng"
                                            >
                                                {deletingId === c.id
                                                    ? <Loader2 size={16} className="animate-spin" />
                                                    : <Trash2 size={16} />}
                                            </button>
                                        </div>

                                        <div className="flex flex-col h-full">
                                            <div className="flex items-start justify-between gap-4 mb-4 pr-8">
                                                <Typography variant="h3" className="text-lg font-serif group-hover:text-gold-primary transition-colors line-clamp-2">
                                                    {c.title}
                                                </Typography>
                                                <RiskBadge level={c.max_risk_level} />
                                            </div>

                                            <div className="mt-auto flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <span className="px-2.5 py-1 rounded-md bg-navy-base border border-slate-border/30 text-[10px] uppercase font-bold tracking-widest text-paper-dark/60">
                                                        {c.risk_count} rủi ro
                                                    </span>
                                                    <Typography variant="caption" className="text-xs text-paper-dark/40 italic">
                                                        {formatRelativeTime(c.created_at)}
                                                    </Typography>
                                                </div>
                                                <div className="w-8 h-8 rounded-full border border-gold-primary/20 flex items-center justify-center text-gold-primary group-hover:bg-gold-primary group-hover:text-navy-base transition-all">
                                                    <TrendingUp size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

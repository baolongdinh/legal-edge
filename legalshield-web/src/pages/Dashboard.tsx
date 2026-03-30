import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Clock, TrendingUp, Plus, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Typography } from '../components/ui/Typography'
import { supabase } from '../lib/supabase'

interface ContractWithRisks {
    id: string
    title: string
    created_at: string
    status: string
    risk_count: number
    max_risk_level: 'critical' | 'moderate' | 'note'
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
    const [stats, setStats] = useState([
        { label: 'Hợp đồng đã phân tích', value: '0', icon: FileText },
        { label: 'Rủi ro được phát hiện', value: '0', icon: TrendingUp },
        { label: 'Giờ tiết kiệm được', value: '0h', icon: Clock },
    ])

    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch contracts with their risks
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

                // Calculate stats
                const totalContracts = formatted.length
                const totalRisks = formatted.reduce((acc, curr) => acc + curr.risk_count, 0)
                const hoursSaved = Math.floor(totalContracts * 0.75) // Assume 45 mins per contract

                setStats([
                    { label: 'Hợp đồng đã phân tích', value: totalContracts.toString(), icon: FileText },
                    { label: 'Rủi ro được phát hiện', value: totalRisks.toString(), icon: TrendingUp },
                    { label: 'Giờ tiết kiệm được', value: `${hoursSaved}h`, icon: Clock },
                ])
            } catch (err) {
                console.error('Error fetching dashboard data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-gold-primary animate-spin" />
            </div>
        )
    }

    return (
        <div className="h-full overflow-y-auto p-6 space-y-6 animate-slide-up text-paper-dark">
            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {stats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-4 p-4 bg-navy-elevated rounded-lg border border-slate-border">
                        <div className="w-10 h-10 rounded-md bg-gold-primary/15 flex items-center justify-center text-gold-primary">
                            <Icon size={20} />
                        </div>
                        <div>
                            <p className="text-2xl font-serif font-semibold">{value}</p>
                            <Typography variant="caption">{label}</Typography>
                        </div>
                    </div>
                ))}
            </div>

            {/* Header + action */}
            <div className="flex items-center justify-between">
                <Typography variant="h3" className="text-lg">Hợp đồng gần đây</Typography>
                <Link to="/analysis">
                    <Button size="sm" variant="ghost">
                        <Plus size={15} /> Phân tích mới
                    </Button>
                </Link>
            </div>

            {/* Contract cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contracts.length === 0 ? (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-border rounded-xl">
                        <FileText className="mx-auto mb-4 text-slate-muted/50" size={48} />
                        <Typography variant="subtitle" className="text-sm">Chưa có hợp đồng nào. Hãy bắt đầu phân tích hợp đồng đầu tiên!</Typography>
                        <Link to="/analysis" className="mt-4 inline-block">
                            <Button variant="ghost" size="sm">Tải lên ngay</Button>
                        </Link>
                    </div>
                ) : (
                    contracts.map((c) => (
                        <Link key={c.id} to={`/analysis?id=${c.id}`} className="block">
                            <div className="p-5 bg-navy-elevated rounded-lg card-hover cursor-pointer border border-slate-border/50">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <Typography variant="body" className="font-medium leading-snug">{c.title}</Typography>
                                    <RiskBadge level={c.max_risk_level} />
                                </div>
                                <div className="flex items-center gap-3">
                                    <Typography variant="caption" className="px-2 py-0.5 rounded bg-slate-border/40 text-xs uppercase tracking-tighter">
                                        {c.risk_count} rủi ro
                                    </Typography>
                                    <Typography variant="caption">{formatRelativeTime(c.created_at)}</Typography>
                                </div>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    )
}

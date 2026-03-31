import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Scale, Shield, Zap, Sparkles } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { usePayment } from '../store'

const plans = [
    {
        id: 'free',
        name: 'Miễn phí', price: '0đ', period: '/vĩnh viễn',
        description: 'Dành cho cá nhân làm quen với AI Pháp Lý',
        features: ['10 phân tích / tháng', 'Dữ liệu VBPL cơ bản', '3 Template chuẩn Quốc tế'],
        cta: 'Bắt đầu ngay', ctaVariant: 'ghost' as const,
        highlight: false,
        icon: Shield
    },
    {
        id: 'pro',
        name: 'Professional', price: '990.000đ', period: '/tháng',
        description: 'Giải pháp toàn diện cho Startup & SME',
        features: [
            'Phân tích không giới hạn',
            'RAG Chuyên sâu + Án lệ VN',
            'Soạn thảo AI đa ngôn ngữ',
            'Xuất bản PDF bảo mật cao',
            'Hỗ trợ Luật sư 24/7'
        ],
        cta: 'Nâng cấp Pro', ctaVariant: 'primary' as const,
        highlight: true,
        icon: Zap
    },
    {
        id: 'enterprise',
        name: 'Enterprise', price: 'Liên hệ', period: '',
        description: 'Tối ưu cho Công ty Luật & Tập đoàn',
        features: [
            'Hạ tầng Supavisor riêng',
            'Fine-tuned Model riêng',
            'Tích hợp API hệ thống cũ',
            'Quản trị viên Dedicated',
            'SLA cam kết 99.9%'
        ],
        cta: 'Liên hệ Sales', ctaVariant: 'outline' as const,
        highlight: false,
        icon: Sparkles
    },
]

export function Pricing() {
    const navigate = useNavigate()
    const { processPayment, isLoading } = usePayment()

    const handlePlanSelect = async (planId: string) => {
        if (planId === 'free') {
            navigate('/dashboard')
        } else if (planId === 'pro') {
            processPayment('stripe', 'pro')
        } else {
            window.location.assign('mailto:sales@legalshield.vn')
        }
    }

    return (
        <div className="min-h-screen bg-navy-base font-sans selection:bg-gold-primary/30 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-gold-primary/5 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />

            {/* Nav */}
            <motion.nav
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between px-8 py-5 border-b border-slate-border/20 bg-navy-base/60 backdrop-blur-md sticky top-0 z-50"
            >
                <Link to="/" className="flex items-center gap-2.5 group">
                    <div className="w-8 h-8 rounded-lg bg-gold-primary/10 flex items-center justify-center border border-gold-primary/20 group-hover:border-gold-primary/40 transition-colors">
                        <Scale className="text-gold-primary" size={18} />
                    </div>
                    <span className="font-serif font-semibold text-paper-dark text-lg tracking-tight">LegalShield</span>
                </Link>
                <Link to="/dashboard">
                    <Button size="sm" variant="ghost" className="text-xs uppercase tracking-widest font-bold">Vào ứng dụng</Button>
                </Link>
            </motion.nav>

            {/* Header */}
            <div className="relative max-w-5xl mx-auto text-center px-8 py-24">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <Typography variant="label" className="mb-4 block tracking-[0.3em] font-bold text-gold-muted opacity-80 uppercase text-[10px]">Lựa chọn đầu tư</Typography>
                    <Typography variant="h1" className="mb-6 font-serif text-5xl sm:text-6xl text-gradient-gold">Bảng giá minh bạch</Typography>
                    <Typography variant="subtitle" className="max-w-2xl mx-auto text-paper-dark/50 italic leading-relaxed">
                        Nâng cao hiệu suất pháp lý với AI được huấn luyện chuyên sâu cho luật Việt Nam.
                        Tiết kiệm 90% chi phí so với quy trình truyền thống.
                    </Typography>
                    <div className="w-24 h-1 bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent mx-auto mt-8" />
                </motion.div>
            </div>

            {/* Plans */}
            <div className="max-w-6xl mx-auto px-8 pb-32 grid grid-cols-1 md:grid-cols-3 gap-8">
                {plans.map((plan, idx) => (
                    <motion.div
                        key={plan.name}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1, duration: 0.5 }}
                        className={`group flex flex-col p-10 rounded-2xl border transition-all duration-500 relative overflow-hidden ${plan.highlight
                                ? 'border-gold-primary/40 bg-navy-elevated/80 shadow-[0_32px_64px_-12px_rgba(201,168,76,0.15)] ring-1 ring-gold-primary/10'
                                : 'border-slate-border/20 bg-navy-elevated/40 hover:border-gold-primary/20 backdrop-blur-sm'
                            }`}
                    >
                        {plan.highlight && (
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-gold-muted via-gold-primary to-gold-muted" />
                        )}

                        <div className="mb-8">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-6 border ${plan.highlight ? 'bg-gold-primary/10 border-gold-primary/30' : 'bg-slate-border/10 border-slate-border/20'
                                }`}>
                                <plan.icon className={plan.highlight ? 'text-gold-primary' : 'text-paper-dark/40'} size={20} />
                            </div>
                            <Typography variant="h3" className="text-2xl font-serif mb-2">{plan.name}</Typography>
                            <div className="flex items-baseline gap-1.5 mb-2">
                                <span className={`font-serif text-3xl font-semibold ${plan.highlight ? 'text-gradient-gold' : 'text-paper-dark'}`}>{plan.price}</span>
                                <Typography variant="caption" className="text-paper-dark/30 font-bold uppercase tracking-tighter">{plan.period}</Typography>
                            </div>
                            <Typography variant="subtitle" className="text-xs text-paper-dark/40 font-medium leading-relaxed min-h-[3rem]">{plan.description}</Typography>
                        </div>

                        <ul className="space-y-4 mb-10 flex-1">
                            {plan.features.map((f) => (
                                <li key={f} className="flex items-start gap-3 text-sm text-paper-dark/70 group-hover:text-paper-dark transition-colors">
                                    <div className={`mt-1 p-0.5 rounded-full ${plan.highlight ? 'bg-gold-primary/20' : 'bg-slate-border/30'}`}>
                                        <Check size={10} className={plan.highlight ? 'text-gold-primary' : 'text-paper-dark/40'} />
                                    </div>
                                    <span className="leading-tight font-medium">{f}</span>
                                </li>
                            ))}
                        </ul>

                        <Button
                            variant={plan.ctaVariant}
                            className={`w-full h-12 text-sm font-bold uppercase tracking-widest shadow-xl transition-all ${plan.highlight ? 'shadow-gold group-hover:scale-[1.02]' : 'border-slate-border/30 hover:bg-white/5'
                                }`}
                            onClick={() => handlePlanSelect(plan.id)}
                            disabled={isLoading}
                        >
                            {plan.cta}
                        </Button>

                        {/* Background subtle glow for highlight plan */}
                        {plan.highlight && (
                            <div className="absolute -right-16 -bottom-16 w-32 h-32 bg-gold-primary/5 blur-[80px] rounded-full pointer-events-none" />
                        )}
                    </motion.div>
                ))}
            </div>

            {/* Support section */}
            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="max-w-4xl mx-auto px-8 pb-32 text-center text-paper-dark/30"
            >
                <Typography variant="caption" className="block text-[10px] tracking-widest uppercase font-bold mb-4">Mọi giao dịch đều được mã hóa SSL/TLS</Typography>
                <div className="flex justify-center gap-8 grayscale opacity-50 group-hover:grayscale-0 transition-all">
                    {/* Placeholder for payment logos */}
                    <div className="text-xs font-mono border border-paper-dark/10 px-3 py-1 rounded">MOMO</div>
                    <div className="text-xs font-mono border border-paper-dark/10 px-3 py-1 rounded">VNPAY</div>
                    <div className="text-xs font-mono border border-paper-dark/10 px-3 py-1 rounded">STRIPE</div>
                </div>
            </motion.div>
        </div>
    )
}


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
        description: 'Dành cho cá nhân làm quen với AI Tra cứu Quy chuẩn',
        features: ['10 phân tích / tháng', 'Dữ liệu Quy chuẩn cơ bản', '3 Template chuẩn Quốc tế'],
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
            'Hỗ trợ chuyên gia 24/7'
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
        <div className="min-h-screen bg-surface font-sans selection:bg-primary/10 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-grid-slate-900/[0.02] pointer-events-none" />

            {/* Nav */}
            <motion.nav
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-between items-center px-8 md:px-16 py-8 border-b border-lex-border/40 bg-surface/80 backdrop-blur-md sticky top-0 z-50"
            >
                <Link to="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:border-primary/40 transition-colors">
                        <Scale className="text-primary" size={20} />
                    </div>
                    <span className="font-serif font-bold text-primary text-xl tracking-tight">LegalShield</span>
                </Link>
                <Link to="/dashboard">
                    <Button size="sm" variant="ghost" className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary/70 hover:text-primary">Vào ứng dụng</Button>
                </Link>
            </motion.nav>

            {/* Header */}
            <div className="relative max-w-5xl mx-auto text-center px-8 py-32">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <Typography variant="label" className="mb-6 block tracking-[0.4em] font-bold text-primary/40 uppercase text-[10px]">Lựa chọn đầu tư cho tương lai</Typography>
                    <Typography variant="h1" className="mb-10 font-serif text-5xl sm:text-7xl text-primary leading-tight">Bảng giá chuyên sâu</Typography>
                    <p className="max-w-2xl mx-auto text-on-surface/60 text-lg leading-relaxed font-body">
                        Nâng cao hiệu suất tra cứu với AI được huấn luyện chuyên biệt cho quy chuẩn Việt Nam.
                        Tiết kiệm 90% thời gian so với quy trình truyền thống.
                    </p>
                    <div className="w-32 h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent mx-auto mt-12" />
                </motion.div>
            </div>

            {/* Plans */}
            <div className="max-w-7xl mx-auto px-8 pb-40 grid grid-cols-1 md:grid-cols-3 gap-10">
                {plans.map((plan, idx) => (
                    <motion.div
                        key={plan.name}
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className={`group flex flex-col p-12 rounded-[2.5rem] border transition-all duration-700 relative overflow-hidden ${plan.highlight
                            ? 'border-primary/20 bg-surface-bright shadow-[0_48px_128px_-32px_rgba(11,28,26,0.1)] ring-1 ring-primary/5 scale-105 z-10'
                            : 'border-lex-border bg-surface-bright/50 hover:bg-surface-bright backdrop-blur-sm shadow-sm hover:shadow-xl'
                            }`}
                    >
                        {plan.highlight && (
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
                        )}

                        <div className="mb-10">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 border-2 ${plan.highlight ? 'bg-primary text-surface-bright border-primary shadow-lg shadow-primary/20' : 'bg-surface border-lex-border text-primary/30'
                                }`}>
                                <plan.icon size={28} />
                            </div>
                            <Typography variant="h3" className="text-3xl font-serif mb-3 text-primary">{plan.name}</Typography>
                            <div className="flex items-baseline gap-2 mb-3">
                                <span className={`font-serif text-4xl font-bold ${plan.highlight ? 'text-primary' : 'text-primary/90'}`}>{plan.price}</span>
                                <Typography variant="caption" className="text-primary/30 font-bold uppercase tracking-widest text-[10px]">{plan.period}</Typography>
                            </div>
                            <Typography variant="subtitle" className="text-sm text-on-surface/50 font-medium leading-relaxed min-h-[3rem]">{plan.description}</Typography>
                        </div>

                        <ul className="space-y-5 mb-14 flex-1">
                            {plan.features.map((f) => (
                                <li key={f} className="flex items-start gap-4 text-sm text-on-surface/70 group-hover:text-primary transition-colors duration-300">
                                    <div className={`mt-1 p-0.5 rounded-full ${plan.highlight ? 'bg-primary/10 text-primary' : 'bg-surface text-on-surface/20'}`}>
                                        <Check size={12} className="stroke-[3]" />
                                    </div>
                                    <span className="leading-tight font-medium">{f}</span>
                                </li>
                            ))}
                        </ul>

                        <Button
                            variant={plan.ctaVariant}
                            className={`w-full py-7 text-[10px] font-bold uppercase tracking-[0.3em] overflow-hidden group shadow-lg transition-all duration-500 rounded-2xl ${plan.highlight ? 'bg-primary text-surface-bright hover:bg-primary-container hover:text-on-primary-container' : 'border-lex-border hover:bg-primary hover:text-surface-bright'
                                }`}
                            onClick={() => handlePlanSelect(plan.id)}
                            disabled={isLoading}
                        >
                            <span className="relative z-10">{plan.cta}</span>
                        </Button>

                        {/* Background subtle glow for highlight plan */}
                        {plan.highlight && (
                            <div className="absolute -right-24 -bottom-24 w-48 h-48 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
                        )}
                    </motion.div>
                ))}
            </div>

            {/* Support section */}
            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1 }}
                className="max-w-4xl mx-auto px-8 pb-40 text-center"
            >
                <Typography variant="caption" className="block text-[10px] tracking-[0.4em] uppercase font-bold mb-8 text-primary/30">Mọi giao dịch đều được bảo vệ bởi tiêu chuẩn AES-256</Typography>
                <div className="flex flex-wrap justify-center items-center gap-12 opacity-30 grayscale hover:grayscale-0 hover:opacity-60 transition-all duration-700">
                    <div className="text-[10px] font-bold tracking-[0.2em] border border-primary/20 px-6 py-2 rounded-xl">MOMO</div>
                    <div className="text-[10px] font-bold tracking-[0.2em] border border-primary/20 px-6 py-2 rounded-xl">VNPAY</div>
                    <div className="text-[10px] font-bold tracking-[0.2em] border border-primary/20 px-6 py-2 rounded-xl">STRIPE</div>
                    <div className="text-[10px] font-bold tracking-[0.2em] border border-primary/20 px-6 py-2 rounded-xl">MASTERCARD</div>
                </div>
            </motion.div>
        </div>
    )
}


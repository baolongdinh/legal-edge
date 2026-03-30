import { Link } from 'react-router-dom'
import { Check, Scale } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'

const plans = [
    {
        name: 'Miễn phí', price: '0đ', period: '/tháng',
        description: 'Khám phá nền tảng',
        features: ['10 phân tích / tháng', 'RAG cơ bản', 'Kho template chuẩn'],
        cta: 'Bắt đầu miễn phí', ctaVariant: 'ghost' as const,
        highlight: false,
    },
    {
        name: 'Pro', price: '990.000đ', period: '/tháng',
        description: 'Cho cá nhân & SME',
        features: ['200 phân tích / tháng', 'RAG đầy đủ + án lệ', 'Soạn thảo không giới hạn', 'Xuất PDF chuẩn pháp lý', 'Hỗ trợ ưu tiên'],
        cta: 'Nâng cấp lên Pro', ctaVariant: 'primary' as const,
        highlight: true,
    },
    {
        name: 'Enterprise', price: 'Liên hệ', period: '',
        description: 'Cho công ty luật & doanh nghiệp lớn',
        features: ['Phân tích không giới hạn', 'Kho pháp lý riêng', 'API tích hợp riêng', 'Supavisor pool riêng', 'SLA 99.9%'],
        cta: 'Liên hệ Sales', ctaVariant: 'outline' as const,
        highlight: false,
    },
]

export function Pricing() {
    return (
        <div className="min-h-screen bg-navy-base bg-grid font-sans">
            {/* Nav */}
            <nav className="flex items-center justify-between px-8 py-5 border-b border-slate-border/50 bg-navy-base/80 backdrop-blur-sm sticky top-0 z-50">
                <Link to="/" className="flex items-center gap-2.5">
                    <Scale className="text-gold-primary" size={22} />
                    <span className="font-serif font-semibold text-paper-dark text-lg">LegalShield</span>
                </Link>
                <Link to="/dashboard">
                    <Button size="sm">Vào ứng dụng</Button>
                </Link>
            </nav>

            {/* Header */}
            <div className="max-w-4xl mx-auto text-center px-8 py-16">
                <Typography variant="label" className="mb-4 block">Bảng giá</Typography>
                <div className="gold-divider mx-auto mb-6" />
                <Typography variant="h2" className="mb-4">Chọn gói phù hợp</Typography>
                <Typography variant="subtitle">Mọi gói đều bao gồm bảo mật dữ liệu tuyệt đối — không dùng dữ liệu của bạn để huấn luyện AI.</Typography>
            </div>

            {/* Plans */}
            <div className="max-w-5xl mx-auto px-8 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((plan) => (
                    <div key={plan.name} className={`flex flex-col p-6 rounded-xl border card-hover ${plan.highlight
                            ? 'border-gold-primary bg-gold-primary/10 shadow-[0_0_48px_rgba(201,168,76,0.15)]'
                            : 'border-slate-border bg-navy-elevated'
                        }`}>
                        {plan.highlight && (
                            <Typography variant="label" className="text-gold-primary text-center mb-3">Phổ biến nhất</Typography>
                        )}
                        <Typography variant="h3" className="mb-1.5 text-xl">{plan.name}</Typography>
                        <div className="flex items-baseline gap-1 mb-1">
                            <span className="font-serif text-3xl font-semibold text-paper-dark">{plan.price}</span>
                            <Typography variant="caption">{plan.period}</Typography>
                        </div>
                        <Typography variant="subtitle" className="text-sm mb-5">{plan.description}</Typography>

                        <ul className="space-y-2.5 mb-8 flex-1">
                            {plan.features.map((f) => (
                                <li key={f} className="flex items-center gap-2 text-sm text-paper-dark">
                                    <Check size={14} className="text-gold-primary shrink-0" />{f}
                                </li>
                            ))}
                        </ul>

                        <Button variant={plan.ctaVariant} className="w-full">{plan.cta}</Button>
                    </div>
                ))}
            </div>
        </div>
    )
}

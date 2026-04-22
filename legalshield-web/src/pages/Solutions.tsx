import { motion } from 'framer-motion'
import { Briefcase, FileSearch, Building2 } from 'lucide-react'
import { Typography } from '../components/ui/Typography'
import { PublicNavbar } from '../components/layout/PublicNavbar'

export function Solutions() {
    return (
        <div className="min-h-screen bg-surface font-sans selection:bg-primary/10 relative overflow-hidden pb-[env(safe-area-inset-bottom)]">
            <div className="absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

            <PublicNavbar />

            <div className="relative max-w-5xl mx-auto text-center px-8 py-32">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <Typography variant="label" className="mb-6 block tracking-[0.4em] font-bold text-primary/40 uppercase text-[10px]">Ứng dụng thực tiễn</Typography>
                    <Typography variant="h1" className="mb-10 font-serif text-5xl sm:text-7xl text-primary leading-tight">Giải pháp Toàn diện</Typography>
                    <p className="max-w-2xl mx-auto text-on-surface/60 text-lg leading-relaxed font-body">
                        Áp dụng sức mạnh của AI vào từng nghiệp vụ pháp lý đặc thù nhằm giảm thiểu rủi ro và tăng cường tốc độ pháp chế.
                    </p>
                </motion.div>
            </div>

            <div className="max-w-7xl mx-auto px-8 pb-40 grid grid-cols-1 md:grid-cols-3 gap-10">
                {[
                    { title: 'Due Diligence (M&A)', icon: Building2, desc: 'Kiểm soát rủi ro pháp lý doanh nghiệp nhanh chóng với khả năng quét và tóm tắt hàng trăm hợp đồng. Đối soát với các quy định điều kiện kinh doanh.' },
                    { title: 'Soạn thảo Hợp đồng', icon: Briefcase, desc: 'Xây dựng thư viện điều khoản và tạo mẫu hợp đồng chuẩn theo đặc thù từng doanh nghiệp một cách tự động.' },
                    { title: 'Thẩm định Ký kết', icon: FileSearch, desc: 'So sánh dự thảo hợp đồng của đối tác với quy chuẩn mặc định của công ty, phát hiện các điều khoản bất lợi.' }
                ].map((item, idx) => (
                    <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.8 }}
                        className="p-10 rounded-[2rem] border border-lex-border bg-surface-bright/50 hover:bg-surface-bright hover:shadow-xl transition-all"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-secondary/20 flex items-center justify-center mb-6 text-secondary font-bold">
                            <item.icon size={24} />
                        </div>
                        <h3 className="text-2xl font-serif text-primary mb-4">{item.title}</h3>
                        <p className="text-on-surface/60 leading-relaxed font-body">{item.desc}</p>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

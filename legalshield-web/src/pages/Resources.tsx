import { motion } from 'framer-motion'
import { BookOpen, FileText, Video } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { PublicNavbar } from '../components/layout/PublicNavbar'

export function Resources() {
    return (
        <div className="min-h-screen bg-surface font-sans selection:bg-primary/10 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

            <PublicNavbar />

            <div className="relative max-w-5xl mx-auto text-center px-8 py-32">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    <Typography variant="label" className="mb-6 block tracking-[0.4em] font-bold text-primary/40 uppercase text-[10px]">Thư viện tri thức</Typography>
                    <Typography variant="h1" className="mb-10 font-serif text-5xl sm:text-7xl text-primary leading-tight">Tài nguyên & Học liệu</Typography>
                    <p className="max-w-2xl mx-auto text-on-surface/60 text-lg leading-relaxed font-body">
                        Khám phá kho tàng bài viết chuyên sâu, báo cáo ngành và hướng dẫn ứng dụng AI vào thực tiễn pháp lý tại Việt Nam.
                    </p>
                </motion.div>
            </div>

            <div className="max-w-7xl mx-auto px-8 pb-40 grid grid-cols-1 md:grid-cols-3 gap-10">
                {[
                    { title: 'Tài liệu API', icon: BookOpen, desc: 'Tích hợp bộ máy AI của LegalShield trực tiếp vào hệ thống Core của bạn dành riêng phân tích hợp đồng.' },
                    { title: 'Báo cáo xu hướng công nghệ ngành Luật 2025', icon: FileText, desc: 'Dữ liệu được đúc kết từ hơn 500 khách hàng khối doanh nghiệp và 1 triệu văn bản phân tích.' },
                    { title: 'Tutorial: Làm chủ công cụ Tra cứu', icon: Video, desc: 'Bộ video hướng dẫn các thao tác tìm kiếm siêu tốc, xây dựng thư viện mẫu và quản trị dữ liệu.' }
                ].map((item, idx) => (
                    <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.8 }}
                        className="p-10 rounded-[2rem] border border-lex-border bg-surface-bright/50 hover:bg-surface-bright hover:shadow-xl transition-all"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-lex-deep flex items-center justify-center mb-6 text-lex-gold">
                            <item.icon size={24} />
                        </div>
                        <h3 className="text-2xl font-serif text-primary mb-4">{item.title}</h3>
                        <p className="text-on-surface/60 leading-relaxed font-body">{item.desc}</p>
                        <Button variant="ghost" className="mt-6 font-bold uppercase tracking-widest text-[10px] pl-0 hover:bg-transparent hover:text-secondary">Tìm hiểu thêm &rarr;</Button>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

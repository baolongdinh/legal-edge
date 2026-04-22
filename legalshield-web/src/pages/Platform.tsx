import { motion } from 'framer-motion'
import { Database, Server, Lock } from 'lucide-react'
import { Typography } from '../components/ui/Typography'
import { PublicNavbar } from '../components/layout/PublicNavbar'

export function Platform() {
    return (
        <div className="min-h-screen bg-surface font-sans selection:bg-primary/10 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

            <PublicNavbar />

            {/* Header */}
            <div className="relative max-w-5xl mx-auto text-center px-8 py-32">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <Typography variant="label" className="mb-6 block tracking-[0.4em] font-bold text-primary/40 uppercase text-[10px]">Cơ sở hạ tầng trí tuệ</Typography>
                    <Typography variant="h1" className="mb-10 font-serif text-5xl sm:text-7xl text-primary leading-tight">Nền tảng Tối ưu</Typography>
                    <p className="max-w-2xl mx-auto text-on-surface/60 text-lg leading-relaxed font-body">
                        Sức mạnh xử lý ngôn ngữ tự nhiên kết hợp cùng kiến trúc vi dịch vụ bảo mật cao, thiết kế riêng cho ngành luật Việt Nam.
                    </p>
                </motion.div>
            </div>

            {/* Features */}
            <div className="max-w-7xl mx-auto px-8 pb-40 grid grid-cols-1 md:grid-cols-3 gap-10">
                {[
                    { title: 'Dữ liệu Pháp luật RAG', icon: Database, desc: 'Tích hợp kho dữ liệu văn bản quy phạm pháp luật và bản án từ tối cao, được vector hoá realtime.' },
                    { title: 'Tốc độ Phản hồi < 2s', icon: Server, desc: 'Kiến trúc Edge Functions cho phép phân tích và đối soát hàng ngàn trang tài liệu trong chớp mắt.' },
                    { title: 'Bảo vệ dữ liệu tuyệt đối', icon: Lock, desc: 'Mọi thông tin tải lên đều được mã hóa theo chuẩn AES-256, cam kết không dùng để huấn luyện mô hình.' }
                ].map((item, idx) => (
                    <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.8 }}
                        className="p-10 rounded-[2rem] border border-lex-border bg-surface-bright/50 hover:bg-surface-bright hover:shadow-xl transition-all"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
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

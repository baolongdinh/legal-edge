import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { Scale, ShieldCheck, BookOpenCheck, Zap, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const features = [
    { icon: ShieldCheck, title: 'Phân tích rủi ro AI', desc: 'Phát hiện điều khoản bất lợi theo luật VN trong vài giây' },
    { icon: BookOpenCheck, title: 'RAG Pháp lý', desc: 'Tham chiếu Luật Thương mại, Bộ luật Dân sự và án lệ thực tế' },
    { icon: Zap, title: 'Soạn thảo thông minh', desc: 'Tạo hợp đồng chuẩn pháp lý từ kho template chuyên nghiệp' },
]

export function Landing() {
    const navigate = useNavigate()
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
    const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // Redirect if already logged in
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) navigate('/dashboard')
        })
    }, [navigate])

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const { error } = authMode === 'signin'
                ? await supabase.auth.signInWithPassword({ email, password })
                : await supabase.auth.signUp({ email, password })

            if (error) throw error
            if (authMode === 'signup') {
                alert('Vui lòng kiểm tra email để xác nhận tài khoản!')
                setAuthMode('signin')
            } else {
                navigate('/dashboard')
            }
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }
    return (
        <div className="min-h-screen bg-navy-base bg-grid font-sans">
            {/* Nav */}
            <nav className="flex items-center justify-between px-8 py-5 border-b border-slate-border/50 backdrop-blur-sm sticky top-0 z-50 bg-navy-base/80">
                <div className="flex items-center gap-2.5">
                    <Scale className="text-gold-primary" size={24} />
                    <span className="font-serif font-semibold text-paper-dark text-xl">LegalShield</span>
                </div>
                <div className="flex items-center gap-4">
                    <Link to="/pricing" className="text-sm text-slate-muted hover:text-paper-dark transition-colors">Bảng giá</Link>
                    <Button variant="ghost" size="sm" onClick={() => { setAuthMode('signin'); setIsAuthModalOpen(true) }}>Đăng nhập</Button>
                    <Button size="sm" onClick={() => { setAuthMode('signup'); setIsAuthModalOpen(true) }}>Dùng miễn phí</Button>
                </div>
            </nav>

            {/* Hero */}
            <section className="max-w-5xl mx-auto px-8 py-28 text-center">
                <Typography variant="label" className="mb-5 block">Trợ lý pháp lý AI hàng đầu Việt Nam</Typography>
                <div className="gold-divider mx-auto mb-8" />
                <Typography variant="h1" className="mb-6 text-gradient-gold">
                    Bảo vệ mọi hợp đồng<br />trước khi ký kết
                </Typography>
                <Typography variant="subtitle" className="max-w-2xl mx-auto mb-10">
                    LegalShield phân tích rủi ro pháp lý, tra cứu luật Việt Nam và soạn thảo hợp đồng—
                    tất cả dựa trên cơ sở dữ liệu pháp luật chính thức từ vbpl.vn.
                </Typography>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                    <Button size="lg" onClick={() => { setAuthMode('signup'); setIsAuthModalOpen(true) }}>Bắt đầu miễn phí</Button>
                    <Link to="/analysis">
                        <Button variant="ghost" size="lg">Phân tích hợp đồng ngay</Button>
                    </Link>
                </div>
            </section>

            {/* Features */}
            <section className="max-w-5xl mx-auto px-8 pb-28">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {features.map(({ icon: Icon, title, desc }) => (
                        <div key={title} className="p-6 rounded-lg bg-navy-elevated card-hover animate-fade-in">
                            <Icon className="text-gold-primary mb-4" size={24} />
                            <Typography variant="h3" className="text-base mb-2">{title}</Typography>
                            <Typography variant="subtitle" className="text-sm">{desc}</Typography>
                        </div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-border px-8 py-6 text-center">
                <Typography variant="caption">© 2026 LegalShield. Dữ liệu pháp lý từ vbpl.vn — Bộ Tư pháp Việt Nam.</Typography>
            </footer>

            {/* Auth Modal */}
            {isAuthModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-base/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-navy-elevated border border-slate-border rounded-xl w-full max-w-md p-8 relative animate-scale-up">
                        <button onClick={() => setIsAuthModalOpen(false)} className="absolute right-4 top-4 text-slate-muted hover:text-paper-dark">
                            <X size={20} />
                        </button>

                        <Typography variant="h3" className="mb-2">
                            {authMode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}
                        </Typography>
                        <Typography variant="subtitle" className="text-sm mb-6">
                            {authMode === 'signin' ? 'Chào mừng bạn quay lại với LegalShield' : 'Bắt đầu bảo vệ hợp đồng của bạn ngay hôm nay'}
                        </Typography>

                        <form onSubmit={handleAuth} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gold-muted mb-1.5 uppercase tracking-wider">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="user@example.vn"
                                    required
                                    className="w-full px-3 py-2.5 text-sm bg-navy-base border border-slate-border rounded-md text-paper-dark focus:outline-none focus:border-gold-primary transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gold-muted mb-1.5 uppercase tracking-wider">Mật khẩu</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-3 py-2.5 text-sm bg-navy-base border border-slate-border rounded-md text-paper-dark focus:outline-none focus:border-gold-primary transition-colors"
                                />
                            </div>

                            {error && <p className="text-xs text-red-400 bg-red-400/10 p-2 rounded">{error}</p>}

                            <Button className="w-full" disabled={loading}>
                                {loading ? 'Đang xử lý...' : (authMode === 'signin' ? 'Đăng nhập' : 'Đăng ký')}
                            </Button>
                        </form>

                        <div className="mt-6 pt-6 border-t border-slate-border/50 text-center">
                            <Typography variant="caption" className="text-slate-muted">
                                {authMode === 'signin' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
                                <button
                                    onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                                    className="ml-1 text-gold-primary hover:underline font-medium"
                                >
                                    {authMode === 'signin' ? 'Đăng ký ngay' : 'Đăng nhập ngay'}
                                </button>
                            </Typography>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

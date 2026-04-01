import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { Scale, ShieldCheck, BookOpenCheck, Zap, X, ArrowRight, Shield, User, Loader2 } from 'lucide-react'
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
    const [fullName, setFullName] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) navigate('/dashboard')
        })
    }, [navigate])

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const authToast = toast.loading(authMode === 'signin' ? 'Đang đăng nhập...' : 'Đang tạo tài khoản...')

        try {
            if (authMode === 'signup' && password !== confirmPassword) {
                throw new Error('Mật khẩu xác nhận không khớp')
            }

            // Check if username already exists in public.users to give a clear error before signup
            if (authMode === 'signup') {
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id')
                    .eq('username', username.trim())
                    .maybeSingle()

                if (existingUser) {
                    throw new Error('Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.')
                }
            }

            // Using a fake internal email for username-based auth
            const internalEmail = `${username.toLowerCase().trim()}@legalshield.local`

            const { error: authError } = authMode === 'signin'
                ? await supabase.auth.signInWithPassword({
                    email: internalEmail,
                    password
                })
                : await supabase.auth.signUp({
                    email: internalEmail,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            username: username.trim()
                        }
                    }
                })

            if (authError) {
                if (authError.message.includes('User already registered') || authError.message.includes('already exists')) {
                    throw new Error('Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.')
                }
                if (authError.message.includes('Invalid login credentials')) {
                    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.')
                }
                throw authError
            }

            toast.success(authMode === 'signin' ? 'Đăng nhập thành công!' : 'Tạo tài khoản thành công!', { id: authToast })
            navigate('/dashboard')
        } catch (err) {
            let msg = (err as Error).message
            if (msg.includes('Email not confirmed')) {
                msg = 'Tài khoản chưa được xác nhận. Vui lòng tắt "Confirm Email" trong Supabase Auth Settings.'
            } else if (msg.includes('Error sending confirmation email')) {
                msg = 'Lỗi hệ thống: Không thể gửi mail xác nhận. Vui lòng tắt "Confirm Email" trong Supabase Auth Settings để dùng Username.'
            }
            setError(msg)
            toast.error(msg, { id: authToast })
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleSignIn = async () => {
        setLoading(true)
        setError(null)
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`
                }
            })
            if (error) throw error
        } catch (err) {
            toast.error((err as Error).message)
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-navy-base font-sans selection:bg-gold-primary/30">
            {/* Ambient Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gold-primary/5 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gold-primary/5 blur-[120px] rounded-full" />
                <div className="absolute inset-0 bg-grid opacity-20" />
            </div>

            {/* Nav */}
            <motion.nav
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex items-center justify-between px-8 py-5 border-b border-slate-border/20 backdrop-blur-md sticky top-0 z-50 bg-navy-base/60"
            >
                <div className="flex items-center gap-2.5 group cursor-pointer" onClick={() => navigate('/')}>
                    <div className="w-9 h-9 bg-gold-primary/10 rounded-lg flex items-center justify-center border border-gold-primary/20 group-hover:border-gold-primary/40 transition-colors shadow-inner">
                        <Scale className="text-gold-primary" size={20} />
                    </div>
                    <span className="font-serif font-semibold text-paper-dark text-xl tracking-tight">LegalShield</span>
                </div>
                <div className="flex items-center gap-6">
                    <Link to="/pricing" className="text-sm font-medium text-paper-dark/60 hover:text-gold-primary transition-colors">Bảng giá</Link>
                    <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => { setAuthMode('signin'); setIsAuthModalOpen(true) }}>Đăng nhập</Button>
                    <Button size="sm" className="shadow-gold px-6" onClick={() => { setAuthMode('signup'); setIsAuthModalOpen(true) }}>Bắt đầu</Button>
                </div>
            </motion.nav>

            {/* Hero */}
            <section className="relative max-w-6xl mx-auto px-8 py-32 sm:py-48 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-primary/10 border border-gold-primary/20 mb-8 backdrop-blur-sm">
                        <Shield className="text-gold-primary" size={14} />
                        <Typography variant="label" className="text-[10px] tracking-[0.2em] uppercase font-bold text-gold-muted">Trợ lý pháp lý AI hàng đầu Việt Nam</Typography>
                    </div>
                    <Typography variant="h1" className="mb-8 text-5xl sm:text-7xl font-serif text-gradient-gold leading-[1.1]">
                        Bảo vệ tài sản tri thức<br />trước mọi bản hợp đồng
                    </Typography>
                    <Typography variant="subtitle" className="max-w-2xl mx-auto mb-12 text-lg text-paper-dark/60 leading-relaxed">
                        Phân tích rủi ro pháp lý theo luật Việt Nam, tra cứu án lệ thông minh và
                        soạn thảo hợp đồng chuẩn mực chỉ trong vài giây.
                    </Typography>
                    <div className="flex items-center justify-center gap-5 flex-wrap">
                        <Button size="lg" className="h-14 px-10 text-lg shadow-gold group" onClick={() => { setAuthMode('signup'); setIsAuthModalOpen(true) }}>
                            Sử dụng ngay
                            <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                        </Button>
                        <Link to="/analysis">
                            <Button variant="ghost" size="lg" className="h-14 px-10 text-lg border border-slate-border/30 hover:bg-white/5">
                                Demo phân tích
                            </Button>
                        </Link>
                    </div>
                </motion.div>

                {/* Hero Glow Backdrop */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-gold-primary/5 blur-[150px] pointer-events-none rounded-full" />
            </section>

            {/* Features */}
            <section className="max-w-6xl mx-auto px-8 pb-32">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {features.map(({ icon: Icon, title, desc }, idx) => (
                        <motion.div
                            key={title}
                            initial={{ opacity: 0, y: 40 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.15, duration: 0.6 }}
                            className="group p-10 rounded-2xl bg-navy-elevated/40 border border-slate-border/20 backdrop-blur-sm hover:border-gold-primary/30 transition-all duration-300 relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="w-12 h-12 bg-gold-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-gold/20 transition-all">
                                <Icon className="text-gold-primary" size={24} />
                            </div>
                            <Typography variant="h3" className="text-xl mb-4 font-serif">{title}</Typography>
                            <Typography variant="subtitle" className="text-sm text-paper-dark/50 leading-relaxed">{desc}</Typography>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-border/20 px-8 py-12">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 opacity-40">
                    <Typography variant="caption" className="text-xs tracking-widest font-bold">LEGALSHIELD © 2026</Typography>
                    <div className="flex gap-8">
                        <Link to="/pricing" className="text-xs hover:text-gold-primary transition-colors uppercase tracking-tighter">Bảng giá</Link>
                        <a href="https://vbpl.vn" target="_blank" rel="noreferrer" className="text-xs hover:text-gold-primary transition-colors uppercase tracking-tighter">Dữ liệu VBPL</a>
                    </div>
                </div>
            </footer>

            {/* Auth Modal Overlay */}
            <AnimatePresence>
                {isAuthModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-base/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-navy-elevated/90 border border-gold-primary/20 rounded-2xl w-full max-w-md p-10 relative shadow-2xl backdrop-blur-xl overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-gold-muted via-gold-primary to-gold-muted" />

                            <button onClick={() => setIsAuthModalOpen(false)} className="absolute right-6 top-6 text-paper-dark/30 hover:text-gold-primary transition-colors">
                                <X size={24} />
                            </button>

                            <div className="text-center mb-10">
                                <Typography variant="h2" className="text-3xl font-serif mb-3 tracking-tight">
                                    {authMode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}
                                </Typography>
                                <Typography variant="body" className="text-paper-dark/50 italic">
                                    {authMode === 'signin' ? 'Chào mừng bạn quay lại' : 'Bước đầu tiên để bảo vệ pháp lý'}
                                </Typography>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full mb-8 h-12 flex items-center justify-center gap-3 border-slate-border/50 bg-white/5 hover:bg-white/10 font-bold transition-all"
                                onClick={handleGoogleSignIn}
                                disabled={loading}
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Tiếp tục với Google
                            </Button>

                            <div className="relative mb-8">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-border/30"></div></div>
                                <div className="relative flex justify-center text-[10px]"><span className="px-3 bg-navy-elevated/80 backdrop-blur-sm text-paper-dark/30 uppercase tracking-[0.3em] font-bold">Hoặc dùng tài khoản</span></div>
                            </div>

                            <form onSubmit={handleAuth} className="space-y-4">
                                <div className="group">
                                    <label className="block text-[10px] font-bold text-gold-muted/60 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-gold-primary">Tên đăng nhập</label>
                                    <div className="relative">
                                        <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" />
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full h-11 pl-10 pr-4 py-3 bg-navy-base/50 border border-slate-border/50 rounded-xl text-paper-dark focus:outline-none focus:border-gold-primary/50 transition-all font-sans placeholder:text-paper-dark/20 shadow-inner"
                                            placeholder="username"
                                            required
                                        />
                                    </div>
                                </div>
                                {authMode === 'signup' && (
                                    <div className="group">
                                        <label className="block text-[10px] font-bold text-gold-muted/60 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-gold-primary">Họ và tên</label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Nguyễn Văn A"
                                            required={authMode === 'signup'}
                                            className="w-full h-11 px-4 bg-navy-base/50 border border-slate-border/50 rounded-xl text-paper-dark focus:outline-none focus:border-gold-primary/50 transition-all font-medium placeholder:text-paper-dark/20 shadow-inner"
                                        />
                                    </div>
                                )}
                                <div className="group">
                                    <label className="block text-[10px] font-bold text-gold-muted/60 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-gold-primary">Mật khẩu</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full h-11 px-4 bg-navy-base/50 border border-slate-border/50 rounded-xl text-paper-dark focus:outline-none focus:border-gold-primary/50 transition-all font-medium placeholder:text-paper-dark/20 shadow-inner"
                                    />
                                </div>
                                {authMode === 'signup' && (
                                    <div className="group">
                                        <label className="block text-[10px] font-bold text-gold-muted/60 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-gold-primary">Nhập lại mật khẩu</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required={authMode === 'signup'}
                                            className="w-full h-11 px-4 bg-navy-base/50 border border-slate-border/50 rounded-xl text-paper-dark focus:outline-none focus:border-gold-primary/50 transition-all font-medium placeholder:text-paper-dark/20 shadow-inner"
                                        />
                                    </div>
                                )}

                                {error && <p className="text-xs text-red-400 bg-red-400/5 p-3 rounded-xl border border-red-400/10 italic text-center animate-shake">{error}</p>}

                                <Button
                                    type="submit"
                                    className="w-full h-12 bg-gradient-to-r from-gold-muted via-gold-primary to-gold-muted text-navy-base font-bold text-sm tracking-widest uppercase hover:opacity-90 transition-all shadow-lg shadow-gold-primary/20"
                                    disabled={loading}
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : (authMode === 'signin' ? 'Đăng nhập ngay' : 'Tạo tài khoản')}
                                </Button>

                                <div className="text-center pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                                        className="text-xs text-paper-dark/40 hover:text-gold-primary transition-colors font-medium border-b border-transparent hover:border-gold-primary/30 pb-0.5"
                                        disabled={loading}
                                    >
                                        {authMode === 'signin' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

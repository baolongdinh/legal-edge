import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X,
    User,
    Loader2,
    ArrowRight,
    Gavel,
    Search,
    ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { PublicNavbar } from '../components/layout/PublicNavbar';

export function Landing() {
    const navigate = useNavigate();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
    const [fullName, setFullName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) navigate('/dashboard');
        });
    }, [navigate]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const authToast = toast.loading(authMode === 'signin' ? 'Đang đăng nhập...' : 'Đang tạo tài khoản...');

        try {
            if (authMode === 'signup' && password !== confirmPassword) {
                throw new Error('Mật khẩu xác nhận không khớp');
            }

            if (authMode === 'signup') {
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id')
                    .eq('username', username.trim())
                    .maybeSingle();

                if (existingUser) {
                    throw new Error('Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.');
                }
            }

            const internalEmail = `${username.toLowerCase().trim()}@legalshield.local`;

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
                });

            if (authError) {
                if (authError.message.includes('User already registered') || authError.message.includes('already exists')) {
                    throw new Error('Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.');
                }
                if (authError.message.includes('Invalid login credentials')) {
                    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác.');
                }
                throw authError;
            }

            toast.success(authMode === 'signin' ? 'Đăng nhập thành công!' : 'Tạo tài khoản thành công!', { id: authToast });
            navigate('/dashboard');
        } catch (err) {
            let msg = (err as Error).message;
            if (msg.includes('Email not confirmed')) {
                msg = 'Tài khoản chưa được xác nhận. Vui lòng tắt "Confirm Email" trong Supabase Auth Settings.';
            } else if (msg.includes('Error sending confirmation email')) {
                msg = 'Lỗi hệ thống: Không thể gửi mail xác nhận. Vui lòng tắt "Confirm Email" trong Supabase Auth Settings để dùng Username.';
            }
            setError(msg);
            toast.error(msg, { id: authToast });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`
                }
            });
            if (error) throw error;
        } catch (err) {
            toast.error((err as Error).message);
            setLoading(false);
        }
    };

    return (
        <div className="bg-surface selection:bg-secondary-container selection:text-on-secondary-container overflow-x-hidden min-h-screen pb-[env(safe-area-inset-bottom)]">
            <PublicNavbar onAuthClick={(mode) => { setAuthMode(mode); setIsAuthModalOpen(true); }} />

            <main>
                {/* Hero Section */}
                <section className="relative w-full overflow-hidden pt-20 pb-32">
                    <div className="max-w-screen-2xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-10 gap-16 items-center">
                        {/* Left Content (60%) */}
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8 }}
                            className="md:col-span-6 space-y-10"
                        >
                            <div className="inline-block px-4 py-1.5 rounded-full bg-primary-container text-on-primary-container font-sans text-[10px] tracking-widest uppercase font-bold">
                                Kho Lưu Trữ Chủ Quyền
                            </div>
                            <h1 className="text-5xl md:text-7xl leading-[1.1] font-bold text-primary max-w-2xl">
                                Bảo vệ tài sản trí thức trước mọi bản hợp đồng
                            </h1>
                            <p className="text-lg text-on-surface/70 leading-relaxed max-w-xl font-body">
                                Nền tảng Tra cứu Luật chuyên sâu. Tìm kiếm, lưu trữ và bảo mật tài liệu quy chuẩn với tiêu chuẩn khắt khe nhất của các tổ chức hàng đầu.
                            </p>
                            <div className="flex flex-wrap gap-4 pt-4">
                                <button
                                    onClick={() => { setAuthMode('signup'); setIsAuthModalOpen(true); }}
                                    className="bg-black text-white px-10 py-4 rounded-lg font-bold text-lg hover:bg-black/90 transition-all flex items-center gap-3 shadow-lg shadow-black/20"
                                >
                                    Sử dụng ngay
                                    <ArrowRight size={20} />
                                </button>
                                <button className="px-10 py-4 rounded-lg font-bold text-lg border border-outline-variant text-primary hover:bg-surface-container-low transition-all">
                                    Xem Bản Demo
                                </button>
                            </div>
                        </motion.div>

                        {/* Right Content (40%) */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="md:col-span-4 relative"
                        >
                            <div className="absolute -inset-4 bg-secondary-container opacity-20 blur-3xl rounded-full"></div>
                            <div className="relative bg-surface-container-lowest rounded-xl overflow-hidden shadow-2xl border border-outline-variant/10 aspect-[4/5] md:aspect-auto">
                                <img
                                    className="w-full h-full object-cover"
                                    alt="Modern legal dashboard"
                                    src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=2670&auto=format&fit=crop"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent"></div>
                                <div className="absolute bottom-6 left-6 right-6 p-6 bg-surface-bright/95 backdrop-blur-xl rounded-lg shadow-xl border border-white/20">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white">
                                            <Gavel size={18} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-sans uppercase tracking-wider text-on-surface/60 font-bold">Đối soát Quy chuẩn</p>
                                            <p className="text-sm font-bold text-primary">Hợp đồng M&A 2024_Final</p>
                                        </div>
                                    </div>
                                    <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-secondary w-3/4 h-full"></div>
                                    </div>
                                    <p className="mt-2 text-[10px] text-on-surface/60 italic">Bảng Điều Khiển Tổng Quan: Đang đối soát 742 quy định hiện hành...</p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* Trust Bar
                <section className="bg-surface-container-low py-16 border-y border-outline-variant/10">
                    <div className="max-w-screen-2xl mx-auto px-6 md:px-12">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-12 md:gap-4">
                            <div className="text-center md:text-left">
                                <h3 className="text-4xl font-bold text-primary serif mb-1">500+</h3>
                                <p className="text-on-surface/60 font-label text-[10px] tracking-widest uppercase font-bold">Tổ chức tin dùng</p>
                            </div>
                            <div className="hidden md:block h-12 w-px bg-outline-variant/30"></div>
                            <div className="text-center md:text-left">
                                <h3 className="text-4xl font-bold text-primary serif mb-1">1M+</h3>
                                <p className="text-on-surface/60 font-label text-[10px] tracking-widest uppercase font-bold">Văn bản đã phân tích</p>
                            </div>
                            <div className="hidden md:block h-12 w-px bg-outline-variant/30"></div>
                            <div className="text-center md:text-left">
                                <h3 className="text-4xl font-bold text-primary serif mb-1">99.9%</h3>
                                <p className="text-on-surface/60 font-label text-[10px] tracking-widest uppercase font-bold">Độ chính xác AI</p>
                            </div>
                            <div className="hidden md:block h-12 w-px bg-outline-variant/30"></div>
                            <div className="flex flex-wrap justify-center gap-12 opacity-30 grayscale contrast-125">
                                <span className="font-serif text-xl font-bold tracking-tighter">VIETNAM LAW</span>
                                <span className="font-serif text-xl font-bold tracking-tighter">LEGAL CORP</span>
                                <span className="font-serif text-xl font-bold tracking-tighter">JUSTICE AI</span>
                            </div>
                        </div>
                    </div>
                </section> */}

                {/* Features Grid: Bento Style */}
                <section className="py-32 bg-surface">
                    <div className="max-w-screen-2xl mx-auto px-6 md:px-12">
                        <div className="mb-20 text-center max-w-2xl mx-auto">
                            <h2 className="text-5xl font-bold text-primary mb-6 serif">Nghiệp vụ chuyên sâu</h2>
                            <p className="text-on-surface/70 leading-relaxed font-body">Công cụ hỗ trợ tra cứu tối ưu hóa thời gian và đảm bảo tính tương thích trong mọi quy trình văn bản.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 auto-rows-[350px]">
                            {/* Feature 1 */}
                            <div className="md:col-span-8 bg-lex-deep rounded-xl overflow-hidden relative group">
                                <div className="absolute inset-0 bg-gradient-to-r from-lex-deep via-lex-deep/80 to-transparent z-10"></div>
                                <img
                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    src="https://images.unsplash.com/photo-1505664194779-8beaceb93744?q=80&w=2670&auto=format&fit=crop"
                                    alt="Law library"
                                />
                                <div className="relative z-20 p-12 h-full flex flex-col justify-end max-w-md">
                                    <ShieldCheck className="text-secondary mb-4" size={48} />
                                    <h3 className="text-3xl font-bold text-lex-ivory serif mb-4">Đối soát Văn bản</h3>
                                    <p className="text-lex-ivory/80 leading-relaxed font-body">Phát hiện các điểm cần lưu ý, đối thẩm định với quy định hiện hành và cảnh báo rủi ro bồi thường.</p>
                                </div>
                            </div>
                            {/* Feature 2 */}
                            <div className="md:col-span-4 bg-surface-container-high rounded-xl p-12 flex flex-col justify-between border border-outline-variant/10 shadow-sm hover:shadow-md transition-shadow">
                                <Search className="text-secondary" size={40} />
                                <div>
                                    <h3 className="text-2xl font-bold text-primary serif mb-4">Tra cứu Án lệ</h3>
                                    <p className="text-on-surface/70 leading-relaxed font-body">Trợ Lý Án Lệ AI giúp truy xuất hồ sơ vụ án và văn bản quy phạm pháp luật chỉ trong vài giây.</p>
                                </div>
                            </div>
                            {/* Feature 3 */}
                            <div className="md:col-span-4 bg-secondary-container/20 rounded-xl p-12 flex flex-col justify-between border border-secondary-container/30 shadow-sm hover:shadow-md transition-shadow">
                                <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                                    <Bot className="text-secondary" size={32} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-primary serif mb-4">Trợ lý Tra cứu</h3>
                                    <p className="text-on-surface/70 leading-relaxed font-body">Công cụ tra cứu dựa trên kho dữ liệu quy định Việt Nam, hỗ trợ tìm kiếm nhanh các văn bản chuyên môn.</p>
                                </div>
                            </div>
                            {/* Feature 4 */}
                            <div className="md:col-span-8 bg-surface-container-lowest rounded-xl overflow-hidden shadow-lg flex flex-col md:flex-row items-center border border-outline-variant/5 hover:border-secondary/20 transition-colors">
                                <div className="p-12 md:w-1/2">
                                    <h3 className="text-2xl font-bold text-primary serif mb-4">Lưu trữ chủ quyền</h3>
                                    <p className="text-on-surface/70 leading-relaxed font-body">Dữ liệu được mã hóa và lưu trữ tại hạ tầng đám mây riêng tư, đảm bảo tuyệt đối tính bảo mật hồ sơ.</p>
                                </div>
                                <div className="w-full md:w-1/2 h-full">
                                    <img
                                        className="w-full h-full object-cover"
                                        src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2670&auto=format&fit=crop"
                                        alt="Digital security"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="py-24 bg-lex-deep relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-secondary/10 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />

                    <div className="max-w-screen-xl mx-auto px-6 md:px-12 text-center text-lex-ivory relative z-10">
                        <h2 className="text-5xl font-bold serif mb-8">Nâng cao hiệu suất tra cứu</h2>
                        <p className="text-xl opacity-80 mb-12 max-w-2xl mx-auto font-body font-light leading-relaxed">
                            Tham gia cùng hàng ngàn chuyên gia đang sử dụng LegalShield để tối ưu hóa quy trình tìm kiếm và Soạn Thảo Văn Bản Chuẩn Mực.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
                            <button
                                onClick={() => { setAuthMode('signup'); setIsAuthModalOpen(true); }}
                                className="bg-secondary text-lex-deep px-12 py-5 rounded-lg font-bold text-xl hover:scale-105 transition-transform"
                            >
                                Bắt đầu miễn phí
                            </button>
                            <button className="text-lex-ivory flex items-center gap-2 font-bold text-lg hover:underline underline-offset-8">
                                Liên hệ hỗ trợ
                                <ArrowRight size={20} />
                            </button>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            {/* <footer className="bg-lex-deep text-lex-ivory/60 py-16 border-t border-lex-ivory/10">
                <div className="max-w-screen-2xl mx-auto px-6 md:px-12">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 border-b border-lex-ivory/10 pb-12 gap-8">
                        <div className="space-y-4">
                            <div className="font-serif text-3xl font-bold text-lex-ivory">LegalShield</div>
                            <p className="max-w-sm text-sm">Nền tảng Tra cứu Luật tối ưu hóa quy trình soát xét chuyên nghiệp.</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-10">
                            <div className="flex flex-col gap-4">
                                <span className="font-bold text-[10px] uppercase tracking-widest text-secondary">Liên kết</span>
                                <a className="text-sm hover:text-secondary transition-colors" href="#">Về chúng tôi</a>
                                <a className="text-sm hover:text-secondary transition-colors" href="#">Sản phẩm</a>
                                <a className="text-sm hover:text-secondary transition-colors" href="#">Báo chí</a>
                            </div>
                            <div className="flex flex-col gap-4">
                                <span className="font-bold text-[10px] uppercase tracking-widest text-secondary">Văn bản</span>
                                <a className="text-sm hover:text-secondary transition-colors" href="#">Chính sách bảo mật</a>
                                <a className="text-sm hover:text-secondary transition-colors" href="#">Điều khoản dịch vụ</a>
                                <a className="text-sm hover:text-secondary transition-colors" href="#">An ninh</a>
                            </div>
                            <div className="hidden sm:flex flex-col gap-4">
                                <span className="font-bold text-[10px] uppercase tracking-widest text-secondary">Văn phòng</span>
                                <p className="text-sm">Tầng 24, Tòa nhà Bitexco</p>
                                <p className="text-sm">Quận 1, TP. Hồ Chí Minh</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <p className="font-sans text-xs tracking-wide">© 2024 LegalShield. Kho Lưu Trữ Chủ Quyền. Bảo lưu mọi quyền.</p>
                        <div className="flex gap-6">
                            <a className="hover:text-secondary transition-colors" href="#"><Globe size={18} /></a>
                            <a className="hover:text-secondary transition-colors" href="#"><Mail size={18} /></a>
                            <a className="hover:text-secondary transition-colors" href="#"><Share2 size={18} /></a>
                        </div>
                    </div>
                </div>
            </footer> */}

            {/* Auth Modal Overlay */}
            <AnimatePresence>
                {isAuthModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-lex-deep/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-lex-ivory border border-secondary/20 rounded-2xl w-full max-w-md p-10 relative shadow-2xl overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-secondary" />

                            <button onClick={() => setIsAuthModalOpen(false)} className="absolute right-6 top-6 text-on-surface/30 hover:text-secondary transition-colors">
                                <X size={24} />
                            </button>

                            <div className="text-center mb-10">
                                <h2 className="text-3xl serif font-bold text-primary mb-3 tracking-tight">
                                    {authMode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}
                                </h2>
                                <p className="text-on-surface/50 italic text-sm">
                                    {authMode === 'signin' ? 'Chào mừng bạn quay lại' : 'Bước đầu tiên để bảo vệ bảo mật'}
                                </p>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full mb-8 h-12 flex items-center justify-center gap-3 border-outline-variant/50 bg-on-surface/5 hover:bg-on-surface/10 font-bold transition-all text-on-surface"
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
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-outline-variant/30"></div></div>
                                <div className="relative flex justify-center text-[10px]"><span className="px-3 bg-lex-ivory text-on-surface/30 uppercase tracking-[0.3em] font-bold">Hoặc dùng tài khoản</span></div>
                            </div>

                            <form onSubmit={handleAuth} className="space-y-5">
                                <div className="group">
                                    <label className="block text-[10px] font-bold text-on-surface/40 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-secondary">Tên đăng nhập</label>
                                    <div className="relative">
                                        <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30" />
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full h-11 pl-10 pr-4 py-3 bg-surface-bright border border-outline-variant/50 rounded-xl text-on-surface focus:outline-none focus:border-secondary/50 transition-all font-sans placeholder:text-on-surface/20"
                                            placeholder="username"
                                            required
                                        />
                                    </div>
                                </div>
                                {authMode === 'signup' && (
                                    <div className="group">
                                        <label className="block text-[10px] font-bold text-on-surface/40 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-secondary">Họ và tên</label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="Nguyễn Văn A"
                                            required={authMode === 'signup'}
                                            className="w-full h-11 px-4 bg-surface-bright border border-outline-variant/50 rounded-xl text-on-surface focus:outline-none focus:border-secondary/50 transition-all font-medium placeholder:text-on-surface/20"
                                        />
                                    </div>
                                )}
                                <div className="group">
                                    <label className="block text-[10px] font-bold text-on-surface/40 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-secondary">Mật khẩu</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full h-11 px-4 bg-surface-bright border border-outline-variant/50 rounded-xl text-on-surface focus:outline-none focus:border-secondary/50 transition-all font-medium placeholder:text-on-surface/20"
                                    />
                                </div>
                                {authMode === 'signup' && (
                                    <div className="group">
                                        <label className="block text-[10px] font-bold text-on-surface/40 mb-2 uppercase tracking-widest transition-colors group-focus-within:text-secondary">Nhập lại mật khẩu</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required={authMode === 'signup'}
                                            className="w-full h-11 px-4 bg-surface-bright border border-outline-variant/50 rounded-xl text-on-surface focus:outline-none focus:border-secondary/50 transition-all font-medium placeholder:text-on-surface/20"
                                        />
                                    </div>
                                )}

                                {error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 italic text-center">{error}</p>}

                                <Button
                                    type="submit"
                                    className="w-full h-12 bg-secondary text-lex-ivory font-bold text-sm tracking-widest uppercase hover:opacity-90 transition-all shadow-lg shadow-secondary/20"
                                    disabled={loading}
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : (authMode === 'signin' ? 'Đăng nhập ngay' : 'Tạo tài khoản')}
                                </Button>

                                <div className="text-center pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                                        className="text-xs text-on-surface/40 hover:text-secondary transition-colors font-medium border-b border-transparent hover:border-secondary/30 pb-0.5"
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
    );
}

const Bot = ({ className, size }: { className?: string, size?: number }) => (
    <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M12 8V4H8" />
        <rect width="16" height="12" x="4" y="8" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M15 13v2" />
        <path d="M9 13v2" />
    </svg>
);

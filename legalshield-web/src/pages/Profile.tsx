import { User, Mail, Lock, CreditCard, Bell } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { useUserStore, usePayment } from '../store'
import { useEffect } from 'react'
import { clsx } from 'clsx'

export function Profile() {
    const { user, subscription, syncUser, apiCallsUsed, apiCallsLimit } = useUserStore()
    const { processPayment, isLoading: isLoadingCheckout } = usePayment()

    useEffect(() => {
        syncUser()
    }, [syncUser])

    const planDisplay = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' }

    return (
        <div className="h-full overflow-y-auto p-6 animate-slide-up">
            <div className="max-w-2xl mx-auto space-y-6">

                {/* Account section */}
                <section className="bg-surface-bright rounded-3xl border border-lex-border p-8 shadow-sm">
                    <div className="flex flex-col items-center mb-10 pt-2">
                        <div className="w-24 h-24 rounded-full border-2 border-primary/20 p-1.5 mb-4 relative group">
                            <div className="absolute inset-1.5 rounded-full bg-surface flex items-center justify-center text-primary text-3xl font-serif z-0">
                                {user?.name?.[0] || 'U'}
                            </div>
                            {user?.avatarUrl && (
                                <img
                                    src={user.avatarUrl}
                                    alt={user.name}
                                    className="w-full h-full rounded-full object-cover relative z-10"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            )}
                            <div className="absolute inset-0 rounded-full bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer z-20 backdrop-blur-[2px]">
                                <Typography variant="caption" className="text-[10px] text-primary font-bold uppercase tracking-widest">Thay đổi</Typography>
                            </div>
                        </div>
                        <Typography variant="h2" className="text-2xl mb-1 text-primary">{user?.name}</Typography>
                        <Typography variant="caption" className="text-on-surface-variant/50 font-medium">@{user?.username || user?.email?.split('@')[0]}</Typography>
                    </div>

                    <div className="flex items-center gap-3 mb-6">
                        <User size={20} className="text-primary" />
                        <Typography variant="h3" className="text-lg text-primary">Thông tin tài khoản</Typography>
                    </div>
                    <div className="space-y-6">
                        {[
                            { label: 'Họ và tên', icon: User, value: user?.name ?? '', type: 'text', readOnly: false },
                            { label: 'Tên đăng nhập', icon: Mail, value: user?.username ?? user?.email?.split('@')[0] ?? '', type: 'text', readOnly: true },
                        ].map(({ label, icon: Icon, value, type, readOnly }) => (
                            <div key={label}>
                                <label className="block text-[10px] font-bold text-primary/60 mb-2 uppercase tracking-[0.2em]">{label}</label>
                                <div className="relative">
                                    <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/30" />
                                    <input type={type} defaultValue={value} readOnly={readOnly}
                                        className={clsx(
                                            "w-full pl-11 pr-4 py-3 text-sm bg-surface border border-lex-border rounded-xl text-on-surface focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all duration-300",
                                            readOnly && "opacity-50 cursor-not-allowed bg-surface-container"
                                        )} />
                                </div>
                            </div>
                        ))}
                        <Button className="w-full py-6 mt-2">Lưu thay đổi</Button>
                    </div>
                </section>

                {/* Subscription */}
                <section className="bg-surface-bright rounded-3xl border border-lex-border p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <CreditCard size={20} className="text-primary" />
                            <Typography variant="h3" className="text-lg text-primary">Gói dịch vụ</Typography>
                        </div>
                        <span className="text-[10px] px-4 py-1.5 rounded-full border border-primary/20 text-primary bg-primary/5 font-bold uppercase tracking-widest">
                            {planDisplay[subscription]}
                        </span>
                    </div>
                    <Typography variant="subtitle" className="text-sm mb-8 text-on-surface/70 leading-relaxed">
                        {subscription === 'free'
                            ? `Bạn đang dùng gói Miễn phí với ${apiCallsLimit - apiCallsUsed}/${apiCallsLimit} lượt phân tích còn lại trong tháng.`
                            : 'Gói Pro: Không giới hạn phân tích cơ bản, 200 phân tích AI chuyên sâu/tháng.'}
                    </Typography>

                    {subscription === 'free' && (
                        <div className="space-y-4">
                            <Typography variant="body" className="text-[10px] text-primary/50 uppercase tracking-[0.2em] font-bold mb-4">Chọn phương thức nâng cấp Pro</Typography>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <Button
                                    variant="outline"
                                    className="border-lex-border hover:border-primary/30 group py-8 h-auto flex flex-col items-center gap-3 transition-all hover:bg-primary/5 rounded-2xl"
                                    onClick={() => processPayment('stripe')}
                                    disabled={isLoadingCheckout}
                                >
                                    <div className="w-10 h-10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                        <CreditCard size={28} />
                                    </div>
                                    <span className="text-[10px] font-bold tracking-widest uppercase">Stripe</span>
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-lex-border hover:border-[#A50064]/30 group py-8 h-auto flex flex-col items-center gap-3 transition-all hover:bg-[#A50064]/5 rounded-2xl"
                                    onClick={() => processPayment('momo')}
                                    disabled={isLoadingCheckout}
                                >
                                    <div className="w-10 h-10 rounded-xl overflow-hidden group-hover:scale-110 transition-transform bg-[#A50064] flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-[#A50064]/20">MOMO</div>
                                    <span className="text-[10px] font-bold tracking-widest uppercase">MoMo</span>
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-lex-border hover:border-[#005BAA]/30 group py-8 h-auto flex flex-col items-center gap-3 transition-all hover:bg-[#005BAA]/5 rounded-2xl"
                                    onClick={() => processPayment('vnpay')}
                                    disabled={isLoadingCheckout}
                                >
                                    <div className="w-10 h-10 rounded-xl overflow-hidden group-hover:scale-110 transition-transform bg-[#005BAA] flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-[#005BAA]/20">VN PAY</div>
                                    <span className="text-[10px] font-bold tracking-widest uppercase">VNPAY</span>
                                </Button>
                            </div>
                        </div>
                    )}

                    {subscription !== 'free' && (
                        <Button variant="outline" size="sm" className="rounded-xl px-6">Quản lý gói</Button>
                    )}
                </section>

                {/* Password */}
                <section className="bg-surface-bright rounded-3xl border border-lex-border p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <Lock size={20} className="text-primary" />
                        <Typography variant="h3" className="text-lg text-primary">Bảo mật</Typography>
                    </div>
                    <div className="space-y-6">
                        {['Mật khẩu hiện tại', 'Mật khẩu mới', 'Xác nhận mật khẩu mới'].map((label) => (
                            <div key={label}>
                                <label className="block text-[10px] font-bold text-primary/60 mb-2 uppercase tracking-[0.2em]">{label}</label>
                                <input type="password" placeholder="••••••••"
                                    className="w-full px-4 py-3 text-sm bg-surface border border-lex-border rounded-xl text-on-surface focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all duration-300" />
                            </div>
                        ))}
                        <Button variant="ghost" className="text-primary hover:bg-primary/5 rounded-xl">Đổi mật khẩu</Button>
                    </div>
                </section>

                {/* Notifications */}
                <section className="bg-surface-bright rounded-3xl border border-lex-border p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <Bell size={20} className="text-primary" />
                        <Typography variant="h3" className="text-lg text-primary">Thông báo</Typography>
                    </div>
                    <div className="space-y-2">
                        {[
                            'Nhận email khi phân tích hoàn tất',
                            'Cảnh báo khi phát hiện rủi ro cao',
                            'Thông báo cập nhật luật mới',
                        ].map((item) => (
                            <label key={item} className="flex items-center justify-between gap-3 py-4 border-b border-lex-border/40 last:border-0 cursor-pointer group">
                                <Typography variant="body" className="text-sm text-on-surface/80 group-hover:text-primary transition-colors">{item}</Typography>
                                <div className="relative">
                                    <input type="checkbox" defaultChecked className="sr-only peer" />
                                    <div className="w-10 h-6 rounded-full bg-surface-container-high peer-checked:bg-primary transition-colors" />
                                    <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4 shadow-sm" />
                                </div>
                            </label>
                        ))}
                    </div>
                </section>

            </div>
        </div>
    )
}

import { User, Mail, Lock, CreditCard, Bell } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Typography } from '../components/ui/Typography'
import { useUserStore } from '../store'
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

export function Profile() {
    const { user, subscription, setUser, setSubscription, apiCallsUsed, apiCallsLimit } = useUserStore()
    const [isLoadingCheckout, setIsLoadingCheckout] = useState(false)

    useEffect(() => {
        const syncUser = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser()
            if (authUser) {
                // Get extended profile
                const { data: profile } = await supabase.from('users').select('*').eq('id', authUser.id).single()
                const { data: sub } = await supabase.from('subscriptions').select('plan_id').eq('user_id', authUser.id).maybeSingle()

                setUser({
                    id: authUser.id,
                    email: authUser.email!,
                    name: profile?.full_name || authUser.user_metadata?.full_name || 'Người dùng'
                })

                if (sub) setSubscription(sub.plan_id as any)
            }
        }
        syncUser()
    }, [setUser, setSubscription])

    const handlePayment = async (provider: 'stripe' | 'momo' | 'vnpay') => {
        setIsLoadingCheckout(true)
        try {
            let res: any
            if (provider === 'momo') {
                res = await supabase.functions.invoke('momo-payment', {
                    body: {
                        plan_id: 'pro',
                        redirect_url: window.location.origin + '/profile?momo=success',
                        ipn_url: `${window.location.origin.replace('localhost', '127.0.0.1')}/functions/v1/payment-webhook?provider=momo` // Backend should override with real Edge Function URL
                    }
                })
            } else if (provider === 'vnpay') {
                res = await supabase.functions.invoke('vnpay-payment', {
                    body: {
                        plan_id: 'pro',
                        return_url: window.location.origin + '/profile?vnpay=success'
                    }
                })
            } else {
                res = await supabase.functions.invoke('create-checkout-session', {
                    body: {
                        plan_id: 'pro_monthly',
                        success_url: window.location.origin + '/profile?success=true',
                        cancel_url: window.location.origin + '/profile?canceled=true'
                    }
                })
            }

            if (res.error) throw res.error
            if (res.data?.checkout_url) {
                window.location.href = res.data.checkout_url
            }
        } catch (err) {
            console.error(`${provider} payment failed:`, err)
        } finally {
            setIsLoadingCheckout(false)
        }
    }

    const planDisplay = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' }

    return (
        <div className="h-full overflow-y-auto p-6 animate-slide-up">
            <div className="max-w-2xl mx-auto space-y-6">

                {/* Account section */}
                <section className="bg-navy-elevated rounded-xl border border-slate-border p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <User size={18} className="text-gold-primary" />
                        <Typography variant="h3" className="text-base">Thông tin tài khoản</Typography>
                    </div>
                    <div className="space-y-4">
                        {[
                            { label: 'Họ và tên', icon: User, value: user?.name ?? 'Nguyễn Văn A', type: 'text' },
                            { label: 'Email', icon: Mail, value: user?.email ?? 'user@company.vn', type: 'email' },
                        ].map(({ label, icon: Icon, value, type }) => (
                            <div key={label}>
                                <label className="block text-xs font-medium text-gold-muted mb-1.5 uppercase tracking-wider font-sans">{label}</label>
                                <div className="relative">
                                    <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" />
                                    <input type={type} defaultValue={value}
                                        className="w-full pl-9 pr-3 py-2.5 text-sm bg-navy-base border border-slate-border rounded-md text-paper-dark focus:outline-none focus:border-gold-primary transition-colors" />
                                </div>
                            </div>
                        ))}
                        <Button className="mt-2">Lưu thay đổi</Button>
                    </div>
                </section>

                {/* Password */}
                <section className="bg-navy-elevated rounded-xl border border-slate-border p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <Lock size={18} className="text-gold-primary" />
                        <Typography variant="h3" className="text-base">Bảo mật</Typography>
                    </div>
                    <div className="space-y-4">
                        {['Mật khẩu hiện tại', 'Mật khẩu mới', 'Xác nhận mật khẩu mới'].map((label) => (
                            <div key={label}>
                                <label className="block text-xs font-medium text-gold-muted mb-1.5 uppercase tracking-wider">{label}</label>
                                <input type="password" placeholder="••••••••"
                                    className="w-full px-3 py-2.5 text-sm bg-navy-base border border-slate-border rounded-md text-paper-dark focus:outline-none focus:border-gold-primary transition-colors" />
                            </div>
                        ))}
                        <Button variant="ghost">Đổi mật khẩu</Button>
                    </div>
                </section>

                {/* Subscription */}
                <section className="bg-navy-elevated rounded-xl border border-slate-border p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <CreditCard size={18} className="text-gold-primary" />
                            <Typography variant="h3" className="text-base">Gói dịch vụ</Typography>
                        </div>
                        <span className="text-xs px-3 py-1 rounded-full border border-gold-primary/40 text-gold-primary bg-gold-primary/10">
                            {planDisplay[subscription]}
                        </span>
                    </div>
                    <Typography variant="subtitle" className="text-sm mb-6">
                        {subscription === 'free'
                            ? `Bạn đang dùng gói Miễn phí với ${apiCallsLimit - apiCallsUsed}/${apiCallsLimit} lượt phân tích còn lại trong tháng.`
                            : 'Gói Pro: Không giới hạn phân tích cơ bản, 200 phân tích AI chuyên sâu/tháng.'}
                    </Typography>

                    {subscription === 'free' && (
                        <div className="space-y-3">
                            <Typography variant="body" className="text-xs text-gold-muted uppercase tracking-widest font-semibold mb-2">Chọn phương thức nâng cấp Pro</Typography>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Button
                                    variant="outline"
                                    className="border-slate-border hover:border-gold-primary group py-6 h-auto flex flex-col items-center gap-2"
                                    onClick={() => handlePayment('stripe')}
                                    disabled={isLoadingCheckout}
                                >
                                    <div className="w-8 h-8 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                                        <CreditCard size={24} />
                                    </div>
                                    <span className="text-xs font-bold tracking-tight">Stripe</span>
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-slate-border hover:border-[#A50064] group py-6 h-auto flex flex-col items-center gap-2"
                                    onClick={() => handlePayment('momo')}
                                    disabled={isLoadingCheckout}
                                >
                                    <div className="w-8 h-8 rounded-lg overflow-hidden group-hover:scale-110 transition-transform bg-[#A50064] flex items-center justify-center text-[10px] font-bold text-white">MOMO</div>
                                    <span className="text-xs font-bold tracking-tight">MoMo</span>
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-slate-border hover:border-[#005BAA] group py-6 h-auto flex flex-col items-center gap-2"
                                    onClick={() => handlePayment('vnpay')}
                                    disabled={isLoadingCheckout}
                                >
                                    <div className="w-8 h-8 rounded-lg overflow-hidden group-hover:scale-110 transition-transform bg-[#005BAA] flex items-center justify-center text-[10px] font-bold text-white">VN PAY</div>
                                    <span className="text-xs font-bold tracking-tight">VNPAY</span>
                                </Button>
                            </div>
                        </div>
                    )}

                    {subscription !== 'free' && (
                        <Button variant="outline" size="sm">Quản lý gói</Button>
                    )}
                </section>

                {/* Notifications */}
                <section className="bg-navy-elevated rounded-xl border border-slate-border p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Bell size={18} className="text-gold-primary" />
                        <Typography variant="h3" className="text-base">Thông báo</Typography>
                    </div>
                    {[
                        'Nhận email khi phân tích hoàn tất',
                        'Cảnh báo khi phát hiện rủi ro cao',
                        'Thông báo cập nhật luật mới',
                    ].map((item) => (
                        <label key={item} className="flex items-center gap-3 py-2.5 border-b border-slate-border/40 last:border-0 cursor-pointer group">
                            <div className="relative">
                                <input type="checkbox" defaultChecked className="sr-only peer" />
                                <div className="w-9 h-5 rounded-full bg-slate-border peer-checked:bg-gold-primary transition-colors" />
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                            </div>
                            <Typography variant="body" className="text-sm">{item}</Typography>
                        </label>
                    ))}
                </section>

            </div>
        </div>
    )
}

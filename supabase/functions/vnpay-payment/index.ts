import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { jsonResponse, errorResponse, corsHeaders } from '../shared/types.ts'
import { format } from 'https://deno.land/std@0.168.0/datetime/mod.ts'

const VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'

// Helper for HMAC-SHA512
async function hmacSha512(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
    )
    const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        encoder.encode(message)
    )
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { plan_id, return_url } = await req.json()

        // 1. Resolve amount
        let amount = 0
        if (plan_id === 'pro') amount = 199000
        else if (plan_id === 'enterprise') amount = 999000
        else throw new Error('Invalid plan selection')

        // 2. VNPAY Config
        const tmnCode = Deno.env.get('VNPAY_TMN_CODE') || '2QXC69SY' // Sandbox demo
        const hashSecret = Deno.env.get('VNPAY_HASH_SECRET') || '88888888' // Sandbox demo

        const date = new Date()
        const createDate = format(date, 'yyyyMMddHHmmss')
        const ipAddr = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1'

        const params: Record<string, string> = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: tmnCode,
            vnp_Amount: (amount * 100).toString(), // VNPAY amount is x100
            vnp_CreateDate: createDate,
            vnp_CurrCode: 'VND',
            vnp_IpAddr: ipAddr,
            vnp_Locale: 'vn',
            vnp_OrderInfo: `Thanh toan LegalShield goi ${plan_id}`,
            vnp_OrderType: 'other',
            vnp_ReturnUrl: return_url,
            vnp_TxnRef: Date.now().toString(),
        }

        // 3. Sort params alphabetically
        const sortedKeys = Object.keys(params).sort()
        const signData = sortedKeys
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&')

        // 4. Generate secure hash
        const secureHash = await hmacSha512(hashSecret, signData)

        // 5. Build final URL
        const query = sortedKeys
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&')

        const checkout_url = `${VNPAY_URL}?${query}&vnp_SecureHash=${secureHash}`

        return jsonResponse({ checkout_url })

    } catch (err) {
        return errorResponse(err.message)
    }
})

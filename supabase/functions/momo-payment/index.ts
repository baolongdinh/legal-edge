import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { jsonResponse, errorResponse, corsHeaders } from '../shared/types.ts'

const MOMO_ENDPOINT = 'https://test-payment.momo.vn/v2/gateway/api/create'

// Helper for HMAC-SHA256
async function hmacSha256(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
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
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return errorResponse('Missing Authorization', 401)

        const supabaseAuth = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
        if (authError || !user) return errorResponse('Unauthorized', 401)

        const { plan_id, redirect_url, ipn_url } = await req.json()

        // 1. Resolve amount based on plan (Real values should come from DB or config)
        let amount = 0
        let orderInfo = ''
        if (plan_id === 'pro') {
            amount = 199000 // 199k VND
            orderInfo = 'LegalShield Pro - Monthly'
        } else if (plan_id === 'enterprise') {
            amount = 999000 // 999k VND
            orderInfo = 'LegalShield Enterprise - Monthly'
        } else {
            throw new Error('Invalid plan selection')
        }

        // 2. Load MoMo credentials from secrets
        const partnerCode = Deno.env.get('MOMO_PARTNER_CODE') || 'MOMOBKUN20180810' // Default sandbox test
        const accessKey = Deno.env.get('MOMO_ACCESS_KEY') || 'WMLB9772WhINCerx'
        const secretKey = Deno.env.get('MOMO_SECRET_KEY') || 'qSMC0WnmW6x943iC2Oka382EAtKThB7i'

        const orderId = `${partnerCode}-${Date.now()}`
        const requestId = orderId
        const requestType = 'captureWallet'
        const extraData = '' // Base64 encoded if needed

        // 3. Create raw signature string (Order of fields MATTERS)
        const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipn_url}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirect_url}&requestId=${requestId}&requestType=${requestType}`
        const signature = await hmacSha256(secretKey, rawSignature)

        // Pre-create pending transaction
        const supabaseService = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        const { error: txError } = await supabaseService.from('transactions').insert({
            user_id: user.id,
            order_id: orderId,
            provider: 'momo',
            amount,
            status: 'pending'
        })
        if (txError) throw new Error('Failed to track transaction: ' + txError.message)

        // 4. Request to MoMo
        const payload = {
            partnerCode,
            partnerName: 'LegalShield',
            storeId: 'LegalShield_Store',
            requestId,
            amount,
            orderId,
            orderInfo,
            redirectUrl: redirect_url,
            ipnUrl: ipn_url,
            lang: 'vi',
            extraData,
            requestType,
            signature,
        }

        const res = await fetch(MOMO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        const result = await res.json()
        if (result.resultCode !== 0) {
            throw new Error(`MoMo Error: ${result.message} (code: ${result.resultCode})`)
        }

        return jsonResponse({ checkout_url: result.payUrl })

    } catch (err) {
        return errorResponse(err.message)
    }
})

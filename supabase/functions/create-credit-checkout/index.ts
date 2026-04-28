// Edge Function: POST /functions/v1/create-credit-checkout
// Creates checkout session for credit packages (VNPay/Momo)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, corsHeaders, errorResponse, jsonResponse, authenticateRequest } from '../shared/types.ts'

// Generate unique order ID
function generateOrderId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `CREDIT_${timestamp}_${random}`.toUpperCase()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user } = await authenticateRequest(req)
    
    // @ts-ignore: Deno global
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-ignore: Deno global
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(url, key)

    const { package_id, payment_method, return_url } = await req.json()
    
    if (!package_id) {
      return errorResponse('Missing package_id', 400)
    }
    
    if (!['vnpay', 'momo'].includes(payment_method)) {
      return errorResponse('Invalid payment_method. Use vnpay or momo', 400)
    }

    // Get package details
    const { data: pkg, error: pkgError } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('id', package_id)
      .eq('is_active', true)
      .single()

    if (pkgError || !pkg) {
      return errorResponse('Credit package not found', 404)
    }

    // Generate order ID
    const orderId = generateOrderId()
    
    // Create pending transaction record
    const { error: txError } = await supabase.from('credit_transactions').insert({
      user_id: user.id,
      amount: pkg.credits + pkg.bonus_credits,
      operation_type: 'topup:pending',
      metadata: {
        order_id: orderId,
        package_id: package_id,
        package_name: pkg.name,
        price_vnd: pkg.price_vnd,
        credits: pkg.credits,
        bonus_credits: pkg.bonus_credits,
        payment_method: payment_method,
        status: 'pending'
      },
      created_at: new Date().toISOString()
    })

    if (txError) {
      console.error('[create-credit-checkout] Transaction error:', txError)
      return errorResponse('Failed to create transaction', 500)
    }

    // Prepare payment URL based on method
    let paymentUrl: string
    
    if (payment_method === 'vnpay') {
      // VNPay integration
      const vnpayParams = await createVNPayPayment(orderId, pkg.price_vnd, return_url)
      paymentUrl = vnpayParams.paymentUrl
    } else {
      // Momo integration
      const momoParams = await createMomoPayment(orderId, pkg.price_vnd, return_url)
      paymentUrl = momoParams.paymentUrl
    }

    return jsonResponse({
      order_id: orderId,
      package: {
        id: pkg.id,
        name: pkg.name,
        price_vnd: pkg.price_vnd,
        credits: pkg.credits,
        bonus_credits: pkg.bonus_credits,
        total_credits: pkg.credits + pkg.bonus_credits
      },
      payment_method,
      payment_url: paymentUrl,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min expiry
    }, 200)

  } catch (err) {
    console.error('[create-credit-checkout] Error:', err)
    return errorResponse((err as Error).message, 500)
  }
})

// VNPay payment creation (simplified - implement full VNPay protocol)
async function createVNPayPayment(orderId: string, amount: number, returnUrl?: string): Promise<{ paymentUrl: string }> {
  // @ts-ignore: Deno global
  const vnpayUrl = Deno.env.get('VNPAY_PAYMENT_URL')
  // @ts-ignore: Deno global
  const tmnCode = Deno.env.get('VNPAY_TMN_CODE')
  // @ts-ignore: Deno global
  const secretKey = Deno.env.get('VNPAY_SECRET_KEY')
  
  if (!vnpayUrl || !tmnCode || !secretKey) {
    throw new Error('VNPay not configured')
  }

  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId,
    vnp_OrderInfo: `Nap credits LegalShield - ${orderId}`,
    vnp_OrderType: '250000', // Other
    vnp_Amount: (amount * 100).toString(), // VNPay expects amount * 100
    vnp_ReturnUrl: returnUrl || Deno.env.get('VNPAY_RETURN_URL') || 'https://app.legalshield.vn/payment/callback',
    vnp_IpAddr: '127.0.0.1',
    vnp_CreateDate: new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14),
  }

  // Sort params and create signature
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key]
    return acc
  }, {} as Record<string, string>)

  const signData = Object.entries(sortedParams)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  // Create HMAC SHA512 signature
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signData))
  const vnp_SecureHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const paymentUrl = `${vnpayUrl}?${signData}&vnp_SecureHash=${vnp_SecureHash}`

  return { paymentUrl }
}

// Momo payment creation (simplified - implement full Momo protocol)
async function createMomoPayment(orderId: string, amount: number, returnUrl?: string): Promise<{ paymentUrl: string }> {
  // @ts-ignore: Deno global
  const momoEndpoint = Deno.env.get('MOMO_ENDPOINT')
  // @ts-ignore: Deno global
  const partnerCode = Deno.env.get('MOMO_PARTNER_CODE')
  // @ts-ignore: Deno global
  const accessKey = Deno.env.get('MOMO_ACCESS_KEY')
  // @ts-ignore: Deno global
  const secretKey = Deno.env.get('MOMO_SECRET_KEY')
  
  if (!momoEndpoint || !partnerCode || !accessKey || !secretKey) {
    throw new Error('Momo not configured')
  }

  const requestId = `${orderId}_${Date.now()}`
  const orderInfo = `Nap credits LegalShield - ${orderId}`
  const redirectUrl = returnUrl || Deno.env.get('MOMO_RETURN_URL') || 'https://app.legalshield.vn/payment/callback'
  const ipnUrl = Deno.env.get('MOMO_IPN_URL') || 'https://app.legalshield.vn/api/webhook/momo'

  const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=captureWallet`

  // Create HMAC SHA256 signature
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawSignature))
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const requestBody = {
    partnerCode,
    accessKey,
    requestId,
    amount: amount.toString(),
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    requestType: 'captureWallet',
    extraData: '',
    signature: signatureHex,
    lang: 'vi'
  }

  const response = await fetch(momoEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  const data = await response.json()
  
  if (data.resultCode !== 0) {
    throw new Error(`Momo error: ${data.message}`)
  }

  return { paymentUrl: data.payUrl }
}

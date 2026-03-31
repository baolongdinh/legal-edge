import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { jsonResponse, errorResponse, corsHeaders } from '../shared/types.ts'

export const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const provider = url.searchParams.get('provider')

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    try {
        let orderId = ''
        let isSuccess = false

        if (provider === 'momo') {
            const body = await req.json()
            console.log('[Webhook] MoMo:', body)
            orderId = body.orderId
            isSuccess = body.resultCode === 0
        } else if (provider === 'vnpay') {
            const params = Object.fromEntries(url.searchParams.entries())
            console.log('[Webhook] VNPay:', params)
            orderId = params['vnp_TxnRef']
            isSuccess = params['vnp_ResponseCode'] === '00'
        } else {
            return errorResponse('Unknown provider')
        }

        if (!orderId) return errorResponse('Missing order ID')

        // 1. Fetch transaction
        const { data: tx, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('order_id', orderId)
            .single()

        if (txError || !tx) {
            console.error('Transaction not found:', orderId)
            return jsonResponse({ message: 'Transaction not found, skipping' })
        }

        // 2. Idempotency Check
        if (tx.status === 'success') {
            console.log('Transaction already processed:', orderId)
            return jsonResponse({ message: 'Idempotent - already processed' })
        }

        // 3. Process Success
        if (isSuccess) {
            // Mark transaction success
            await supabase
                .from('transactions')
                .update({ status: 'success', ipn_received_at: new Date().toISOString() })
                .eq('order_id', orderId)

            // Derive plan from amount
            const plan = tx.amount === 999000 ? 'enterprise' : 'pro'
            const limit = plan === 'enterprise' ? 999999 : 500

            // Apply to subscriptions
            const validUntil = new Date()
            validUntil.setMonth(validUntil.getMonth() + 1)

            const { error: subErr } = await supabase
                .from('subscriptions')
                .upsert({
                    user_id: tx.user_id,
                    plan: plan,
                    api_calls_limit: limit,
                    valid_until: validUntil.toISOString()
                }, { onConflict: 'user_id' })

            if (subErr) console.error('Subscription update failed:', subErr)
        } else {
            // Mark failed
            await supabase
                .from('transactions')
                .update({ status: 'failed', ipn_received_at: new Date().toISOString() })
                .eq('order_id', orderId)
        }

        // Return 200 for the Gateway
        if (provider === 'vnpay') {
            return jsonResponse({ RspCode: '00', Message: 'Confirm Success' })
        } else {
            return jsonResponse({ message: 'Webhook Processed' })
        }

    } catch (err: any) {
        return errorResponse(err.message)
    }
}

serve(handler)

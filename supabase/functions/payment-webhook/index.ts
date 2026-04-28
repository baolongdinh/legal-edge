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

        // 1. Check if this is a credit purchase (orderId starts with CREDIT_)
        const isCreditPurchase = orderId.startsWith('CREDIT_')
        
        if (isCreditPurchase) {
            return await handleCreditPurchase(supabase, orderId, isSuccess, provider)
        }
        
        // 2. Fetch subscription transaction
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

// Handle credit purchase payment completion
async function handleCreditPurchase(
    supabase: any,
    orderId: string,
    isSuccess: boolean,
    provider: string
): Promise<Response> {
    console.log(`[Credit Webhook] Processing credit purchase: ${orderId}, success: ${isSuccess}`)
    
    // Find the pending credit transaction
    const { data: tx, error: txError } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('metadata->>order_id', orderId)
        .eq('operation_type', 'topup:pending')
        .single()
    
    if (txError || !tx) {
        console.error('[Credit Webhook] Transaction not found:', orderId)
        return jsonResponse({ message: 'Transaction not found' })
    }
    
    // Idempotency check
    if (tx.metadata?.status === 'completed') {
        console.log('[Credit Webhook] Already processed:', orderId)
        return jsonResponse({ message: 'Already processed' })
    }
    
    if (isSuccess) {
        const credits = tx.amount
        const userId = tx.user_id
        
        // Update transaction status
        await supabase
            .from('credit_transactions')
            .update({
                operation_type: 'topup',
                metadata: {
                    ...tx.metadata,
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    provider
                }
            })
            .eq('id', tx.id)
        
        // Add credits to user balance
        const { data: current } = await supabase
            .from('user_credits')
            .select('balance, lifetime_earned')
            .eq('user_id', userId)
            .single()
        
        const newBalance = (current?.balance || 0) + credits
        const newLifetimeEarned = (current?.lifetime_earned || 0) + credits
        
        await supabase
            .from('user_credits')
            .upsert({
                user_id: userId,
                balance: newBalance,
                lifetime_earned: newLifetimeEarned,
                updated_at: new Date().toISOString()
            })
        
        console.log(`[Credit Webhook] Added ${credits} credits to user ${userId}. New balance: ${newBalance}`)
    } else {
        // Mark as failed
        await supabase
            .from('credit_transactions')
            .update({
                metadata: {
                    ...tx.metadata,
                    status: 'failed',
                    failed_at: new Date().toISOString()
                }
            })
            .eq('id', tx.id)
        
        console.log('[Credit Webhook] Payment failed for:', orderId)
    }
    
    // Return appropriate response
    if (provider === 'vnpay') {
        return jsonResponse({ RspCode: '00', Message: 'Confirm Success' })
    }
    return jsonResponse({ message: 'Webhook Processed' })
}

serve(handler)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { jsonResponse, errorResponse, corsHeaders } from '../shared/types.ts'

serve(async (req) => {
    // Both MoMo and VNPAY send POST or GET hits for IPN
    // We'll use a query param 'provider' to distinguish
    const url = new URL(req.url)
    const provider = url.searchParams.get('provider')

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    try {
        if (provider === 'momo') {
            const body = await req.json()
            console.log('[Webhook] MoMo IPN:', body)

            // Signature verification should happen here in production!
            // For now, if resultCode is 0, we treat it as paid
            if (body.resultCode === 0) {
                // Update subscription status in DB
                // Need to recover user_id from extraData or externalId
                // ...
            }
            return jsonResponse({ message: 'MoMo IPN Received' })
        }

        if (provider === 'vnpay') {
            const params = Object.fromEntries(url.searchParams.entries())
            console.log('[Webhook] VNPAY IPN:', params)

            if (params['vnp_ResponseCode'] === '00') {
                // Success
            }
            return jsonResponse({ RspCode: '00', Message: 'Confirm Success' })
        }

        return errorResponse('Unknown provider')

    } catch (err) {
        return errorResponse(err.message)
    }
})

// Edge Function: POST /functions/v1/create-checkout-session
// Creates a Stripe Checkout session for plan upgrades (Pro/Enterprise)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { corsHeaders, errorResponse, jsonResponse } from '../shared/types.ts'

// Price IDs configured in Stripe Dashboard
const PRICE_IDS: Record<string, string> = {
    pro_monthly: Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') ?? '',
    enterprise_monthly: Deno.env.get('STRIPE_PRICE_ENTERPRISE_MONTHLY') ?? '',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return errorResponse('Missing Authorization', 401)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return errorResponse('Unauthorized', 401)

        const { plan_id, success_url, cancel_url } = await req.json()
        const priceId = PRICE_IDS[plan_id]
        if (!priceId) return errorResponse(`Unknown plan_id: ${plan_id}`, 400)

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: user.email,
            client_reference_id: user.id,
            success_url: success_url ?? 'https://app.legalshield.vn/dashboard?success=true',
            cancel_url: cancel_url ?? 'https://app.legalshield.vn/pricing?canceled=true',
            metadata: { user_id: user.id, plan_id },
        })

        return jsonResponse({ checkout_url: session.url })
    } catch (err) {
        return errorResponse((err as Error).message)
    }
})

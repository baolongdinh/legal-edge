// Edge Function: GET /functions/v1/get-credit-packages
// Returns available credit packages for purchase

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, corsHeaders, errorResponse, jsonResponse } from '../shared/types.ts'

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  
  try {
    // @ts-ignore: Deno global
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-ignore: Deno global
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(url, key)
    
    // Get active credit packages
    const { data: packages, error } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    
    if (error) {
      console.error('[get-credit-packages] Error:', error)
      return errorResponse('Failed to fetch credit packages', 500)
    }
    
    // Format packages with additional info
    const formattedPackages = packages.map((pkg: any) => ({
      id: pkg.id,
      name: pkg.name,
      price_vnd: pkg.price_vnd,
      credits: pkg.credits,
      bonus_credits: pkg.bonus_credits,
      total_credits: pkg.credits + pkg.bonus_credits,
      price_per_credit: Math.round(pkg.price_vnd / (pkg.credits + pkg.bonus_credits)),
      savings_percent: pkg.bonus_credits > 0 
        ? Math.round((pkg.bonus_credits / (pkg.credits + pkg.bonus_credits)) * 100)
        : 0
    }))
    
    return jsonResponse({
      packages: formattedPackages,
      currency: 'VND',
      payment_methods: ['vnpay', 'momo']
    }, 200)
    
  } catch (err) {
    console.error('[get-credit-packages] Error:', err)
    return errorResponse('Internal server error', 500)
  }
}

serve(handler)

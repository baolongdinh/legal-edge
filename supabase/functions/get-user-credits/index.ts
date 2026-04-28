// Edge Function: GET /functions/v1/get-user-credits
// Returns current user's credit balance and usage stats

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, corsHeaders, errorResponse, jsonResponse, authenticateRequest } from '../shared/types.ts'

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  
  try {
    const { user } = await authenticateRequest(req)
    
    // @ts-ignore: Deno global
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-ignore: Deno global
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(url, key)
    
    // Get user credits
    const { data: credits, error: creditsError } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', user.id)
      .single()
    
    if (creditsError && creditsError.code !== 'PGRST116') {
      console.error('[get-user-credits] Error:', creditsError)
      return errorResponse('Failed to fetch credits', 500)
    }
    
    // Get recent transactions (last 10)
    const { data: transactions, error: txError } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (txError) {
      console.error('[get-user-credits] Transaction error:', txError)
    }
    
    // Get usage stats (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data: usageStats, error: usageError } = await supabase
      .from('credit_usage_logs')
      .select('credits_charged, created_at')
      .eq('user_id', user.id)
      .gte('created_at', thirtyDaysAgo.toISOString())
    
    if (usageError) {
      console.error('[get-user-credits] Usage error:', usageError)
    }
    
    const totalUsed30d = usageStats?.reduce((sum: number, log: any) => sum + (log.credits_charged || 0), 0) || 0
    
    return jsonResponse({
      balance: credits?.balance || 0,
      lifetime_earned: credits?.lifetime_earned || 0,
      lifetime_spent: credits?.lifetime_spent || 0,
      recent_transactions: (transactions || []).map((tx: any) => ({
        id: tx.id,
        amount: tx.amount,
        type: tx.operation_type,
        created_at: tx.created_at,
        metadata: tx.metadata
      })),
      usage_stats: {
        last_30_days: {
          total_credits_used: totalUsed30d,
          request_count: usageStats?.length || 0
        }
      },
      warning_level: getWarningLevel(credits?.balance || 0)
    }, 200)
    
  } catch (err) {
    console.error('[get-user-credits] Error:', err)
    return errorResponse('Internal server error', 500)
  }
}

function getWarningLevel(balance: number): 'none' | 'low' | 'critical' {
  if (balance < 10) return 'critical'
  if (balance < 50) return 'low'
  return 'none'
}

serve(handler)

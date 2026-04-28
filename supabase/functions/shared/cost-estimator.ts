/**
 * Cost Estimation Engine
 * Estimates API costs and credit requirements for operations
 */

import { IntentEvaluation } from './types.ts'

export interface CostEstimate {
  estimatedCredits: number
  maxCredits: number // Hard limit
  breakdown: CostBreakdown
  reasoning: string
}

export interface CostBreakdown {
  intentEval: number
  hydeGeneration: number
  evidenceRetrieval: number
  llmResponse: number
  visionOcr: number
}

// Credit costs per operation (in credits)
const CREDIT_COSTS = {
  INTENT_EVAL: 0.5, // Simple LLM call
  STANDALONE_QUERY: 0.5,
  HYDE_GENERATION: 1,
  EXA_SEARCH: 2,
  JINA_RERANK: 0.5,
  TITLE_GENERATION: 0.5,
  LLM_SIMPLE: 1, // Simple chat
  LLM_MEDIUM: 2, // With context
  LLM_COMPLEX: 3, // Full pipeline
  VISION_OCR: 2, // Image processing
}

/**
 * Estimate cost for a chat request
 */
export function estimateChatCost(
  intent: IntentEvaluation,
  options: {
    hasDocument: boolean
    hasVision: boolean
    historyLength: number
    needsHyDE: boolean
    needsExa: boolean
    complexity: 'low' | 'medium' | 'high'
  }
): CostEstimate {
  const { hasDocument, hasVision, needsHyDE, needsExa, complexity } = options
  
  const breakdown: CostBreakdown = {
    intentEval: CREDIT_COSTS.INTENT_EVAL,
    hydeGeneration: needsHyDE ? CREDIT_COSTS.HYDE_GENERATION : 0,
    evidenceRetrieval: needsExa ? CREDIT_COSTS.EXA_SEARCH + CREDIT_COSTS.JINA_RERANK : 0,
    llmResponse: 0,
    visionOcr: hasVision ? CREDIT_COSTS.VISION_OCR : 0,
  }
  
  // Calculate LLM response cost
  if (complexity === 'low' && !hasDocument && !hasVision) {
    breakdown.llmResponse = CREDIT_COSTS.LLM_SIMPLE
  } else if (complexity === 'medium' || hasDocument || hasVision) {
    breakdown.llmResponse = CREDIT_COSTS.LLM_MEDIUM
  } else {
    breakdown.llmResponse = CREDIT_COSTS.LLM_COMPLEX
  }
  
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
  
  // Add buffer for variable costs
  const estimatedCredits = Math.ceil(total)
  const maxCredits = Math.ceil(total * 1.5) // 50% buffer
  
  return {
    estimatedCredits,
    maxCredits,
    breakdown,
    reasoning: generateReasoning(intent, options),
  }
}

/**
 * Estimate cost for contract analysis
 */
export function estimateContractAnalysisCost(
  contractLength: number,
  hasRiskAnalysis: boolean
): CostEstimate {
  // Base cost for parsing
  let baseCost = 2
  
  // Add cost based on contract length
  if (contractLength > 10000) baseCost += 2
  else if (contractLength > 5000) baseCost += 1
  
  // Risk analysis cost
  const riskCost = hasRiskAnalysis ? 3 : 0
  
  const estimatedCredits = baseCost + riskCost
  
  return {
    estimatedCredits,
    maxCredits: estimatedCredits + 2,
    breakdown: {
      intentEval: 0,
      hydeGeneration: 0,
      evidenceRetrieval: 0,
      llmResponse: estimatedCredits,
      visionOcr: 0,
    },
    reasoning: `Contract analysis: ${contractLength} chars, risk analysis: ${hasRiskAnalysis}`,
  }
}

interface EstimateOptions {
  hasDocument: boolean
  hasVision: boolean
  historyLength: number
  needsHyDE: boolean
  needsExa: boolean
  complexity: 'low' | 'medium' | 'high'
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  intent: IntentEvaluation,
  options: EstimateOptions
): string {
  const parts: string[] = []
  
  if (options.complexity === 'low') {
    parts.push('Simple question')
  } else if (options.complexity === 'medium') {
    parts.push('Medium complexity')
  } else {
    parts.push('High complexity')
  }
  
  if (options.hasDocument) parts.push('with document')
  if (options.hasVision) parts.push('with image')
  if (intent.is_drafting) parts.push('drafting mode')
  if (intent.needs_citations) parts.push('with citations')
  
  return parts.join(', ')
}

/**
 * Check if user has enough credits
 */
export async function hasEnoughCredits(
  supabase: any,
  userId: string,
  requiredCredits: number
): Promise<{ sufficient: boolean; currentBalance: number; deficit: number }> {
  const { data, error } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single()
  
  if (error) {
    console.error('[CostEstimator] Failed to check credits:', error)
    // Allow operation if we can't check (fail open for now)
    return { sufficient: true, currentBalance: 0, deficit: 0 }
  }
  
  const currentBalance = data?.balance || 0
  const sufficient = currentBalance >= requiredCredits
  
  return {
    sufficient,
    currentBalance,
    deficit: sufficient ? 0 : requiredCredits - currentBalance,
  }
}

/**
 * Deduct credits from user account
 */
export async function deductCredits(
  supabase: any,
  userId: string,
  credits: number,
  operation: string,
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  try {
    // Start transaction
    const { data: current, error: fetchError } = await supabase
      .from('user_credits')
      .select('balance, lifetime_spent')
      .eq('user_id', userId)
      .single()
    
    if (fetchError) throw fetchError
    
    const newBalance = (current?.balance || 0) - credits
    const newLifetimeSpent = (current?.lifetime_spent || 0) + credits
    
    if (newBalance < 0) {
      return { success: false, newBalance: current?.balance || 0, error: 'Insufficient credits' }
    }
    
    // Update balance
    const { error: updateError } = await supabase
      .from('user_credits')
      .update({
        balance: newBalance,
        lifetime_spent: newLifetimeSpent,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    
    if (updateError) throw updateError
    
    // Log transaction
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: -credits,
      operation_type: operation,
      metadata,
      created_at: new Date().toISOString(),
    })
    
    return { success: true, newBalance }
  } catch (error) {
    console.error('[CostEstimator] Failed to deduct credits:', error)
    return { success: false, newBalance: 0, error: (error as Error).message }
  }
}

/**
 * Refund credits if actual cost was lower than estimated
 */
export async function refundExcessCredits(
  supabase: any,
  userId: string,
  estimatedCredits: number,
  actualCredits: number,
  operation: string
): Promise<void> {
  if (actualCredits >= estimatedCredits) return
  
  const refund = estimatedCredits - actualCredits
  
  try {
    const { data: current } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .single()
    
    const newBalance = (current?.balance || 0) + refund
    
    await supabase
      .from('user_credits')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    
    // Log refund transaction
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: refund,
      operation_type: `${operation}:refund`,
      metadata: { reason: 'Actual cost lower than estimated' },
      created_at: new Date().toISOString(),
    })
    
    console.log(`[CostEstimator] Refunded ${refund} credits to ${userId}`)
  } catch (error) {
    console.error('[CostEstimator] Failed to refund credits:', error)
  }
}

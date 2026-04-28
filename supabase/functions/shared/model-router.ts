/**
 * Smart Model Router with Fallback
 * Routes requests to optimal models based on complexity and cost
 * Ensures fallback to reliable models on failure
 */

import { callLLM } from './types.ts'

export type ModelTier = 'fast' | 'balanced' | 'powerful'
export type ModelProvider = 'groq' | 'gemini' | 'openrouter'

export interface ModelConfig {
  id: string
  provider: ModelProvider
  tier: ModelTier
  costPer1KTokens: number // USD
  maxTokens: number
  reliability: number // 0-1
  fallbackTo?: string // Model ID to fallback
}

// Model definitions - ordered by reliability and cost
const MODELS: Record<string, ModelConfig> = {
  // Fast tier - cheapest, for simple tasks
  'llama-3.1-8b': {
    id: 'llama-3.1-8b',
    provider: 'groq',
    tier: 'fast',
    costPer1KTokens: 0.0001,
    maxTokens: 8192,
    reliability: 0.85,
    fallbackTo: 'gemini-2.5-flash-lite',
  },
  
  // Balanced tier - Gemini Flash Lite (most reliable)
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    tier: 'balanced',
    costPer1KTokens: 0.0003, // ~$0.30 per 1M tokens
    maxTokens: 8192,
    reliability: 0.98,
    fallbackTo: 'gemini-2.5-flash',
  },
  
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    tier: 'balanced',
    costPer1KTokens: 0.0006,
    maxTokens: 8192,
    reliability: 0.95,
    fallbackTo: 'gemini-2.5-pro',
  },
  
  // Powerful tier - for complex tasks
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    tier: 'powerful',
    costPer1KTokens: 0.002,
    maxTokens: 32768,
    reliability: 0.96,
    fallbackTo: undefined, // Last resort
  },
}

export interface RoutingDecision {
  modelId: string
  estimatedCost: number
  reason: string
  fallbackChain: string[]
}

export interface ComplexityMetrics {
  messageLength: number
  hasDocument: boolean
  hasVision: boolean
  historyLength: number
  needsCitation: boolean
  isDrafting: boolean
}

/**
 * Analyze complexity and route to optimal model
 */
export function routeByComplexity(
  complexity: 'low' | 'medium' | 'high',
  metrics: ComplexityMetrics
): RoutingDecision {
  const { messageLength, hasDocument, hasVision, needsCitation, isDrafting } = metrics
  
  // Simple standalone question -> Fast tier (Groq)
  if (
    complexity === 'low' &&
    messageLength < 150 &&
    !hasDocument &&
    !hasVision &&
    !needsCitation &&
    !isDrafting
  ) {
    return {
      modelId: 'llama-3.1-8b',
      estimatedCost: 0.0001,
      reason: 'Simple question - routing to cheapest model',
      fallbackChain: ['llama-3.1-8b', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    }
  }
  
  // Medium complexity or has attachments -> Balanced tier (Gemini Flash Lite)
  if (
    complexity === 'medium' ||
    hasDocument ||
    hasVision
  ) {
    return {
      modelId: 'gemini-2.5-flash-lite',
      estimatedCost: 0.0005,
      reason: 'Medium complexity or has attachments - using reliable Gemini Flash Lite',
      fallbackChain: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    }
  }
  
  // High complexity, drafting, or citations needed -> Powerful tier
  return {
    modelId: 'gemini-2.5-flash-lite', // Still use Flash Lite as primary for reliability
    estimatedCost: 0.001,
    reason: 'High complexity - using Gemini Flash Lite with full pipeline',
    fallbackChain: ['gemini-2.5-flash-lite', 'gemini-2.5-pro'],
  }
}

/**
 * Execute LLM call with automatic fallback
 */
export async function callWithFallback(
  messages: { role: string; content: string }[],
  routing: RoutingDecision,
  options: {
    temperature?: number
    maxTokens?: number
    jsonMode?: boolean
  } = {}
): Promise<{ content: string; modelUsed: string; actualCost: number; attempts: number }> {
  const fallbackChain = routing.fallbackChain
  let lastError: Error | undefined
  
  for (let i = 0; i < fallbackChain.length; i++) {
    const modelId = fallbackChain[i]
    const model = MODELS[modelId]
    
    if (!model) {
      console.warn(`[ModelRouter] Unknown model: ${modelId}, skipping`)
      continue
    }
    
    try {
      console.log(`[ModelRouter] Attempt ${i + 1}/${fallbackChain.length}: ${modelId}`)
      
      const startTime = Date.now()
      let content: string
      
      // Route to appropriate provider
      if (model.provider === 'groq') {
        content = await callGroq(messages, { ...options, model: modelId })
      } else if (model.provider === 'gemini') {
        content = await callGemini(messages, { ...options, model: modelId })
      } else {
        throw new Error(`Unknown provider: ${model.provider}`)
      }
      
      const latency = Date.now() - startTime
      console.log(`[ModelRouter] Success with ${modelId} in ${latency}ms`)
      
      // Estimate actual cost based on token count
      const estimatedTokens = estimateTokens(content)
      const actualCost = (estimatedTokens / 1000) * model.costPer1KTokens
      
      return {
        content,
        modelUsed: modelId,
        actualCost,
        attempts: i + 1,
      }
    } catch (error) {
      lastError = error as Error
      console.warn(`[ModelRouter] ${modelId} failed:`, (error as Error).message)
      
      // Continue to next fallback
      if (i < fallbackChain.length - 1) {
        console.log(`[ModelRouter] Falling back to ${fallbackChain[i + 1]}`)
      }
    }
  }
  
  // All fallbacks exhausted
  throw new Error(
    `All models in fallback chain failed. Last error: ${lastError?.message}`
  )
}

/**
 * Call Groq API
 */
async function callGroq(
  messages: { role: string; content: string }[],
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean; model?: string }
): Promise<string> {
  const model = options.model || 'llama-3.1-8b'
  
  // @ts-ignore: Deno global
  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured')
  }
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role as any, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Groq API error: ${error}`)
  }
  
  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

/**
 * Call Gemini API
 */
async function callGemini(
  messages: { role: string; content: string }[],
  options: { temperature?: number; maxTokens?: number; model?: string }
): Promise<string> {
  const model = options.model || 'gemini-2.5-flash-lite'
  
  // @ts-ignore: Deno global
  const apiKeys = Deno.env.get('GEMINI_API_KEYS')?.split(',') || []
  const fallbackKey = Deno.env.get('GEMINI_API_KEY')
  
  const keys = apiKeys.length > 0 ? apiKeys : fallbackKey ? [fallbackKey] : []
  
  if (keys.length === 0) {
    throw new Error('No Gemini API keys configured')
  }
  
  // Try keys in rotation
  for (const apiKey of keys) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 2048,
          },
        }),
      })
      
      if (!response.ok) {
        if (response.status === 429) continue // Try next key
        throw new Error(`Gemini API error: ${await response.text()}`)
      }
      
      const data = await response.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } catch (error) {
      console.warn(`[Gemini] Key failed:`, (error as Error).message)
      continue
    }
  }
  
  throw new Error('All Gemini API keys exhausted')
}

/**
 * Estimate token count from text
 */
function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English/Vietnamese
  return Math.ceil(text.length / 4)
}

/**
 * Quick response for simple questions (no fallback needed)
 */
export async function quickResponse(
  message: string,
  systemPrompt?: string
): Promise<{ content: string; cost: number }> {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: message },
  ]
  
  const result = await callWithFallback(
    messages,
    {
      modelId: 'llama-3.1-8b',
      estimatedCost: 0.0001,
      reason: 'Quick response path',
      fallbackChain: ['llama-3.1-8b', 'gemini-2.5-flash-lite'],
    },
    { temperature: 0.7, maxTokens: 512 }
  )
  
  return { content: result.content, cost: result.actualCost }
}

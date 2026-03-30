// Edge Function: POST /functions/v1/risk-review
// Analyzes contract text for risky clauses using Groq (llama-3-70b-8192)
// and returns structured JSON with level, clause_ref, description, citation.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, errorResponse, jsonResponse, roundRobinKey, embedText } from '../shared/types.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clause_text, contract_context, mode = 'fast' } = await req.json()
    if (!clause_text) return errorResponse('Missing clause_text', 400)

    const geminiKeys = roundRobinKey('GEMINI_API_KEYS', 'GEMINI_API_KEY')
    const groqKey = roundRobinKey('GROQ_API_KEYS', 'GROQ_API_KEY')
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Semantic Cache Check (Only for 'fast' mode or repetitive clauses)
    const embedding = await embedText(clause_text, geminiKeys)
    const { data: cacheMatch } = await supabaseClient.rpc('find_semantic_match', {
      p_embedding: embedding,
      p_threshold: 0.05 // Very high similarity
    })

    if (cacheMatch && cacheMatch.length > 0) {
      console.log('Semantic Cache Hit!')
      return jsonResponse({ ...cacheMatch[0].result_json, cached: true }, 200, 3600)
    }

    const systemPrompt = `Bạn là chuyên gia pháp lý Việt Nam. Phân tích điều khoản hợp đồng được cung cấp và trả về JSON hợp lệ với cấu trúc sau:
{
  "risks": [
    {
      "clause_ref": "Điều X.Y",
      "level": "critical|moderate|note",
      "description": "Mô tả ngắn gọn rủi ro bằng tiếng Việt",
      "citation": "Điều X Luật/Bộ luật năm YYYY"
    }
  ],
  "engine": "${mode === 'deep' ? 'llama' : 'gemini'}"
}
Chỉ trả về JSON, không giải thích thêm. Tham chiếu cụ thể theo Luật Thương mại 2005, BLDS 2015, Luật Lao động 2019 v.v.`

    let risks = { risks: [] }

    if (mode === 'fast') {
      const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKeys}`
      const geminiRes = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nNội dung cần phân tích:\n${clause_text}` }] }],
          generationConfig: { response_mime_type: "application/json" }
        })
      })
      if (!geminiRes.ok) throw new Error(`Gemini error: ${await geminiRes.text()}`)
      const gData = await geminiRes.json()
      risks = JSON.parse(gData.candidates[0].content.parts[0].text)
    } else {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3-70b-8192',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Bối cảnh: ${contract_context ?? ''}\n\nĐiều khoản cần phân tích:\n${clause_text}` },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) throw new Error(`Groq error: ${await res.text()}`)
      const { choices } = await res.json()
      risks = JSON.parse(choices[0].message.content)
    }

    // 2. Save to Semantic Cache
    await supabaseClient.from('semantic_cache').insert({
      content_text: clause_text,
      embedding: embedding,
      result_json: risks
    })

    return jsonResponse(risks, 200, 3600) // Cache for 1 hour
  } catch (err) {
    return errorResponse((err as Error).message)
  }
})

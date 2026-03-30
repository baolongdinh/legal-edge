// Edge Function: POST /functions/v1/risk-review
// Analyzes contract text for risky clauses using Groq (llama-3-70b-8192)
// and returns structured JSON with level, clause_ref, description, citation.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, errorResponse, jsonResponse, roundRobinKey } from '../shared/types.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clause_text, contract_context } = await req.json()
    if (!clause_text) return errorResponse('Missing clause_text', 400)

    const groqKey = roundRobinKey('GROQ_API_KEYS', 'GROQ_API_KEY')

    const systemPrompt = `Bạn là chuyên gia pháp lý Việt Nam. Phân tích điều khoản hợp đồng được cung cấp và trả về JSON hợp lệ với cấu trúc sau:
{
  "risks": [
    {
      "clause_ref": "Điều X.Y",
      "level": "critical|moderate|note",
      "description": "Mô tả ngắn gọn rủi ro bằng tiếng Việt",
      "citation": "Điều X Luật/Bộ luật năm YYYY"
    }
  ]
}
Chỉ trả về JSON, không giải thích thêm. Tham chiếu cụ thể theo Luật Thương mại 2005, BLDS 2015, Luật Lao động 2019 v.v.`

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
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) throw new Error(`Groq error: ${await res.text()}`)
    const { choices } = await res.json()
    const risks = JSON.parse(choices[0].message.content)

    return jsonResponse(risks, 200, 3600) // Cache for 1 hour
  } catch (err) {
    return errorResponse((err as Error).message)
  }
})

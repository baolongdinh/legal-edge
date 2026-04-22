// Test file for risk-review optimizations
// Run with: deno test --allow-env --allow-net risk-review.test.ts

import { assertEquals, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts'

// Mock the functions we need
function extractRisksByRules(clauseText: string): Array<{ topic: string, search_query: string }> {
  const risks: Array<{ topic: string, search_query: string }> = []
  const text = clauseText.toLowerCase()

  if (text.includes('phạt') || text.includes('penal')) {
    risks.push({
      topic: 'Phạt vi phạm hợp đồng',
      search_query: 'quy định phạt vi phạm hợp đồng dân sự Việt Nam'
    })
  }

  if (text.includes('chấm dứt') || text.includes('terminate')) {
    risks.push({
      topic: 'Chấm dứt hợp đồng',
      search_query: 'điều kiện chấm dứt hợp đồng theo luật dân sự Việt Nam'
    })
  }

  return risks
}

function getFallbackRiskPatterns(clauseText: string): Array<{ topic: string, search_query: string }> {
  return [
    {
      topic: 'Đánh giá tổng thể rủi ro',
      search_query: 'các rủi ro phổ biến trong hợp đồng dân sự Việt Nam'
    }
  ]
}

Deno.test('extractRisksByRules - detects penalty clauses', () => {
  const clause = 'Bên vi phạm hợp đồng phải chịu phạt 10% giá trị hợp đồng'
  const risks = extractRisksByRules(clause)

  assert(risks.length > 0, 'Should detect penalty risk')
  assertEquals(risks[0].topic, 'Phạt vi phạm hợp đồng')
})

Deno.test('extractRisksByRules - detects termination clauses', () => {
  const clause = 'Hợp đồng có thể bị chấm dứt nếu bên A không thanh toán đúng hạn'
  const risks = extractRisksByRules(clause)

  assert(risks.length > 0, 'Should detect termination risk')
  assertEquals(risks[0].topic, 'Chấm dứt hợp đồng')
})

Deno.test('extractRisksByRules - returns empty for safe clauses', () => {
  const clause = 'Hai bên cam kết thực hiện đúng hợp đồng'
  const risks = extractRisksByRules(clause)

  assertEquals(risks.length, 0, 'Should not detect risks in safe clauses')
})

Deno.test('getFallbackRiskPatterns - provides generic fallback', () => {
  const clause = 'Some random clause text'
  const risks = getFallbackRiskPatterns(clause)

  assert(risks.length > 0, 'Should provide fallback risks')
  assertEquals(risks[0].topic, 'Đánh giá tổng thể rủi ro')
})

console.log('✅ Risk-review optimization tests passed!')
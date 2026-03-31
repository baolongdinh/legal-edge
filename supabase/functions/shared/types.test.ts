import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts'

import {
  buildLegalAnswerPayload,
  type LegalSourceEvidence,
} from './types.ts'

function makeEvidence(overrides: Partial<LegalSourceEvidence> = {}): LegalSourceEvidence {
  return {
    title: 'Luật Thương mại 2005',
    url: 'https://vbpl.vn/mock',
    content: 'Điều 301 Luật Thương mại 2005 quy định mức phạt vi phạm không quá 8% giá trị phần nghĩa vụ hợp đồng bị vi phạm.',
    source_domain: 'vbpl.vn',
    source_type: 'official',
    retrieved_at: '2026-03-31T00:00:00.000Z',
    matched_article: 'điều 301',
    score: 120,
    ...overrides,
  }
}

Deno.test('buildLegalAnswerPayload returns official_verified when official evidence supports answer', () => {
  const payload = buildLegalAnswerPayload(
    'Theo Điều 301 Luật Thương mại 2005, mức phạt vi phạm tối đa là 8%.',
    [makeEvidence()],
    true,
  )

  assertEquals(payload.verification_status, 'official_verified')
  assertEquals(payload.citations.length, 1)
  assertEquals(payload.verification_summary.official_count, 1)
  assertEquals(payload.abstained, false)
  assertEquals(payload.claim_audit?.[0]?.supported, true)
})

Deno.test('buildLegalAnswerPayload returns secondary_verified when only secondary evidence exists', () => {
  const payload = buildLegalAnswerPayload(
    'Theo Điều 301 Luật Thương mại 2005, mức phạt vi phạm tối đa là 8%.',
    [makeEvidence({
      url: 'https://luatvietnam.vn/mock',
      source_domain: 'luatvietnam.vn',
      source_type: 'secondary',
    })],
    true,
  )

  assertEquals(payload.verification_status, 'secondary_verified')
  assertEquals(payload.verification_summary.secondary_count, 1)
  assertEquals(payload.abstained, false)
})

Deno.test('buildLegalAnswerPayload abstains when legal claim has no matching evidence', () => {
  const payload = buildLegalAnswerPayload(
    'Theo Điều 328 Bộ luật Dân sự 2015, bên vi phạm phải mất toàn bộ tiền đặt cọc.',
    [makeEvidence()],
    true,
  )

  assertEquals(payload.verification_status, 'unsupported')
  assertEquals(payload.abstained, true)
  assertEquals(payload.verification_summary.unsupported_claim_count, 1)
  assertEquals(payload.citations.length, 0)
})

Deno.test('buildLegalAnswerPayload marks conflicted when only part of answer is supported', () => {
  const payload = buildLegalAnswerPayload(
    'Theo Điều 301 Luật Thương mại 2005, mức phạt vi phạm tối đa là 8%. Ngoài ra Điều 328 Bộ luật Dân sự 2015 tự động áp dụng cho mọi tranh chấp thương mại.',
    [makeEvidence()],
    true,
  )

  assertEquals(payload.verification_status, 'conflicted')
  assertEquals(payload.abstained, false)
  assertExists(payload.claim_audit)
  assertEquals(payload.claim_audit?.some((claim) => claim.supported === false), true)
  assertEquals(payload.verification_summary.unsupported_claim_count, 1)
})
